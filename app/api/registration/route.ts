import bcrypt from "bcryptjs";
import { z } from "zod";
import { createPublicVoter, findOfficialDpt, getOfficialDptStatus, recordSecurityEvent } from "@/lib/db";
import { DUPLICATE_FACE_MESSAGE, findDuplicateFace } from "@/lib/face-duplicate";
import { namesMatch } from "@/lib/name-match";
import { encryptFaceDescriptor, normalizeFaceDescriptor, validateFaceEvidence } from "@/lib/face";
import {
  FACE_CHALLENGE_STEPS,
  FACE_DESCRIPTOR_ENGINES,
  FACE_ARCFACE_MODEL_VERSION,
  FACE_DEVICE_CLASSES,
  FACE_MODEL_VERSIONS,
  FACE_TEMPLATE_ROLES,
  expectedEngineForRole
} from "@/lib/face-types";
import { validateRegistrationAccessToken } from "@/lib/registration-access";
import { isSameOrigin, jsonError } from "@/lib/security";

const currentYear = new Date().getUTCFullYear();
const faceEvidenceSchema = z.object({
  startedAt: z.number().int().positive(),
  completedAt: z.number().int().positive(),
  completedSteps: z.array(z.enum(FACE_CHALLENGE_STEPS)).length(FACE_CHALLENGE_STEPS.length),
  sampleCount: z.number().int().positive(),
  averageReal: z.number().min(0).max(1),
  averageLive: z.number().min(0).max(1)
});

const faceCaptureSchema = z.object({
  templateRole: z.enum(FACE_TEMPLATE_ROLES),
  descriptorEngine: z.enum(FACE_DESCRIPTOR_ENGINES),
  modelVersion: z.enum(FACE_MODEL_VERSIONS),
  sourceDeviceClass: z.enum(FACE_DEVICE_CLASSES),
  embedding: z.array(z.number()).length(1024),
  challengeToken: z.string().min(20).max(4096),
  evidence: faceEvidenceSchema
});

const registrationSchema = z.object({
  accessToken: z.string().min(20).max(4096),
  userId: z.string().trim().min(5, "NPM/NIM minimal 5 karakter.").max(64)
    .regex(/^[A-Za-z0-9./-]+$/, "NPM/NIM hanya boleh berisi huruf, angka, titik, garis miring, atau tanda hubung."),
  displayName: z.string().trim().min(3, "Nama lengkap minimal 3 karakter.").max(255),
  email: z.string().trim().toLowerCase().email("Alamat email tidak valid.").max(320),
  whatsapp: z.string().trim().min(8, "Nomor WhatsApp minimal 8 digit.").max(32)
    .regex(/^\+?[0-9][0-9\s-]+$/, "Nomor WhatsApp tidak valid."),
  studyProgram: z.enum(["Administrasi Negara", "Administrasi Publik"]),
  cohort: z.string().trim().regex(/^\d{4}$/, "Angkatan harus terdiri dari 4 digit.")
    .refine((value) => Number(value) >= 1950 && Number(value) <= currentYear, "Tahun angkatan tidak valid."),
  graduationYear: z.union([
    z.literal(""),
    z.string().trim().regex(/^\d{4}$/, "Tahun lulus harus terdiri dari 4 digit.")
      .refine((value) => Number(value) >= 1950 && Number(value) <= currentYear + 1, "Tahun lulus tidak valid.")
  ]),
  domicile: z.string().trim().max(160).optional().default(""),
  password: z.string().min(8, "Password minimal 8 karakter.").max(255),
  confirmPassword: z.string().max(255),
  consent: z.literal(true, { error: "Persetujuan pemrosesan data biometrik wajib diberikan." }),
  website: z.string().max(0).optional().default(""),
  // Satu pemindaian lintas perangkat; tab lama yang masih mengirim template primary tetap diterima.
  faceTemplates: z.array(faceCaptureSchema).min(1).max(2)
}).refine((data) => data.password === data.confirmPassword, {
  path: ["confirmPassword"],
  message: "Konfirmasi password tidak sama."
});

export async function POST(request: Request) {
  try {
    if (!isSameOrigin(request)) return jsonError("Permintaan tidak valid.", 403);
    const parsed = registrationSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? "Data pendaftaran tidak valid.");
    if (!validateRegistrationAccessToken(parsed.data.accessToken)) {
      return jsonError("Akses pendaftaran kedaluwarsa atau tidak valid. Masukkan kembali Kode Primary DPT.", 403);
    }

    // K6a: bila panitia sudah mengunggah DPT resmi, NIM wajib ada di daftar dan nama harus sesuai.
    const dpt = await getOfficialDptStatus();
    if (dpt.total > 0) {
      const official = await findOfficialDpt(parsed.data.userId);
      if (!official) {
        return jsonError("NPM/NIM tidak terdaftar di DPT resmi. Periksa kembali NPM/NIM Anda atau hubungi panitia.", 409);
      }
      if (!namesMatch(official.nama, parsed.data.displayName)) {
        return jsonError("Nama tidak sesuai dengan DPT resmi untuk NPM/NIM tersebut. Periksa penulisan nama atau hubungi panitia.", 409);
      }
    }

    const scans = parsed.data.faceTemplates.filter((scan) => scan.templateRole === "canonical-cross-device");
    if (scans.length !== 1) {
      return jsonError("Pendaftaran wajib berisi satu pemindaian wajah. Ulangi pemindaian wajah.");
    }
    if (scans[0].modelVersion !== FACE_ARCFACE_MODEL_VERSION) {
      return jsonError("Halaman verifikasi wajah sudah diperbarui. Muat ulang halaman lalu ulangi pemindaian.", 409);
    }

    const templates = [];
    let canonicalDescriptor: number[] | null = null;
    for (const scan of scans) {
      if (expectedEngineForRole(scan.templateRole) !== scan.descriptorEngine) {
        return jsonError("Engine descriptor tidak sesuai dengan peran template.");
      }
      const descriptor = normalizeFaceDescriptor(scan.embedding, scan.modelVersion);
      if (!descriptor) return jsonError("Descriptor wajah tidak valid. Ulangi pemindaian.");
      const liveness = validateFaceEvidence({
        token: scan.challengeToken,
        evidence: scan.evidence,
        mode: "register",
        userId: null,
        templateRole: scan.templateRole,
        descriptorEngine: scan.descriptorEngine,
        modelVersion: scan.modelVersion,
        sourceDeviceClass: scan.sourceDeviceClass
      });
      if (!liveness.valid) return jsonError(liveness.message);
      canonicalDescriptor = descriptor;
      templates.push({
        templateRole: scan.templateRole,
        descriptorEngine: scan.descriptorEngine,
        modelVersion: scan.modelVersion,
        sourceDeviceClass: scan.sourceDeviceClass,
        templateEncrypted: encryptFaceDescriptor(descriptor),
        qualityScore: Math.round(((scan.evidence.averageReal + scan.evidence.averageLive) / 2) * 1000) / 1000
      });
    }

    // K6b: satu wajah tidak boleh mendaftarkan lebih dari satu akun.
    const duplicate = canonicalDescriptor ? await findDuplicateFace(canonicalDescriptor, null) : null;
    if (duplicate) {
      await recordSecurityEvent("wajah.ganda", { id: null, label: `${parsed.data.userId} - ${parsed.data.displayName}` }, {
        tahap: "pendaftaran",
        akunMirip: duplicate.userLabel,
        skor: duplicate.score
      });
      return jsonError(DUPLICATE_FACE_MESSAGE, 409);
    }

    await createPublicVoter({
      userId: parsed.data.userId,
      displayName: parsed.data.displayName,
      email: parsed.data.email,
      whatsapp: parsed.data.whatsapp.replace(/[\s-]/g, ""),
      studyProgram: parsed.data.studyProgram,
      cohort: parsed.data.cohort,
      graduationYear: parsed.data.graduationYear || null,
      domicile: parsed.data.domicile || null,
      passwordHash: await bcrypt.hash(parsed.data.password, 12),
      faceTemplates: templates
    });

    return Response.json(
      { ok: true, message: "Pendaftaran DPT berhasil. Silakan masuk menggunakan NPM/NIM dan password Anda." },
      { status: 201, headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    const databaseError = error as { code?: string; constraint?: string };
    if (databaseError.code === "23505") {
      const emailConflict = databaseError.constraint === "uq_users_email_ci";
      return jsonError(emailConflict ? "Email sudah digunakan oleh akun lain." : "NPM/NIM sudah terdaftar.", 409);
    }
    console.error("Public voter registration failed:", error);
    return jsonError("Pendaftaran tidak dapat diproses oleh server. Silakan coba lagi.", 500);
  }
}

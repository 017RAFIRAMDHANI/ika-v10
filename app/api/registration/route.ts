import bcrypt from "bcryptjs";
import { registrationClosedMessage, registrationOpen } from "@/lib/election";
import { getElectionState } from "@/lib/election-guard";
import { z } from "zod";
import { createPublicVoter, recordSecurityEvent } from "@/lib/db";
import { DUPLICATE_FACE_MESSAGE, findDuplicateFace } from "@/lib/face-duplicate";
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
import { biodataSchema, checkRegistrationBiodata } from "@/lib/registration-biodata";
import { isSameOrigin, jsonError } from "@/lib/security";

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

const registrationSchema = biodataSchema.extend({
  accessToken: z.string().min(20).max(4096),
  consent: z.literal(true, { error: "Persetujuan pemrosesan data biometrik wajib diberikan." }),
  website: z.string().max(0).optional().default(""),
  // Satu pemindaian lintas perangkat; tab lama yang masih mengirim template primary tetap diterima.
  faceTemplates: z.array(faceCaptureSchema).min(1).max(2)
});

export async function POST(request: Request) {
  try {
    if (!isSameOrigin(request)) return jsonError("Permintaan tidak valid.", 403);
    const election = await getElectionState();
    if (!registrationOpen(election.phase)) return jsonError(registrationClosedMessage(election.phase), 409);
    const parsed = registrationSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? "Data pendaftaran tidak valid.");
    if (!validateRegistrationAccessToken(parsed.data.accessToken)) {
      return jsonError("Akses pendaftaran kedaluwarsa atau tidak valid. Masukkan kembali Kode Primary DPT.", 403);
    }

    const biodata = await checkRegistrationBiodata(parsed.data);
    if (!biodata.ok) return jsonError(biodata.message, biodata.status);

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
      await recordSecurityEvent("wajah.ganda", { id: null, label: `${parsed.data.nim} - ${parsed.data.displayName}` }, {
        tahap: "pendaftaran",
        akunMirip: duplicate.userLabel,
        skor: duplicate.score
      });
      return jsonError(DUPLICATE_FACE_MESSAGE, 409);
    }

    // User ID = password = kode angkatan + tanggal lahir (12 digit), sama seperti alumni lain.
    await createPublicVoter({
      userId: biodata.loginCode,
      nim: parsed.data.nim,
      displayName: parsed.data.displayName,
      email: parsed.data.email,
      whatsapp: parsed.data.whatsapp.replace(/[\s-]/g, ""),
      studyProgram: parsed.data.studyProgram,
      cohort: parsed.data.cohort,
      graduationYear: parsed.data.graduationYear || null,
      domicile: parsed.data.domicile || null,
      passwordHash: await bcrypt.hash(biodata.loginCode, 12),
      faceTemplates: templates
    });

    return Response.json(
      { ok: true, loginCode: biodata.loginCode, message: "Pendaftaran DPT berhasil." },
      { status: 201, headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    const databaseError = error as { code?: string; constraint?: string };
    if (databaseError.code === "23505") {
      const message = databaseError.constraint === "uq_users_email_ci"
        ? "Email sudah digunakan oleh akun lain."
        : databaseError.constraint === "uq_users_nim"
          ? "NPM/NIM sudah terdaftar."
          : "Sudah ada akun dengan angkatan dan tanggal lahir yang sama. Hubungi panitia.";
      return jsonError(message, 409);
    }
    console.error("Public voter registration failed:", error);
    return jsonError("Pendaftaran tidak dapat diproses oleh server. Silakan coba lagi.", 500);
  }
}

import { z } from "zod";
import { getFaceVerificationRecord, markFaceVerified } from "@/lib/db";
import {
  decryptFaceDescriptor,
  faceMatchThreshold,
  faceSimilarity,
  normalizeFaceDescriptor,
  validateFaceEvidence
} from "@/lib/face";
import {
  FACE_CHALLENGE_STEPS,
  FACE_DESCRIPTOR_ENGINES,
  FACE_DEVICE_CLASSES,
  FACE_MODEL_VERSIONS,
  FACE_TEMPLATE_ROLES,
  expectedEngineForRole,
  isSupportedFaceProfile
} from "@/lib/face-types";
import { getSessionUser, markSessionFaceVerified } from "@/lib/session";
import { isSameOrigin, jsonError } from "@/lib/security";

const schema = z.object({
  templateRole: z.enum(FACE_TEMPLATE_ROLES),
  descriptorEngine: z.enum(FACE_DESCRIPTOR_ENGINES),
  modelVersion: z.enum(FACE_MODEL_VERSIONS),
  sourceDeviceClass: z.enum(FACE_DEVICE_CLASSES),
  embedding: z.array(z.number()).length(1024),
  challengeToken: z.string().min(20).max(4096),
  evidence: z.object({
    startedAt: z.number().int().positive(),
    completedAt: z.number().int().positive(),
    completedSteps: z.array(z.enum(FACE_CHALLENGE_STEPS)).length(FACE_CHALLENGE_STEPS.length),
    sampleCount: z.number().int().positive(),
    averageReal: z.number().min(0).max(1),
    averageLive: z.number().min(0).max(1)
  })
});

export async function POST(request: Request) {
  try {
    if (!isSameOrigin(request)) return jsonError("Permintaan tidak valid.", 403);
    const session = await getSessionUser();
    if (!session) return jsonError("Silakan login terlebih dahulu.", 401);
    if (session.role !== "Alumni") return jsonError("Verifikasi wajah hanya untuk akun pemilih.", 403);
    if (session.faceVerified) return Response.json({ ok: true, redirectTo: "/pemilihan" });

    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return jsonError("Data pemindaian wajah tidak valid.");
    const scan = parsed.data;
    if (expectedEngineForRole(scan.templateRole) !== scan.descriptorEngine) {
      return jsonError("Engine descriptor tidak sesuai dengan peran template.");
    }
    if (!isSupportedFaceProfile(scan.templateRole, scan.modelVersion)) {
      return jsonError("Versi model tidak sesuai dengan peran template.");
    }
    if (scan.templateRole === "desktop-primary" && scan.sourceDeviceClass !== "desktop") {
      return jsonError("Template desktop hanya dapat diverifikasi melalui desktop.");
    }
    if (scan.templateRole === "mobile-primary" && scan.sourceDeviceClass !== "mobile") {
      return jsonError("Template HP hanya dapat diverifikasi melalui perangkat mobile.");
    }

    const currentDescriptor = normalizeFaceDescriptor(scan.embedding, scan.modelVersion);
    if (!currentDescriptor) return jsonError("Descriptor wajah tidak valid. Ulangi pemindaian.");

    const liveness = validateFaceEvidence({
      token: scan.challengeToken,
      evidence: scan.evidence,
      mode: "verify",
      userId: session.id,
      templateRole: scan.templateRole,
      descriptorEngine: scan.descriptorEngine,
      modelVersion: scan.modelVersion,
      sourceDeviceClass: scan.sourceDeviceClass
    });
    if (!liveness.valid) return jsonError(liveness.message);

    const record = await getFaceVerificationRecord(session.id, scan.templateRole, scan.descriptorEngine);
    if (!record) {
      return jsonError("Template wajah untuk profil perangkat ini belum tersedia.", 409);
    }
    if (record.modelVersion !== scan.modelVersion) {
      return jsonError("Halaman verifikasi wajah sudah diperbarui. Muat ulang halaman lalu ulangi pemindaian.", 409);
    }

    const referenceDescriptor = decryptFaceDescriptor(record.templateEncrypted);
    const similarity = faceSimilarity(referenceDescriptor, currentDescriptor, scan.modelVersion);
    if (similarity < faceMatchThreshold(scan.modelVersion)) {
      return jsonError(`Wajah tidak cocok dengan data pendaftar (Skor: ${similarity}). Pastikan pencahayaan dan wajah sudah benar.`, 401);
    }

    const saved = await markFaceVerified(session.id, scan.templateRole);
    if (!saved) return jsonError("Status verifikasi wajah tidak dapat disimpan.", 409);
    const sessionSaved = await markSessionFaceVerified(session.id, request);
    if (!sessionSaved) return jsonError("Sesi login berubah. Silakan login dan verifikasi kembali.", 409);

    return Response.json({ ok: true, redirectTo: "/pemilihan" });
  } catch (error) {
    console.error("Face verification failed:", error);
    return jsonError("Verifikasi wajah tidak dapat diproses oleh server.", 500);
  }
}

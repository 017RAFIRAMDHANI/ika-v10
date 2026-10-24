import { z } from "zod";
import { getFaceTemplateAvailability, markFaceVerified, recordSecurityEvent, saveFaceTemplate } from "@/lib/db";
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

    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return jsonError("Data pemindaian wajah tidak valid.");
    const scan = parsed.data;
    if (expectedEngineForRole(scan.templateRole) !== scan.descriptorEngine) {
      return jsonError("Engine descriptor tidak sesuai dengan peran template.");
    }
    // Template baru hanya lintas perangkat (ArcFace); template primary lama tidak dibuat lagi.
    if (scan.modelVersion !== FACE_ARCFACE_MODEL_VERSION || scan.templateRole !== "canonical-cross-device") {
      return jsonError("Halaman verifikasi wajah sudah diperbarui. Muat ulang halaman lalu ulangi pemindaian.", 409);
    }

    const descriptor = normalizeFaceDescriptor(scan.embedding, scan.modelVersion);
    if (!descriptor) return jsonError("Descriptor wajah tidak valid. Ulangi pemindaian.");

    const availabilityBefore = await getFaceTemplateAvailability(session.id);
    if (availabilityBefore.canonicalEnrolled) return jsonError("Template wajah untuk profil ini sudah terdaftar.", 409);
    if (
      (
        availabilityBefore.desktopPrimaryEnrolled
        || availabilityBefore.mobilePrimaryEnrolled
        || availabilityBefore.canonicalEnrolled
      )
      && !session.faceVerified
    ) {
      return jsonError("Verifikasi wajah yang sudah terdaftar sebelum menambahkan profil perangkat baru.", 403);
    }

    const liveness = validateFaceEvidence({
      token: scan.challengeToken,
      evidence: scan.evidence,
      mode: "enroll",
      userId: session.id,
      templateRole: scan.templateRole,
      descriptorEngine: scan.descriptorEngine,
      modelVersion: scan.modelVersion,
      sourceDeviceClass: scan.sourceDeviceClass
    });
    if (!liveness.valid) return jsonError(liveness.message);

    const duplicate = await findDuplicateFace(descriptor, session.id);
    if (duplicate) {
      await recordSecurityEvent("wajah.ganda", { id: session.id, label: `${session.userId} - ${session.displayName}` }, {
        tahap: "aktivasi",
        akunMirip: duplicate.userLabel,
        skor: duplicate.score
      });
      return jsonError(DUPLICATE_FACE_MESSAGE, 409);
    }

    const saved = await saveFaceTemplate(session.id, {
      templateRole: scan.templateRole,
      descriptorEngine: scan.descriptorEngine,
      modelVersion: scan.modelVersion,
      sourceDeviceClass: scan.sourceDeviceClass,
      templateEncrypted: encryptFaceDescriptor(descriptor),
      qualityScore: Math.round(((scan.evidence.averageReal + scan.evidence.averageLive) / 2) * 1000) / 1000
    });
    if (!saved) return jsonError("Wajah tidak dapat didaftarkan atau profil sudah pernah didaftarkan.", 409);

    const verified = await markFaceVerified(session.id, scan.templateRole);
    if (!verified) return jsonError("Status verifikasi wajah tidak dapat disimpan.", 409);
    const sessionSaved = await markSessionFaceVerified(session.id, request);
    if (!sessionSaved) return jsonError("Sesi login berubah. Silakan login dan verifikasi kembali.", 409);

    return Response.json({ ok: true, redirectTo: "/pemilihan" });
  } catch (error) {
    console.error("Face enrollment failed:", error);
    return jsonError("Pendaftaran wajah tidak dapat diproses oleh server.", 500);
  }
}

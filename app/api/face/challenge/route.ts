import { z } from "zod";
import { createFaceChallenge, faceLockMessage } from "@/lib/face";
import { getElectionState } from "@/lib/election-guard";
import { registrationClosedMessage, registrationOpen } from "@/lib/election";
import { getFaceLock, getFaceTemplateAvailability, getFaceVerificationRecord } from "@/lib/db";
import {
  FACE_ARCFACE_MODEL_VERSION,
  FACE_DESCRIPTOR_ENGINES,
  FACE_DEVICE_CLASSES,
  FACE_MODEL_VERSIONS,
  FACE_TEMPLATE_ROLES,
  expectedEngineForRole,
  isSupportedFaceProfile
} from "@/lib/face-types";
import { getSessionUser } from "@/lib/session";
import { isSameOrigin, jsonError } from "@/lib/security";

const modeSchema = z.enum(["register", "enroll", "verify"]);
const profileSchema = z.object({
  templateRole: z.enum(FACE_TEMPLATE_ROLES),
  descriptorEngine: z.enum(FACE_DESCRIPTOR_ENGINES),
  modelVersion: z.enum(FACE_MODEL_VERSIONS),
  sourceDeviceClass: z.enum(FACE_DEVICE_CLASSES)
});

export async function GET(request: Request) {
  try {
    if (!isSameOrigin(request)) return jsonError("Permintaan tidak valid.", 403);
    const params = new URL(request.url).searchParams;
    const mode = modeSchema.safeParse(params.get("mode"));
    if (!mode.success) return jsonError("Mode verifikasi wajah tidak valid.");
    const profile = profileSchema.safeParse({
      templateRole: params.get("templateRole"),
      descriptorEngine: params.get("descriptorEngine"),
      modelVersion: params.get("modelVersion"),
      sourceDeviceClass: params.get("sourceDeviceClass")
    });
    if (!profile.success) return jsonError("Profil descriptor wajah tidak valid.");
    if (expectedEngineForRole(profile.data.templateRole) !== profile.data.descriptorEngine) {
      return jsonError("Engine descriptor tidak sesuai dengan peran template.");
    }
    if (!isSupportedFaceProfile(profile.data.templateRole, profile.data.modelVersion)) {
      return jsonError("Versi model tidak sesuai dengan peran template.");
    }
    // Template baru selalu memakai model terbaru; versi lama hanya untuk verifikasi.
    if (mode.data !== "verify" && profile.data.modelVersion !== FACE_ARCFACE_MODEL_VERSION) {
      return jsonError("Halaman verifikasi wajah sudah diperbarui. Muat ulang halaman lalu ulangi pemindaian.", 409);
    }
    if (profile.data.templateRole === "desktop-primary" && profile.data.sourceDeviceClass !== "desktop") {
      return jsonError("Template desktop hanya dapat dibuat atau diperiksa pada desktop.");
    }
    if (profile.data.templateRole === "mobile-primary" && profile.data.sourceDeviceClass !== "mobile") {
      return jsonError("Template HP hanya dapat dibuat atau diperiksa pada perangkat mobile.");
    }
    if (profile.data.templateRole === "canonical-cross-device" && process.env.FACE_CROSS_DEVICE_ENABLED === "false") {
      return jsonError("Verifikasi lintas perangkat sedang dinonaktifkan.", 503);
    }

    const election = await getElectionState();
    if (mode.data === "register" && !registrationOpen(election.phase)) {
      return jsonError(registrationClosedMessage(election.phase), 409);
    }
    if (election.phase === "ditutup") return jsonError("Pemungutan suara telah ditutup.", 409);

    const session = await getSessionUser();
    if (mode.data !== "register" && !session) {
      return jsonError("Silakan login terlebih dahulu.", 401);
    }
    if (mode.data !== "register" && session?.role !== "Alumni") return jsonError("Verifikasi wajah hanya untuk akun pemilih.", 403);
    if (mode.data !== "register" && session) {
      const lockedUntil = await getFaceLock(session.id);
      if (lockedUntil) return jsonError(faceLockMessage(lockedUntil), 429);
      const availability = await getFaceTemplateAvailability(session.id);
      const templateExists = profile.data.templateRole === "desktop-primary"
        ? availability.desktopPrimaryEnrolled
        : profile.data.templateRole === "mobile-primary"
          ? availability.mobilePrimaryEnrolled
          : availability.canonicalEnrolled;
      if (mode.data === "enroll" && templateExists) {
        return jsonError("Template wajah untuk profil ini sudah terdaftar.", 409);
      }
      if (mode.data === "verify" && !templateExists) {
        return jsonError("Template wajah untuk profil perangkat ini belum terdaftar.", 409);
      }
      if (mode.data === "verify") {
        const record = await getFaceVerificationRecord(session.id, profile.data.templateRole, profile.data.descriptorEngine);
        if (record?.modelVersion !== profile.data.modelVersion) {
          return jsonError("Halaman verifikasi wajah sudah diperbarui. Muat ulang halaman lalu ulangi pemindaian.", 409);
        }
      }
    }

    const challenge = createFaceChallenge({
      mode: mode.data,
      userId: mode.data === "register" ? null : session?.id ?? null,
      ...profile.data
    });
    return Response.json(
      { ok: true, ...challenge },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Face challenge failed:", error);
    return jsonError("Sesi verifikasi wajah tidak dapat dibuat. Periksa konfigurasi server.", 500);
  }
}

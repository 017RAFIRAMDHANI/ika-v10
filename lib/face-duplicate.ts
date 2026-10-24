import "server-only";

import { getArcFaceTemplatesForDuplicateCheck } from "@/lib/db";
import { decryptFaceDescriptor, faceMatchThreshold, faceSimilarity } from "@/lib/face";
import { FACE_ARCFACE_MODEL_VERSION } from "@/lib/face-types";

export const DUPLICATE_FACE_MESSAGE = "Wajah ini sangat mirip dengan akun lain yang sudah terdaftar. Demi keamanan, proses ditahan. Silakan hubungi panitia untuk peninjauan.";

// K6b: satu wajah hanya boleh dimiliki satu akun. Wajah baru dibandingkan dengan seluruh template
// ArcFace aktif milik akun lain memakai ambang yang sama dengan verifikasi login, sehingga
// "cukup mirip untuk lolos login" berarti "dianggap orang yang sama".
// Template model lama (faceres) berada di ruang embedding berbeda dan tidak dapat dibandingkan.
export async function findDuplicateFace(descriptor: number[], excludeUserId: number | null) {
  const templates = await getArcFaceTemplatesForDuplicateCheck(FACE_ARCFACE_MODEL_VERSION, excludeUserId);
  const threshold = faceMatchThreshold(FACE_ARCFACE_MODEL_VERSION);
  let best: { userId: number; userLabel: string; score: number } | null = null;
  for (const template of templates) {
    let reference: number[];
    try {
      reference = decryptFaceDescriptor(template.templateEncrypted);
    } catch {
      continue;
    }
    const score = faceSimilarity(reference, descriptor, FACE_ARCFACE_MODEL_VERSION);
    if (score >= threshold && (!best || score > best.score)) {
      best = { userId: template.userId, userLabel: template.userLabel, score };
    }
  }
  return best;
}

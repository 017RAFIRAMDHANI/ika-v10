import { z } from "zod";
import { deleteAllFaceTemplates } from "@/lib/db";
import { FACE_PURGE_CONFIRMATION } from "@/lib/election";
import { getElectionState } from "@/lib/election-guard";
import { auditActor, getSessionUser, isAdmin } from "@/lib/session";
import { isSameOrigin, jsonError } from "@/lib/security";

const schema = z.object({ konfirmasi: z.string().max(64) });

// T3 (retensi, UU PDP): setelah pemungutan suara ditutup, data wajah tidak lagi diperlukan dan
// dapat dihapus seluruhnya oleh admin. Tindakan ini tercatat di log audit.
export async function DELETE(request: Request) {
  if (!isSameOrigin(request)) return jsonError("Permintaan tidak valid.", 403);
  const session = await getSessionUser();
  if (!session || !isAdmin(session)) return jsonError("Akses ditolak.", 403);
  const { phase } = await getElectionState();
  if (phase !== "ditutup") return jsonError("Data wajah hanya dapat dihapus setelah pemungutan suara ditutup.", 409);
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || parsed.data.konfirmasi !== FACE_PURGE_CONFIRMATION) {
    return jsonError(`Ketik "${FACE_PURGE_CONFIRMATION}" untuk mengonfirmasi.`);
  }

  try {
    const deleted = await deleteAllFaceTemplates(auditActor(session));
    return Response.json({ ok: true, deleted });
  } catch (error) {
    console.error("Face data purge failed:", error);
    return jsonError("Data wajah gagal dihapus.", 500);
  }
}

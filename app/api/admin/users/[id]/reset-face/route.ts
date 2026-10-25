import { resetUserFaceTemplates } from "@/lib/db";
import { electionLockMessage } from "@/lib/election-guard";
import { auditActor, getSessionUser, isAdmin } from "@/lib/session";
import { isSameOrigin, jsonError } from "@/lib/security";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSameOrigin(request)) return jsonError("Permintaan tidak valid.", 403);
  const session = await getSessionUser();
  if (!session || !isAdmin(session)) return jsonError("Akses ditolak.", 403);
  const locked = await electionLockMessage(["pemungutan"]);
  if (locked) return jsonError(locked, 409);
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return jsonError("ID akun tidak valid.");
  const reset = await resetUserFaceTemplates(id, auditActor(session));
  if (!reset) return jsonError("Akun belum memiliki template wajah aktif atau tidak ditemukan.", 409);
  return Response.json({ ok: true });
}

import { z } from "zod";
import { castVote } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { isSameOrigin, jsonError } from "@/lib/security";

const schema = z.object({ candidateId: z.coerce.number().int().positive() });

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return jsonError("Permintaan tidak valid.", 403);
  const user = await getSessionUser();
  if (!user) return jsonError("Silakan login terlebih dahulu.", 401);
  if (user.role !== "Alumni") return jsonError("Akun administrator tidak memiliki hak suara.", 403);

  if (user.hasVoted) return jsonError("Akun ini sudah melakukan pemilihan.", 409);
  if (!user.faceVerified) return jsonError("Verifikasi wajah wajib diselesaikan sebelum memilih.", 403);

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("Kandidat tidak valid.");

  const saved = await castVote(user.id, parsed.data.candidateId, user.faceVerified);
  if (saved.length === 0) return jsonError("Suara tidak dapat disimpan, verifikasi wajah belum selesai, atau akun sudah memilih.", 409);
  return Response.json({ ok: true, redirectTo: "/pemilihan" });
}

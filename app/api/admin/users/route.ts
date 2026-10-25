import bcrypt from "bcryptjs";
import { z } from "zod";
import { createAdminUser } from "@/lib/db";
import { electionLockMessage } from "@/lib/election-guard";
import { auditActor, getSessionUser, isAdmin } from "@/lib/session";
import { isSameOrigin, jsonError } from "@/lib/security";

const schema = z.object({
  userId: z.string().trim().min(1).max(255),
  displayName: z.string().trim().min(2).max(255),
  password: z.string().min(6).max(255),
  role: z.enum(["Alumni", "Admin"])
});

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return jsonError("Permintaan tidak valid.", 403);
  const session = await getSessionUser();
  if (!session || !isAdmin(session)) return jsonError("Akses ditolak.", 403);
  const locked = await electionLockMessage(["pemungutan"]);
  if (locked) return jsonError(locked, 409);
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? "Data akun tidak valid.");

  try {
    const created = await createAdminUser({
      userId: parsed.data.userId,
      displayName: parsed.data.displayName,
      role: parsed.data.role,
      passwordHash: await bcrypt.hash(parsed.data.password, 12)
    }, auditActor(session));
    return Response.json({ ok: true, created });
  } catch {
    return jsonError("User ID sudah digunakan atau akun gagal disimpan.", 409);
  }
}

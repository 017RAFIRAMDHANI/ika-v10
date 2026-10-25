import bcrypt from "bcryptjs";
import { z } from "zod";
import { updateVoterAccount } from "@/lib/db";
import { adminPasswordProblem } from "@/lib/password-policy";
import { getSessionUser } from "@/lib/session";
import { isSameOrigin, jsonError } from "@/lib/security";

const schema = z.object({
  displayName: z.string().trim().min(2).max(255),
  password: z.string().max(255).optional(),
});

export async function PATCH(request: Request) {
  if (!isSameOrigin(request)) return jsonError("Permintaan tidak valid.", 403);
  
  const session = await getSessionUser();
  if (!session) return jsonError("Akses ditolak.", 403);
  
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? "Data akun tidak valid.");

  if (parsed.data.password && session.role === "Admin") {
    const problem = adminPasswordProblem(parsed.data.password, session.userId);
    if (problem) return jsonError(problem, 400);
  }

  try {
    let passwordHash = null;
    if (parsed.data.password && parsed.data.password.length >= 6) {
      passwordHash = await bcrypt.hash(parsed.data.password, 12);
    } else if (parsed.data.password && parsed.data.password.length > 0 && parsed.data.password.length < 6) {
      return jsonError("Password minimal 6 karakter.", 400);
    }

    const updated = await updateVoterAccount(session.id, {
      displayName: parsed.data.displayName,
      passwordHash
    });

    if (!updated) {
      return jsonError("Akun tidak ditemukan atau gagal diperbarui.", 404);
    }

    return Response.json({ ok: true, message: "Akun berhasil diperbarui." });
  } catch {
    return jsonError("Akun gagal diperbarui.", 500);
  }
}

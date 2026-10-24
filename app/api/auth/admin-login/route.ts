import bcrypt from "bcryptjs";
import { z } from "zod";
import { verifyPassword } from "@/lib/auth";
import { findUserByLogin, logAdminAction, upgradeLegacyPassword } from "@/lib/db";
import { createSession, isAdmin } from "@/lib/session";
import { isSameOrigin, jsonError } from "@/lib/security";

const loginSchema = z.object({
  userId: z.string().trim().min(1, "User ID wajib diisi.").max(255),
  password: z.string().min(1, "Password wajib diisi.").max(255)
});

export async function POST(request: Request) {
  try {
    if (!isSameOrigin(request)) return jsonError("Permintaan tidak valid.", 403);

    const parsed = loginSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? "Data login tidak valid.");

    const user = await findUserByLogin(parsed.data.userId);
    if (!user) return jsonError("User ID atau password administrator salah.", 401);

    const password = await verifyPassword(parsed.data.password, user.passwordHash);
    if (!password.valid) return jsonError("User ID atau password administrator salah.", 401);
    if (!isAdmin(user)) return jsonError("Akun ini bukan akun administrator.", 403);

    if (password.needsUpgrade) {
      await upgradeLegacyPassword(user.id, await bcrypt.hash(parsed.data.password, 12));
    }

    await createSession(user.id, request);
    await logAdminAction({ id: user.id, userId: user.userId, displayName: user.displayName }, "admin.login");
    return Response.json(
      { ok: true, redirectTo: "/admin" },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Admin login failed:", error);
    return jsonError(
      "Login tidak dapat diproses oleh server. Periksa DATABASE_URL dan SESSION_SECRET, lalu coba lagi.",
      500
    );
  }
}

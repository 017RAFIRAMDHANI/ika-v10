import bcrypt from "bcryptjs";
import { z } from "zod";
import { verifyPassword } from "@/lib/auth";
import { createSession } from "@/lib/session";
import { findUsersByLogin, upgradeLegacyPassword } from "@/lib/db";
import { loginLookupTiers, resolveLoginAccount } from "@/lib/login-code";
import {
  accountLockedMessage,
  clearAccountFailures,
  networkBlockedMessage,
  recordAccountFailure,
  recordNetworkFailure
} from "@/lib/login-throttle";
import { isSameOrigin, jsonError } from "@/lib/security";

const loginSchema = z.object({
  userId: z.string().trim().min(1, "User ID wajib diisi.").max(255),
  password: z.string().min(1, "Password wajib diisi.").max(255)
});

const WRONG_LOGIN =
  "User ID atau password salah. Ketik: tahun angkatan, tanggal lahir, bulan lahir, tahun lahir (contoh 200419121995).";

export async function POST(request: Request) {
  try {
    if (!isSameOrigin(request)) return jsonError("Permintaan tidak valid.", 403);

    const parsed = loginSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? "Data login tidak valid.");

    const blocked = await networkBlockedMessage(request, "login");
    if (blocked) return jsonError(blocked, 429);

    const accounts = await findUsersByLogin(loginLookupTiers(parsed.data.userId).flat());
    const result = await resolveLoginAccount(
      parsed.data.userId,
      parsed.data.password,
      accounts,
      (account, password) => verifyPassword(password, account.passwordHash)
    );

    if (result.status === "ambiguous") {
      return jsonError(
        "Kode ini cocok dengan lebih dari satu akun. Ketik lengkap 12 digit dengan angka 0, contoh 200401021995 (tanggal 01, bulan 02).",
        409
      );
    }
    if (result.status === "locked") return jsonError(accountLockedMessage(result.account.loginLockedUntil!), 429);
    if (result.status === "failed") {
      await recordNetworkFailure(request, "login");
      let lockedUntil: string | null = null;
      for (const account of result.accounts) {
        lockedUntil = (await recordAccountFailure(account.id)) ?? lockedUntil;
      }
      if (lockedUntil && result.accounts.length === 1) return jsonError(accountLockedMessage(lockedUntil), 429);
      return jsonError(WRONG_LOGIN, 401);
    }

    const user = result.account;
    await clearAccountFailures(user);
    if (user.role !== "Alumni") {
      return jsonError("Akun administrator harus masuk melalui Login Administrator.", 403);
    }

    if (result.needsUpgrade) {
      await upgradeLegacyPassword(user.id, await bcrypt.hash(result.password, 12));
    }

    await createSession(user.id, request);
    return Response.json(
      { ok: true, redirectTo: "/" },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Voter login failed:", error);
    return jsonError(
      "Login tidak dapat diproses oleh server. Periksa DATABASE_URL dan SESSION_SECRET, lalu coba lagi.",
      500
    );
  }
}

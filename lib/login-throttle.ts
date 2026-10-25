import { createHmac } from "node:crypto";
import {
  clearAccountLoginFailures,
  getLoginThrottle,
  recordAccountLoginFailure,
  recordLoginThrottleFailure
} from "@/lib/db";

// T4: pembatasan percobaan. Per akun: 5 kali salah password = akun dikunci 15 menit.
// Per jaringan: batas gagal per 15 menit. Batas login pemilih dibuat longgar karena banyak alumni
// dapat masuk dari satu jaringan yang sama (Wi-Fi acara, jaringan seluler).
export const ACCOUNT_MAX_FAILURES = 5;
export const ACCOUNT_LOCK_MINUTES = 15;
const WINDOW_MINUTES = 15;

const NETWORK_LIMITS = {
  login: 40,
  admin_login: 10,
  pendaftaran: 10
} as const;

export type ThrottleScope = keyof typeof NETWORK_LIMITS;

// Di Vercel, x-real-ip / x-forwarded-for diisi oleh platform (bukan oleh browser).
function clientIp(request: Request) {
  return request.headers.get("x-real-ip")?.trim()
    || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || "tanpa-ip";
}

// Alamat IP tidak disimpan; yang disimpan HMAC-nya dengan SESSION_SECRET.
function networkKey(request: Request, scope: ThrottleScope) {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("SESSION_SECRET minimal 32 karakter dan wajib dikonfigurasi.");
  const digest = createHmac("sha256", secret).update(`login-throttle:${clientIp(request)}`).digest("base64url");
  return `${scope}:${digest}`;
}

function until(timestamp: string) {
  return new Intl.DateTimeFormat("id-ID", { timeStyle: "short", timeZone: "Asia/Jakarta" }).format(new Date(timestamp));
}

export async function networkBlockedMessage(request: Request, scope: ThrottleScope) {
  const throttle = await getLoginThrottle(networkKey(request, scope), WINDOW_MINUTES);
  if (!throttle || throttle.failures < NETWORK_LIMITS[scope]) return null;
  return `Terlalu banyak percobaan gagal dari jaringan ini. Coba lagi setelah pukul ${until(throttle.resetsAt)} WIB.`;
}

export async function recordNetworkFailure(request: Request, scope: ThrottleScope) {
  await recordLoginThrottleFailure(networkKey(request, scope), scope, NETWORK_LIMITS[scope], WINDOW_MINUTES);
}

export function accountLockedMessage(lockedUntil: string) {
  return `Akun ini dikunci sementara karena ${ACCOUNT_MAX_FAILURES} kali salah password. Coba lagi setelah pukul ${until(lockedUntil)} WIB.`;
}

// Mengembalikan waktu kunci bila kegagalan ini membuat akun terkunci.
export function recordAccountFailure(userId: number) {
  return recordAccountLoginFailure(userId, ACCOUNT_MAX_FAILURES, ACCOUNT_LOCK_MINUTES);
}

export function clearAccountFailures(account: { id: number; loginFailedAttempts: number; loginLockedUntil: string | null }) {
  if (account.loginFailedAttempts === 0 && !account.loginLockedUntil) return Promise.resolve();
  return clearAccountLoginFailures(account.id);
}

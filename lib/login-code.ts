// Kode login alumni (skema sejak sistem Laravel): tahun angkatan (4 digit) + tanggal lahir +
// bulan lahir + tahun lahir (4 digit), dipakai sebagai User ID sekaligus password.
// Data lama menulis tanggal/bulan tanpa angka 0 (contoh 19991261971 = angkatan 1999, 12-6-1971),
// sebagian dengan angka 0 (contoh 200401021995). Pemilih boleh mengetik dengan atau tanpa angka 0,
// juga dengan spasi/titik/garis miring.
const YEAR = /^(19|20)\d{2}$/;

// Penulisan setara dikelompokkan bertingkat: [ketikan apa adanya], [tanpa angka 0 (konvensi data
// lama)], [dengan angka 0], [campuran]. Pencarian akun memakai tingkat pertama yang cocok tepat satu
// akun, sehingga dua orang berbeda yang kodenya mirip (mis. 1-01 vs 10-1) tidak tertukar.
export function loginCodeTiers(input: string): string[][] {
  const code = input.replace(/[\s.,/-]/g, "");
  if (!/^\d{10,12}$/.test(code)) return [];
  const cohort = code.slice(0, 4);
  const birthYear = code.slice(-4);
  const dayMonth = code.slice(4, -4);
  if (!YEAR.test(cohort) || !YEAR.test(birthYear)) return [];

  const natural = new Set<string>();
  const padded = new Set<string>();
  const mixed = new Set<string>();
  for (let split = 1; split < dayMonth.length; split += 1) {
    const dayText = dayMonth.slice(0, split);
    const monthText = dayMonth.slice(split);
    if (dayText.length > 2 || monthText.length > 2) continue;
    const day = Number(dayText);
    const month = Number(monthText);
    if (day < 1 || day > 31 || month < 1 || month > 12) continue;
    const dayPadded = String(day).padStart(2, "0");
    const monthPadded = String(month).padStart(2, "0");
    natural.add(`${cohort}${day}${month}${birthYear}`);
    padded.add(`${cohort}${dayPadded}${monthPadded}${birthYear}`);
    mixed.add(`${cohort}${dayPadded}${month}${birthYear}`);
    mixed.add(`${cohort}${day}${monthPadded}${birthYear}`);
  }
  if (natural.size === 0) return [];
  const seen = new Set<string>([code]);
  const tiers = [[code]];
  for (const tier of [natural, padded, mixed]) {
    const fresh = Array.from(tier).filter((value) => !seen.has(value));
    fresh.forEach((value) => seen.add(value));
    if (fresh.length) tiers.push(fresh);
  }
  return tiers;
}

export function loginCodeVariants(input: string) {
  return loginCodeTiers(input).flat();
}

// Urutan User ID yang dicari: ketikan apa adanya lebih dulu, lalu penulisan setara.
export function loginLookupTiers(input: string): string[][] {
  const typed = input.trim();
  const tiers = loginCodeTiers(typed);
  if (!tiers.length) return [[typed]];
  if (!tiers[0].includes(typed)) tiers[0].unshift(typed);
  return tiers;
}

// Password yang dicoba untuk satu akun: ketikan apa adanya, lalu User ID akun itu bila ketikan
// adalah kode yang sama dengan penulisan lain (password awal alumni = User ID). Tetap diperiksa
// terhadap hash akun, sehingga akun yang passwordnya sudah diganti tidak terpengaruh.
export function passwordCandidates(password: string, accountUserId: string) {
  if (password === accountUserId || !loginCodeVariants(password).includes(accountUserId)) return [password];
  return [password, accountUserId];
}

type LoginCandidate = { userId: string; loginLockedUntil: string | null };
type PasswordCheck = { valid: boolean; needsUpgrade: boolean };

export type LoginResolution<A> =
  | { status: "ok"; account: A; password: string; needsUpgrade: boolean }
  | { status: "ambiguous" }
  | { status: "locked"; account: A }
  | { status: "failed"; accounts: A[] };

// Memilih akun: tingkat penulisan pertama yang memuat akun yang dipakai, dan di dalamnya hanya akun
// yang passwordnya cocok. Tidak turun ke tingkat berikutnya, supaya bila kode persisnya ada, kode
// milik orang lain yang hanya mirip tidak pernah dipakai. Lebih dari satu akun cocok = ditolak.
export async function resolveLoginAccount<A extends LoginCandidate>(
  input: string,
  password: string,
  accounts: A[],
  verify: (account: A, password: string) => Promise<PasswordCheck>
): Promise<LoginResolution<A>> {
  for (const tier of loginLookupTiers(input)) {
    const inTier = accounts.filter((account) => tier.includes(account.userId));
    if (!inTier.length) continue;

    const open = inTier.filter((account) => !account.loginLockedUntil);
    const verified: { account: A; password: string; needsUpgrade: boolean }[] = [];
    for (const account of open) {
      for (const candidate of passwordCandidates(password, account.userId)) {
        const check = await verify(account, candidate);
        if (check.valid) {
          verified.push({ account, password: candidate, needsUpgrade: check.needsUpgrade });
          break;
        }
      }
    }
    if (verified.length === 1) return { status: "ok", ...verified[0] };
    if (verified.length > 1) return { status: "ambiguous" };
    const locked = inTier.find((account) => account.loginLockedUntil);
    if (locked) return { status: "locked", account: locked };
    return { status: "failed", accounts: open };
  }
  return { status: "failed", accounts: [] };
}

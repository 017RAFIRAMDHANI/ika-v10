// T4/T6: aturan password akun administrator. Akun alumni tetap memakai kode angkatan + tanggal lahir.
export const ADMIN_PASSWORD_MIN_LENGTH = 12;

// Pesan penolakan bila password admin lemah; null bila memenuhi aturan.
export function adminPasswordProblem(password: string, userId: string) {
  if (password.length < ADMIN_PASSWORD_MIN_LENGTH) {
    return `Password administrator minimal ${ADMIN_PASSWORD_MIN_LENGTH} karakter.`;
  }
  const id = userId.trim().toLowerCase();
  if (id.length >= 4 && password.toLowerCase().includes(id)) {
    return "Password administrator tidak boleh memuat User ID.";
  }
  return null;
}

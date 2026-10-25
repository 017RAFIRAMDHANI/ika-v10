// T1: tahap pemilu dihitung dari pengaturan_pemilu. Aturan yang sama ditegakkan di database
// (trigger ika_jaga_pengaturan_pemilu dan syarat di castVote).
export type ElectionPhase = "persiapan" | "pemungutan" | "ditutup";

export type ElectionSettings = {
  opensAt: string | null;
  closesAt: string | null;
  closedManuallyAt: string | null;
};

// T3: kalimat yang harus diketik admin untuk menghapus seluruh data wajah setelah pemilu ditutup.
export const FACE_PURGE_CONFIRMATION = "HAPUS DATA WAJAH";

// v10.7: kalimat yang harus diketik admin untuk Reset Uji Coba (menghapus seluruh suara percobaan).
export const TRIAL_RESET_CONFIRMATION = "RESET UJI COBA";

export const ELECTION_PHASE_LABELS: Record<ElectionPhase, string> = {
  persiapan: "Persiapan & Aktivasi",
  pemungutan: "Pemungutan Suara",
  ditutup: "Ditutup"
};

export function electionPhase(settings: ElectionSettings, now = Date.now()): ElectionPhase {
  if (settings.closedManuallyAt) return "ditutup";
  if (!settings.opensAt || now < new Date(settings.opensAt).getTime()) return "persiapan";
  if (settings.closesAt && now >= new Date(settings.closesAt).getTime()) return "ditutup";
  return "pemungutan";
}

// Pendaftaran mandiri hanya dibuka pada tahap Persiapan; otomatis tertutup saat pemungutan suara.
export function registrationOpen(phase: ElectionPhase) {
  return phase === "persiapan";
}

export function registrationClosedMessage(phase: ElectionPhase) {
  return phase === "ditutup"
    ? "Pemungutan suara telah ditutup; pendaftaran tidak lagi dibuka."
    : "Pendaftaran mandiri ditutup selama pemungutan suara berlangsung. Hubungi panitia.";
}

export function formatWib(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Asia/Jakarta"
  }).format(date) + " WIB";
}

// Nilai untuk <input type="datetime-local"> dalam WIB, mis. "2026-11-30T08:00".
export function toWibInput(value: string | null) {
  if (!value) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(new Date(value));
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

// Kebalikan toWibInput: "2026-11-30T08:00" (WIB) -> Date. null bila kosong, undefined bila tidak valid.
export function fromWibInput(value: string) {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}:00+07:00`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

import { z } from "zod";
import { closeElectionNow, openElectionNow, saveElectionSchedule } from "@/lib/db";
import { fromWibInput } from "@/lib/election";
import { getElectionState } from "@/lib/election-guard";
import { auditActor, getSessionUser, isAdmin } from "@/lib/session";
import { isSameOrigin, jsonError } from "@/lib/security";

const schema = z.discriminatedUnion("aksi", [
  z.object({
    aksi: z.literal("jadwal"),
    dibukaPada: z.string().max(32),
    ditutupPada: z.string().max(32),
    pendaftaranSaatVoting: z.boolean(),
    hasilLiveSaatVoting: z.boolean()
  }),
  z.object({ aksi: z.literal("buka") }),
  z.object({ aksi: z.literal("tutup") })
]);

// Form memakai presisi menit, sedangkan "Buka Sekarang" menyimpan detik.
const toMinute = (time: number) => Math.floor(time / 60_000);
const sameMinute = (first: Date | null, second: string | null) =>
  (first === null && second === null)
  || (first !== null && second !== null && toMinute(first.getTime()) === toMinute(new Date(second).getTime()));

// T1: pengaturan jadwal pemilu oleh admin. Aturan yang sama dijaga trigger database.
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return jsonError("Permintaan tidak valid.", 403);
  const session = await getSessionUser();
  if (!session || !isAdmin(session)) return jsonError("Akses ditolak.", 403);
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("Data pengaturan pemilu tidak valid.");

  const { settings, phase, now } = await getElectionState();
  if (phase === "ditutup") return jsonError("Pemungutan suara telah ditutup; pengaturan pemilu bersifat final.", 409);
  const actor = auditActor(session);

  try {
    if (parsed.data.aksi === "buka") {
      if (phase !== "persiapan") return jsonError("Pemungutan suara sudah berlangsung.", 409);
      if (!(await openElectionNow(actor))) return jsonError("Pemungutan suara tidak dapat dibuka.", 409);
      return Response.json({ ok: true });
    }

    if (parsed.data.aksi === "tutup") {
      if (phase !== "pemungutan") return jsonError("Pemungutan suara belum dibuka.", 409);
      if (!(await closeElectionNow(actor))) return jsonError("Pemungutan suara tidak dapat ditutup.", 409);
      return Response.json({ ok: true });
    }

    const opensAt = fromWibInput(parsed.data.dibukaPada);
    const closesAt = fromWibInput(parsed.data.ditutupPada);
    if (opensAt === undefined || closesAt === undefined) return jsonError("Format tanggal dan jam tidak valid.");
    if (closesAt && !opensAt) return jsonError("Isi waktu dibuka sebelum mengisi waktu ditutup.");
    if (opensAt && closesAt && closesAt <= opensAt) return jsonError("Waktu ditutup harus setelah waktu dibuka.");
    if (closesAt && closesAt.getTime() <= now) return jsonError("Waktu ditutup harus di masa depan.");

    const voting = phase === "pemungutan";
    if (voting) {
      // Selama pemungutan suara hanya waktu tutup yang dapat diubah.
      const unchanged = sameMinute(opensAt, settings.opensAt)
        && parsed.data.pendaftaranSaatVoting === settings.registrationDuringVoting
        && parsed.data.hasilLiveSaatVoting === settings.liveResultsDuringVoting;
      if (!unchanged) return jsonError("Selama pemungutan suara hanya waktu tutup yang dapat diubah.", 409);
    }

    const saved = await saveElectionSchedule({
      // Saat pemungutan, waktu buka tidak ditulis ulang agar presisinya tidak berubah.
      opensAt: voting ? "tetap" : opensAt,
      closesAt,
      registrationDuringVoting: voting ? settings.registrationDuringVoting : parsed.data.pendaftaranSaatVoting,
      liveResultsDuringVoting: voting ? settings.liveResultsDuringVoting : parsed.data.hasilLiveSaatVoting
    }, actor);
    if (!saved) return jsonError("Pengaturan pemilu tidak dapat disimpan.", 409);
    return Response.json({ ok: true });
  } catch (error) {
    // Penolakan dari trigger database (mis. perubahan bersamaan) dikembalikan apa adanya.
    const message = error instanceof Error && /pemungutan suara|waktu tutup/i.test(error.message)
      ? error.message
      : "Pengaturan pemilu tidak dapat disimpan.";
    console.error("Election settings failed:", error);
    return jsonError(message, 409);
  }
}

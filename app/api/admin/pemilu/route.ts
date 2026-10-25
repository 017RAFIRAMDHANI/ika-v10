import { z } from "zod";
import { closeElectionNow, openElectionNow, resetElectionToPreparation, saveElectionSchedule } from "@/lib/db";
import { fromWibInput } from "@/lib/election";
import { getElectionState } from "@/lib/election-guard";
import { auditActor, getSessionUser, isAdmin } from "@/lib/session";
import { isSameOrigin, jsonError } from "@/lib/security";

const schema = z.discriminatedUnion("aksi", [
  z.object({
    aksi: z.literal("jadwal"),
    dibukaPada: z.string().max(32),
    ditutupPada: z.string().max(32)
  }),
  z.object({ aksi: z.literal("buka") }),
  z.object({ aksi: z.literal("tutup") }),
  z.object({ aksi: z.literal("reset") })
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
  const actor = auditActor(session);

  // v10.5: kembali ke Persiapan hanya selama belum ada suara (mis. setelah uji coba buka/tutup).
  if (parsed.data.aksi === "reset") {
    if (phase === "persiapan") return jsonError("Pemilu sudah berada di tahap Persiapan.", 409);
    try {
      if (!(await resetElectionToPreparation(actor))) {
        return jsonError("Sudah ada suara masuk; pemilu tidak dapat dikembalikan ke tahap Persiapan.", 409);
      }
      return Response.json({ ok: true });
    } catch (error) {
      console.error("Election reset failed:", error);
      return jsonError("Sudah ada suara masuk; pemilu tidak dapat dikembalikan ke tahap Persiapan.", 409);
    }
  }

  if (phase === "ditutup") return jsonError("Pemungutan suara telah ditutup; pengaturan pemilu bersifat final.", 409);

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
      if (!sameMinute(opensAt, settings.opensAt)) return jsonError("Selama pemungutan suara hanya waktu tutup yang dapat diubah.", 409);
    }

    const saved = await saveElectionSchedule({
      // Saat pemungutan, waktu buka tidak ditulis ulang agar presisinya tidak berubah.
      opensAt: voting ? "tetap" : opensAt,
      closesAt
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

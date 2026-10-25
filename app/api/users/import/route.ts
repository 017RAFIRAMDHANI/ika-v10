import bcrypt from "bcryptjs";
import ExcelJS from "exceljs";
import { Readable } from "node:stream";
import { importUsers } from "@/lib/db";
import { electionLockMessage } from "@/lib/election-guard";
import { auditActor, getSessionUser, isAdmin } from "@/lib/session";
import { isSameOrigin, jsonError } from "@/lib/security";

const MAX_FILE_SIZE = 20 * 1024 * 1024;

function valueToString(value: ExcelJS.CellValue) {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    if ("text" in value && typeof value.text === "string") return value.text.trim();
    if ("result" in value && value.result !== undefined) return String(value.result).trim();
  }
  return String(value).trim();
}

function normalizeHeader(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function optionalValue(value: string) {
  const trimmed = value.trim();
  return trimmed && trimmed !== "-" ? trimmed : null;
}

type RawRecord = {
  userId: string;
  displayName: string;
  updatePassword: boolean;
  email: string | null;
  whatsapp: string | null;
  studyProgram: string | null;
  cohort: string | null;
  graduationYear: string | null;
  domicile: string | null;
};

export async function POST(request: Request) {
  try {
    if (!isSameOrigin(request)) return jsonError("Permintaan tidak valid.", 403);
    const session = await getSessionUser();
    if (!session || !isAdmin(session)) return jsonError("Akses ditolak.", 403);
    const locked = await electionLockMessage(["pemungutan"]);
    if (locked) return jsonError(locked, 409);

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) return jsonError("Pilih file Excel terlebih dahulu.");
    if (file.size > MAX_FILE_SIZE) return jsonError("Ukuran file maksimal 20 MB. Pecah file menjadi beberapa bagian bila diperlukan.");

    const extension = file.name.split(".").pop()?.toLowerCase();
    if (!extension || !["xlsx", "csv"].includes(extension)) {
      return jsonError("Format yang didukung adalah .xlsx dan .csv.");
    }

    const workbook = new ExcelJS.Workbook();
    const buffer = Buffer.from(await file.arrayBuffer());
    if (extension === "csv") {
      await workbook.csv.read(Readable.from(buffer));
    } else {
      await workbook.xlsx.load(buffer as never);
    }

    const worksheet = workbook.worksheets[0];
    if (!worksheet) return jsonError("Lembar kerja tidak ditemukan.");

    const headers = new Map<string, number>();
    worksheet.getRow(1).eachCell((cell, column) => {
      headers.set(normalizeHeader(valueToString(cell.value)), column);
    });
    const backupFormat = headers.has("userid") && headers.has("namalengkap");
    const rawRecords: RawRecord[] = [];

    for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
      const row = worksheet.getRow(rowNumber);
      const read = (header: string) => {
        const column = headers.get(normalizeHeader(header));
        return column ? valueToString(row.getCell(column).value) : "";
      };

      if (backupFormat) {
        const userId = read("User ID");
        const displayName = read("Nama Lengkap");
        if (!userId || !displayName) continue;

        // T3: kolom template wajah pada file ekspor lama diabaikan; data biometrik tidak dipulihkan
        // dari Excel agar tidak dapat dipindahkan ke akun lain. Gunakan backup SQL untuk data wajah.
        rawRecords.push({
          userId,
          displayName,
          updatePassword: false,
          email: optionalValue(read("Email"))?.toLowerCase() ?? null,
          whatsapp: optionalValue(read("WhatsApp")),
          studyProgram: optionalValue(read("Program Studi")),
          cohort: optionalValue(read("Angkatan")),
          graduationYear: optionalValue(read("Tahun Lulus")),
          domicile: optionalValue(read("Domisili"))
        });
      } else {
        const userId = valueToString(row.getCell(11).value);
        const displayName = valueToString(row.getCell(5).value);
        if (!userId || !displayName) continue;
        rawRecords.push({
          userId,
          displayName,
          updatePassword: true,
          email: null,
          whatsapp: null,
          studyProgram: null,
          cohort: null,
          graduationYear: null,
          domicile: null
        });
      }
    }

    const uniqueRecords = Array.from(
      new Map(rawRecords.map((record) => [record.userId, record])).values()
    );
    if (uniqueRecords.length === 0) {
      return jsonError(backupFormat
        ? "Tidak ada data pengguna yang dapat diimpor dari format backup IKA."
        : "Tidak ada data pengguna yang dapat diimpor. Pastikan nama ada di kolom E dan User ID di kolom K.");
    }
    if (uniqueRecords.length > 5000) return jsonError("Maksimal 5.000 akun per impor.");

    const records: Parameters<typeof importUsers>[0] = [];
    for (let index = 0; index < uniqueRecords.length; index += 25) {
      const batch = uniqueRecords.slice(index, index + 25);
      records.push(
        ...(await Promise.all(
          batch.map(async (record) => ({
            ...record,
            passwordHash: await bcrypt.hash(record.userId, 10)
          }))
        ))
      );
    }

    const result = await importUsers(records, auditActor(session), backupFormat ? "backup" : "legacy");
    return Response.json({
      ok: true,
      imported: result.saved,
      created: result.created,
      skipped: records.length - result.saved,
      format: backupFormat ? "backup" : "legacy"
    });
  } catch (error) {
    console.error("Voter import failed:", error);
    return jsonError("File tidak dapat diproses. Pastikan struktur file dan konfigurasi database sudah benar.", 500);
  }
}

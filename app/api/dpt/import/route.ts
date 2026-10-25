import ExcelJS from "exceljs";
import { Readable } from "node:stream";
import { replaceOfficialDpt } from "@/lib/db";
import { electionLockMessage } from "@/lib/election-guard";
import { auditActor, getSessionUser, isAdmin } from "@/lib/session";
import { isSameOrigin, jsonError } from "@/lib/security";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_ROWS = 20_000;
const NIM_PATTERN = /^[A-Za-z0-9./-]{5,64}$/;
const NIM_HEADERS = new Set(["nim", "npm", "npmnim", "nimnpm", "userid"]);
const NAME_HEADERS = new Set(["nama", "namalengkap", "name"]);

function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") {
    if ("richText" in value) return value.richText.map((part) => part.text).join("").trim();
    if ("text" in value && typeof value.text === "string") return value.text.trim();
    if ("result" in value) return value.result === null || value.result === undefined ? "" : String(value.result).trim();
    return "";
  }
  return String(value).trim();
}

const normalizeHeader = (value: string) => value.toLowerCase().replace(/[^a-z]/g, "");

// K6a: mengganti seluruh DPT resmi. Format: kolom A = NIM, kolom B = Nama (tanpa judul, seperti
// databook), atau baris pertama berjudul "NIM" dan "Nama".
export async function POST(request: Request) {
  try {
    if (!isSameOrigin(request)) return jsonError("Permintaan tidak valid.", 403);
    const session = await getSessionUser();
    if (!session || !isAdmin(session)) return jsonError("Akses ditolak.", 403);
    const locked = await electionLockMessage(["pemungutan"]);
    if (locked) return jsonError(locked, 409);

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) return jsonError("Pilih file DPT terlebih dahulu.");
    if (file.size > MAX_FILE_SIZE) return jsonError("Ukuran file DPT maksimal 10 MB.");
    const extension = file.name.split(".").pop()?.toLowerCase();
    if (!extension || !["xlsx", "csv"].includes(extension)) return jsonError("Format yang didukung adalah .xlsx dan .csv.");

    const workbook = new ExcelJS.Workbook();
    const buffer = Buffer.from(await file.arrayBuffer());
    if (extension === "csv") {
      // Nilai CSV dibaca apa adanya agar angka 0 di depan NIM tidak hilang.
      await workbook.csv.read(Readable.from(buffer), { map: (value: string) => value });
    } else {
      await workbook.xlsx.load(buffer as never);
    }
    const worksheet = workbook.worksheets[0];
    if (!worksheet) return jsonError("Lembar kerja tidak ditemukan.");

    let nimColumn = 1;
    let nameColumn = 2;
    let firstRow = 1;
    worksheet.getRow(1).eachCell((cell, column) => {
      const header = normalizeHeader(cellText(cell.value));
      if (NIM_HEADERS.has(header)) { nimColumn = column; firstRow = 2; }
      if (NAME_HEADERS.has(header)) { nameColumn = column; firstRow = 2; }
    });

    const entries = new Map<string, string>();
    const invalidRows: number[] = [];
    let duplicates = 0;
    for (let rowNumber = firstRow; rowNumber <= worksheet.rowCount; rowNumber += 1) {
      const row = worksheet.getRow(rowNumber);
      const nim = cellText(row.getCell(nimColumn).value);
      const nama = cellText(row.getCell(nameColumn).value);
      if (!nim && !nama) continue;
      if (!NIM_PATTERN.test(nim) || nama.length < 2 || nama.length > 255) {
        invalidRows.push(rowNumber);
        continue;
      }
      if (entries.has(nim)) { duplicates += 1; continue; }
      entries.set(nim, nama);
      if (entries.size > MAX_ROWS) return jsonError(`DPT resmi maksimal ${MAX_ROWS.toLocaleString("id-ID")} NIM.`);
    }

    if (invalidRows.length > 0) {
      const sample = invalidRows.slice(0, 10).join(", ");
      return jsonError(`Ada ${invalidRows.length} baris tidak valid (baris ${sample}${invalidRows.length > 10 ? ", ..." : ""}). NIM harus 5–64 karakter huruf/angka dan nama wajib diisi.`);
    }
    if (entries.size === 0) return jsonError("Tidak ada data DPT yang dapat dibaca. Pastikan NIM di kolom A dan Nama di kolom B.");

    const total = await replaceOfficialDpt(
      Array.from(entries, ([nim, nama]) => ({ nim, nama })),
      auditActor(session)
    );
    return Response.json({ ok: true, total, duplicates });
  } catch (error) {
    console.error("DPT import failed:", error);
    return jsonError("File DPT tidak dapat diproses. Periksa format file lalu coba lagi.", 500);
  }
}

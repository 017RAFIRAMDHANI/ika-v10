import bcrypt from "bcryptjs";
import ExcelJS from "exceljs";
import { Readable } from "node:stream";
import { importUsers, type StoredFaceTemplateInput } from "@/lib/db";
import { electionLockMessage } from "@/lib/election-guard";
import { decryptFaceDescriptor } from "@/lib/face";
import {
  FACE_DESCRIPTOR_ENGINES,
  FACE_DEVICE_CLASSES,
  FACE_MODEL_VERSION,
  FACE_MODEL_VERSIONS,
  FACE_TEMPLATE_ROLES,
  expectedEngineForRole,
  isSupportedFaceProfile,
  type FaceModelVersion
} from "@/lib/face-types";
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

function optionalDate(value: string) {
  const normalized = optionalValue(value);
  if (!normalized) return null;
  const timestamp = Date.parse(normalized);
  return Number.isNaN(timestamp) ? null : new Date(timestamp).toISOString();
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
  faceTemplates: StoredFaceTemplateInput[];
  faceVerifiedAt: string | null;
};

function parseV4Templates(value: string, rowNumber: number): StoredFaceTemplateInput[] {
  if (!value || value === "-") return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error(`JSON template wajah V4 pada baris ${rowNumber} tidak valid.`);
  }
  if (!Array.isArray(parsed) || parsed.length > 2) {
    throw new Error(`Jumlah template wajah V4 pada baris ${rowNumber} tidak valid.`);
  }
  const templates = parsed.map((item) => {
    if (!item || typeof item !== "object") throw new Error(`Template wajah V4 pada baris ${rowNumber} tidak valid.`);
    const value = item as Record<string, unknown>;
    const templateRole = String(value.templateRole ?? "") as StoredFaceTemplateInput["templateRole"];
    const descriptorEngine = String(value.descriptorEngine ?? "") as StoredFaceTemplateInput["descriptorEngine"];
    const sourceDeviceClass = String(value.sourceDeviceClass ?? "") as StoredFaceTemplateInput["sourceDeviceClass"];
    const templateEncrypted = String(value.templateEncrypted ?? "");
    const modelVersion = String(value.modelVersion ?? "");
    if (
      !FACE_TEMPLATE_ROLES.includes(templateRole)
      || !FACE_DESCRIPTOR_ENGINES.includes(descriptorEngine)
      || !FACE_DEVICE_CLASSES.includes(sourceDeviceClass)
      || expectedEngineForRole(templateRole) !== descriptorEngine
      || !FACE_MODEL_VERSIONS.includes(modelVersion as FaceModelVersion)
      || !isSupportedFaceProfile(templateRole, modelVersion as FaceModelVersion)
      || !templateEncrypted
    ) {
      throw new Error(`Metadata template wajah V4 pada baris ${rowNumber} tidak valid.`);
    }
    decryptFaceDescriptor(templateEncrypted);
    const quality = value.qualityScore === null || value.qualityScore === undefined ? null : Number(value.qualityScore);
    return {
      templateRole,
      descriptorEngine,
      modelVersion,
      sourceDeviceClass,
      templateEncrypted,
      qualityScore: Number.isFinite(quality) && quality !== null && quality >= 0 && quality <= 1 ? quality : null,
      enrolledAt: optionalDate(String(value.enrolledAt ?? "")),
      lastVerifiedAt: optionalDate(String(value.lastVerifiedAt ?? ""))
    };
  });
  if (new Set(templates.map((template) => template.templateRole)).size !== templates.length) {
    throw new Error(`Peran template wajah pada baris ${rowNumber} duplikat.`);
  }
  return templates;
}

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

        const v4TemplateValue = optionalValue(read("Data Template Wajah V4 (JSON)"));
        const legacyFaceTemplate = optionalValue(read("Data Wajah Terenkripsi"));
        let faceTemplates: StoredFaceTemplateInput[] = [];
        if (v4TemplateValue) {
          try {
            faceTemplates = parseV4Templates(v4TemplateValue, rowNumber);
          } catch (error) {
            return jsonError(`Data wajah pada baris ${rowNumber} tidak valid: ${error instanceof Error ? error.message : "gagal dibaca"}`);
          }
        } else if (legacyFaceTemplate) {
          try {
            decryptFaceDescriptor(legacyFaceTemplate);
            faceTemplates = [{
              templateRole: "desktop-primary",
              descriptorEngine: "human-webgl-v1",
              modelVersion: FACE_MODEL_VERSION,
              sourceDeviceClass: "desktop",
              templateEncrypted: legacyFaceTemplate,
              qualityScore: null,
              enrolledAt: optionalDate(read("Waktu Daftar Wajah")),
              lastVerifiedAt: optionalDate(read("Waktu Verifikasi Wajah"))
            }];
          } catch (error) {
            return jsonError(`Data wajah lama pada baris ${rowNumber} tidak valid: ${error instanceof Error ? error.message : "gagal dibaca"}`);
          }
        }
        rawRecords.push({
          userId,
          displayName,
          updatePassword: false,
          email: optionalValue(read("Email"))?.toLowerCase() ?? null,
          whatsapp: optionalValue(read("WhatsApp")),
          studyProgram: optionalValue(read("Program Studi")),
          cohort: optionalValue(read("Angkatan")),
          graduationYear: optionalValue(read("Tahun Lulus")),
          domicile: optionalValue(read("Domisili")),
          faceTemplates,
          faceVerifiedAt: faceTemplates.length ? optionalDate(read("Waktu Verifikasi Wajah")) : null
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
          domicile: null,
          faceTemplates: [],
          faceVerifiedAt: null
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

    const imported = await importUsers(records, auditActor(session), backupFormat ? "backup" : "legacy");
    return Response.json({ ok: true, imported, format: backupFormat ? "backup" : "legacy" });
  } catch (error) {
    console.error("Voter import failed:", error);
    return jsonError("File tidak dapat diproses. Pastikan struktur file dan konfigurasi database sudah benar.", 500);
  }
}

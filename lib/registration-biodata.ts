import "server-only";

import { z } from "zod";
import { findOfficialDpt, findRegistrationConflicts, getOfficialDptStatus } from "@/lib/db";
import { buildLoginCode, sameDateCodes } from "@/lib/login-code";
import { namesMatch } from "@/lib/name-match";

const currentYear = new Date().getUTCFullYear();

// Biodata pendaftaran mandiri (langkah 2). Tidak ada isian password: User ID dan password dibuat
// dari tahun angkatan + tanggal lahir, sama seperti akun alumni lain.
export const biodataSchema = z.object({
  nim: z.string().trim().min(5, "NPM/NIM minimal 5 karakter.").max(64)
    .regex(/^[A-Za-z0-9./-]+$/, "NPM/NIM hanya boleh berisi huruf, angka, titik, garis miring, atau tanda hubung."),
  displayName: z.string().trim().min(3, "Nama lengkap minimal 3 karakter.").max(255),
  email: z.string().trim().toLowerCase().email("Alamat email tidak valid.").max(320),
  whatsapp: z.string().trim().min(8, "Nomor WhatsApp minimal 8 digit.").max(32)
    .regex(/^\+?[0-9][0-9\s-]+$/, "Nomor WhatsApp tidak valid."),
  studyProgram: z.enum(["Administrasi Negara", "Administrasi Publik"]),
  cohort: z.string().trim().regex(/^\d{4}$/, "Angkatan harus terdiri dari 4 digit.")
    .refine((value) => Number(value) >= 1950 && Number(value) <= currentYear, "Tahun angkatan tidak valid."),
  graduationYear: z.union([
    z.literal(""),
    z.string().trim().regex(/^\d{4}$/, "Tahun lulus harus terdiri dari 4 digit.")
      .refine((value) => Number(value) >= 1950 && Number(value) <= currentYear + 1, "Tahun lulus tidak valid.")
  ]),
  domicile: z.string().trim().max(160).optional().default(""),
  birthDay: z.coerce.number().int().min(1, "Pilih tanggal lahir.").max(31, "Tanggal lahir tidak valid."),
  birthMonth: z.coerce.number().int().min(1, "Pilih bulan lahir.").max(12, "Bulan lahir tidak valid."),
  birthYear: z.string().trim().regex(/^\d{4}$/, "Tahun lahir harus terdiri dari 4 digit.")
    .refine((value) => Number(value) >= 1920 && Number(value) <= currentYear - 15, "Tahun lahir tidak valid.")
});

export type RegistrationBiodata = z.infer<typeof biodataSchema>;

type BiodataCheck =
  | { ok: true; loginCode: string }
  | { ok: false; status: number; message: string };

// Diperiksa sebelum pemindaian wajah (route /check) dan sekali lagi saat pendaftaran dikirim.
export async function checkRegistrationBiodata(data: RegistrationBiodata): Promise<BiodataCheck> {
  const birthDate = new Date(Date.UTC(Number(data.birthYear), data.birthMonth - 1, data.birthDay));
  if (birthDate.getUTCMonth() !== data.birthMonth - 1) {
    return { ok: false, status: 400, message: "Tanggal lahir tidak ada di kalender. Periksa tanggal dan bulan lahir." };
  }
  if (Number(data.cohort) <= Number(data.birthYear)) {
    return { ok: false, status: 400, message: "Tahun angkatan harus setelah tahun lahir. Periksa kembali angkatan dan tahun lahir." };
  }

  // K6a: bila panitia sudah mengunggah DPT resmi, NIM wajib ada di daftar dan nama harus sesuai.
  const dpt = await getOfficialDptStatus();
  if (dpt.total > 0) {
    const official = await findOfficialDpt(data.nim);
    if (!official) {
      return { ok: false, status: 409, message: "NPM/NIM tidak terdaftar di DPT resmi. Periksa kembali NPM/NIM Anda atau hubungi panitia." };
    }
    if (!namesMatch(official.nama, data.displayName)) {
      return { ok: false, status: 409, message: "Nama tidak sesuai dengan DPT resmi untuk NPM/NIM tersebut. Periksa penulisan nama atau hubungi panitia." };
    }
  }

  const loginCode = buildLoginCode(data.cohort, data.birthDay, data.birthMonth, data.birthYear);
  const conflicts = await findRegistrationConflicts(data.nim, sameDateCodes(data.cohort, data.birthDay, data.birthMonth, data.birthYear));
  if (conflicts.nimTaken) {
    return { ok: false, status: 409, message: "NPM/NIM ini sudah terdaftar. Silakan masuk melalui halaman Login, atau hubungi panitia bila Anda belum pernah mendaftar." };
  }
  if (conflicts.codeTaken) {
    return {
      ok: false,
      status: 409,
      message: `Sudah ada akun dengan angkatan dan tanggal lahir yang sama (kode ${loginCode}). Bila itu akun Anda, langsung masuk di halaman Login dengan kode tersebut. Bila bukan, hubungi panitia.`
    };
  }
  return { ok: true, loginCode };
}

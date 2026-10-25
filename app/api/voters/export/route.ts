import ExcelJS from "exceljs";
import { getVotersForExport, logAdminAction } from "@/lib/db";
import { auditActor, getSessionUser, isAdmin } from "@/lib/session";
import { jsonError } from "@/lib/security";

export async function GET() {
  const session = await getSessionUser();
  if (!session || !isAdmin(session)) return jsonError("Akses ditolak.", 403);

  const voters = await getVotersForExport();
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "E-Voting IKA AN/AP FISIP UNPAD";
  workbook.created = new Date();
  const sheet = workbook.addWorksheet("Data Pemilih");
  sheet.columns = [
    { header: "User ID", key: "userId", width: 20 },
    { header: "NPM / NIM", key: "nim", width: 18 },
    { header: "Nama Lengkap", key: "displayName", width: 32 },
    { header: "Program Studi", key: "studyProgram", width: 24 },
    { header: "Angkatan", key: "cohort", width: 12 },
    { header: "Tahun Lulus", key: "graduationYear", width: 14 },
    { header: "Email", key: "email", width: 30 },
    { header: "WhatsApp", key: "whatsapp", width: 20 },
    { header: "Domisili", key: "domicile", width: 24 },
    { header: "Status Memilih", key: "hasVoted", width: 18 },
    { header: "Wajah Terdaftar", key: "faceEnrolled", width: 18 },
    { header: "Desktop Primary", key: "desktopPrimaryEnrolled", width: 18 },
    { header: "Mobile Primary", key: "mobilePrimaryEnrolled", width: 18 },
    { header: "Lintas Perangkat", key: "canonicalEnrolled", width: 20 },
    { header: "Verifikasi Wajah", key: "faceVerified", width: 19 },
    { header: "Waktu Daftar Wajah", key: "faceEnrolledAt", width: 25 },
    { header: "Waktu Verifikasi Wajah", key: "faceVerifiedAt", width: 27 }
  ];
  sheet.addRows(
    voters.map((voter) => ({
      userId: voter.userId ?? "-",
      nim: voter.nim ?? "-",
      displayName: voter.displayName ?? "-",
      studyProgram: voter.studyProgram ?? "-",
      cohort: voter.cohort ?? "-",
      graduationYear: voter.graduationYear ?? "-",
      email: voter.email ?? "-",
      whatsapp: voter.whatsapp ?? "-",
      domicile: voter.domicile ?? "-",
      hasVoted: voter.hasVoted ? "Sudah Memilih" : "Belum Memilih",
      faceEnrolled: voter.faceEnrolled ? "Terdaftar" : "Belum Terdaftar",
      desktopPrimaryEnrolled: voter.desktopPrimaryEnrolled ? "Aktif" : "Belum Aktif",
      mobilePrimaryEnrolled: voter.mobilePrimaryEnrolled ? "Aktif" : "Belum Aktif",
      canonicalEnrolled: voter.canonicalEnrolled ? "Aktif" : "Belum Aktif",
      faceVerified: voter.faceVerified ? "Terverifikasi" : "Belum Terverifikasi",
      faceEnrolledAt: voter.faceEnrolledAt ?? "-",
      faceVerifiedAt: voter.faceVerifiedAt ?? "-"
    }))
  );
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF696CFF" } };
  sheet.autoFilter = { from: "A1", to: "Q1" };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.eachRow((row, rowNumber) => {
    row.alignment = { vertical: "middle", wrapText: rowNumber === 1 };
  });

  const guide = workbook.addWorksheet("Petunjuk");
  guide.columns = [{ width: 24 }, { width: 92 }];
  guide.addRows([
    ["Kegunaan", "Daftar pemilih untuk panitia. File ini dapat diimpor kembali melalui menu Import Excel untuk memulihkan biodata."],
    ["Password", "Password tidak diekspor. Akun yang dibuat ulang dari file ini memakai password awal yang sama dengan User ID; password akun yang masih ada tidak diubah."],
    ["Data wajah", "Template wajah (data biometrik) tidak diekspor ke Excel sesuai prinsip minimalisasi data UU PDP No. 27/2022. Backup lengkap termasuk data wajah terenkripsi hanya melalui scripts/backup-v10.mjs."],
    ["Keamanan", "Dokumen rahasia: memuat data pribadi (NIM, email, WhatsApp, domisili). Simpan terbatas pada panitia dan hapus bila tidak lagi diperlukan."]
  ]);
  guide.getColumn(1).font = { bold: true, color: { argb: "FF0B132B" } };
  guide.eachRow((row) => { row.alignment = { vertical: "top", wrapText: true }; });

  const output = await workbook.xlsx.writeBuffer();
  await logAdminAction(auditActor(session), "pemilih.ekspor", { jumlahBaris: voters.length });
  return new Response(output as BodyInit, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="data_pemilih.xlsx"',
      "Cache-Control": "no-store"
    }
  });
}

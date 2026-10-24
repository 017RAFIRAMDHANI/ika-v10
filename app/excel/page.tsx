import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import ImportDptForm from "@/components/ImportDptForm";
import ImportUsersForm from "@/components/ImportUsersForm";
import { getOfficialDptStatus } from "@/lib/db";
import { getSessionUser, isAdmin } from "@/lib/session";

export const dynamic = "force-dynamic";

function formatDate(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "long", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(date) + " WIB";
}

export default async function ExcelImportPage() {
  const user = await getSessionUser();
  if (!user || !isAdmin(user)) redirect("/admin/login");
  const dpt = await getOfficialDptStatus();

  return (
    <AppShell user={user}>
      <div className="page-heading"><div><span className="eyebrow">Bulk Data</span><h1>Import Excel</h1><p>Tambahkan atau perbarui akun pemilih secara massal menggunakan mekanisme impor yang sudah ada pada sistem.</p></div></div>
      <section className="app-card card-pad"><ImportUsersForm /></section>

      <div className="page-heading"><div><span className="eyebrow">Pendaftaran Mandiri</span><h1>DPT Resmi</h1><p>Pencocokan NIM dan nama untuk pendaftar baru di halaman pendaftaran.</p></div></div>
      <section className="app-card card-pad">
        {dpt.total > 0
          ? <div className="alert alert-success" role="status"><strong>Aktif:</strong> {dpt.total.toLocaleString("id-ID")} NIM tersimpan (diunggah {formatDate(dpt.importedAt)}). Pendaftaran mandiri hanya diterima untuk NIM di daftar ini.</div>
          : <div className="alert alert-warning" role="status"><strong>Belum diunggah:</strong> pendaftaran mandiri belum dicocokkan dengan DPT resmi. Siapa pun yang memiliki Kode Primary DPT dapat mendaftar dengan NIM apa pun.</div>}
        <ImportDptForm />
      </section>
    </AppShell>
  );
}

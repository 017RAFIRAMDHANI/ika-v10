import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import ImportUsersForm from "@/components/ImportUsersForm";
import { getSessionUser, isAdmin } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function ExcelImportPage() {
  const user = await getSessionUser();
  if (!user || !isAdmin(user)) redirect("/admin/login");

  return (
    <AppShell user={user}>
      <div className="page-heading"><div><span className="eyebrow">Bulk Data</span><h1>Import Excel</h1><p>Tambahkan atau perbarui akun pemilih secara massal menggunakan mekanisme impor yang sudah ada pada sistem.</p></div></div>
      <section className="app-card card-pad"><ImportUsersForm /></section>
    </AppShell>
  );
}

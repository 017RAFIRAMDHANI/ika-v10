import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import VotersTable from "@/components/VotersTable";
import { getVoters } from "@/lib/db";
import { getSessionUser, isAdmin } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function VotersPage() {
  const user = await getSessionUser();
  if (!user || !isAdmin(user)) redirect("/admin/login");
  const voters = await getVoters();

  return (
    <AppShell user={user}>
      <div className="page-heading"><div><span className="eyebrow">Daftar Pemilih Tetap</span><h1>Data Pemilih (DPT)</h1><p>Cari data pemilih, periksa status voting, buka detail, reset hak pilih, atau ekspor data.</p></div></div>
      <VotersTable voters={voters} />
    </AppShell>
  );
}

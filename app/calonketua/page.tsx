import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import CandidateManager from "@/components/CandidateManager";
import { getCandidates } from "@/lib/db";
import { getSessionUser, isAdmin } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function CandidatesPage() {
  const user = await getSessionUser();
  if (!user || !isAdmin(user)) redirect("/admin/login");
  const candidates = await getCandidates();

  return (
    <AppShell user={user}>
      <div className="page-heading"><div><span className="eyebrow">Master Data</span><h1>Manajemen Kandidat</h1><p>Kelola profil, foto, visi, misi, program unggulan, dan data kandidat tanpa mengubah mekanisme voting.</p></div></div>
      <CandidateManager candidates={candidates} />
    </AppShell>
  );
}

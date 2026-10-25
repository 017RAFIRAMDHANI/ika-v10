import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import CandidateManager from "@/components/CandidateManager";
import ElectionLockNotice from "@/components/ElectionLockNotice";
import { getCandidates } from "@/lib/db";
import { getElectionState } from "@/lib/election-guard";
import { getSessionUser, isAdmin } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function CandidatesPage() {
  const user = await getSessionUser();
  if (!user || !isAdmin(user)) redirect("/admin/login");
  const [candidates, election] = await Promise.all([getCandidates(), getElectionState()]);

  return (
    <AppShell user={user}>
      <div className="page-heading"><div><span className="eyebrow">Master Data</span><h1>Manajemen Kandidat</h1><p>Kelola profil, foto, visi, misi, program unggulan, dan data kandidat tanpa mengubah mekanisme voting.</p></div></div>
      <ElectionLockNotice phase={election.phase} lockedPhases={["pemungutan", "ditutup"]} subject="Perubahan data kandidat" />
      <CandidateManager candidates={candidates} />
    </AppShell>
  );
}

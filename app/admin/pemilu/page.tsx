import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import ElectionControl from "@/components/ElectionControl";
import { countBallots, countFaceTemplates } from "@/lib/db";
import { getElectionState } from "@/lib/election-guard";
import { getSessionUser, isAdmin } from "@/lib/session";

export const dynamic = "force-dynamic";

// T1: halaman tersendiri untuk jadwal & status pemilu (dan retensi data wajah setelah ditutup).
export default async function ElectionSettingsPage() {
  const user = await getSessionUser();
  if (!user || !isAdmin(user)) redirect("/admin/login");
  const [election, faceTemplateCount, ballotCount] = await Promise.all([getElectionState(), countFaceTemplates(), countBallots()]);

  return (
    <AppShell user={user}>
      <div className="page-heading"><div><span className="eyebrow">Pengaturan Pemilu</span><h1>Jadwal Pemilu</h1><p>Atur kapan pemungutan suara dibuka dan ditutup, serta pengaturan selama pemungutan suara.</p></div></div>
      <ElectionControl key={`${JSON.stringify(election.settings)}-${faceTemplateCount}-${ballotCount}`} settings={election.settings} phase={election.phase} faceTemplateCount={faceTemplateCount} ballotCount={ballotCount} />
    </AppShell>
  );
}

import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import ResultsChart from "@/components/ResultsChart";
import { getCandidates } from "@/lib/db";
import { getElectionState } from "@/lib/election-guard";
import { getSessionUser } from "@/lib/session";
import { mediaUrl } from "@/lib/media";
import AutoRefresh from "@/components/AutoRefresh";
export const dynamic = "force-dynamic";

export default async function LiveResultsPage() {
  const user = await getSessionUser();
  
  if (!user) {
    redirect("/login");
  }

  // Admin dan pemilih sama-sama melihat perolehan per kandidat, juga selama pemungutan suara.
  const { phase } = await getElectionState();

  const candidates = await getCandidates();
  const total = candidates.reduce((sum, candidate) => sum + candidate.votes, 0);

  return (
    <AppShell user={user}>
      <AutoRefresh interval={3000} />
      <div className="page-heading">
        <div>
          <span className="eyebrow">Publik & Transparansi</span>
          <h1>{phase === "ditutup" ? "Hasil Akhir Perhitungan Suara" : "Siaran Live Perhitungan Suara"}</h1>
          <p>Pantau siaran langsung proses rekapitulasi perhitungan suara beserta data perolehan suara saat ini.</p>
        </div>
        <span className="live-chip"><span className="live-dot" /> {total} Suara Masuk</span>
      </div>


      {/* Live Data Section */}
      <section className="results-grid">
        {candidates.map((candidate, index) => {
          const percentage = total ? ((candidate.votes / total) * 100).toFixed(1) : "0.0";
          return (
            <article className="app-card result-card" key={candidate.id}>
              <div className="result-card-image"><img src={mediaUrl(candidate.image)} alt={`Foto ${candidate.name}`} /></div>
              <div className="result-card-body"><span className="eyebrow">Kandidat {String(index + 1).padStart(2, "0")}</span><h3>{candidate.name}</h3><p>Perolehan: <strong>{candidate.votes} suara</strong> · {percentage}%</p></div>
            </article>
          );
        })}
        {candidates.length === 0 && <div className="app-card empty-state"><i className="bx bx-bar-chart-alt-2" />Belum ada data kandidat.</div>}
      </section>
      {candidates.length > 0 && <section className="app-card chart-card"><div className="section-title-row"><h2>Perbandingan Suara Kandidat</h2></div><ResultsChart candidates={candidates} /></section>}
    </AppShell>
  );
}

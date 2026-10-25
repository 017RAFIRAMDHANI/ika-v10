import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import VoterEditForm from "@/components/VoterEditForm";
import ElectionLockNotice from "@/components/ElectionLockNotice";
import { getVoter } from "@/lib/db";
import { getElectionState } from "@/lib/election-guard";
import { getSessionUser, isAdmin } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function VoterDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user || !isAdmin(user)) redirect("/admin/login");
  const { id } = await params;
  const voterId = Number(id);
  if (!Number.isInteger(voterId) || voterId <= 0) notFound();
  const [voter, election] = await Promise.all([getVoter(voterId), getElectionState()]);
  if (!voter) notFound();

  return (
    <AppShell user={user}>
      <div className="page-heading">
        <div><span className="eyebrow">Detail DPT</span><h1>Detail Pemilih</h1><p>Informasi ini bersumber langsung dari data pengguna dan status voting pada sistem.</p></div>
        <Link href="/datapemilih" className="app-btn app-btn-soft"><i className="bx bx-left-arrow-alt" /> Kembali</Link>
      </div>
      <ElectionLockNotice phase={election.phase} lockedPhases={["pemungutan"]} subject="Reset data wajah" />
      <section className="app-card card-pad"><VoterEditForm voter={voter} /></section>
    </AppShell>
  );
}

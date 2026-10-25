import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import { getVoteIntegrity } from "@/lib/db";
import { getSessionUser, isAdmin } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function AuditLogPage() {
  const user = await getSessionUser();
  if (!user || !isAdmin(user)) redirect("/admin/login");
  const integrity = await getVoteIntegrity();

  return (
    <AppShell user={user}>
      <div className="page-heading">
        <div>
          <span className="eyebrow">Transparansi</span>
          <h1>Audit Suara</h1>
          <p>Penghitung suara tiap kandidat dicocokkan dengan surat suara anonim. Tindakan administrator tetap tercatat otomatis di database dan tidak dapat diubah atau dihapus dari aplikasi.</p>
        </div>
      </div>

      <section className="app-card">
        <div className="toolbar">
          <div>
            <strong style={{ color: "var(--app-900)", fontSize: ".85rem" }}>Rekonsiliasi Suara</strong>
            <div className="muted" style={{ fontSize: ".66rem", marginTop: 4 }}>
              {integrity.votedUsers} pemilih sudah memilih · {integrity.ballots} surat suara anonim tersimpan
            </div>
          </div>
          {integrity.consistent
            ? <span className="badge badge-success"><i className="bx bx-check" /> Konsisten</span>
            : <span className="badge badge-warning"><i className="bx bx-error" /> Tidak konsisten — periksa database</span>}
        </div>
        <div className="data-table-wrap">
          <table className="data-table">
            <thead><tr><th>#</th><th>Kandidat</th><th>Penghitung Suara</th><th>Surat Suara</th><th>Status</th></tr></thead>
            <tbody>
              {integrity.candidates.map((candidate, index) => (
                <tr key={candidate.id}>
                  <td>{index + 1}</td>
                  <td><strong>{candidate.name}</strong></td>
                  <td>{candidate.votes}</td>
                  <td>{candidate.ballots}</td>
                  <td>{candidate.votes === candidate.ballots
                    ? <span className="badge badge-success">Sesuai</span>
                    : <span className="badge badge-warning">Selisih {candidate.votes - candidate.ballots}</span>}</td>
                </tr>
              ))}
              {integrity.candidates.length === 0 && <tr><td colSpan={5}><div className="empty-state"><i className="bx bx-user-x" />Belum ada kandidat.</div></td></tr>}
            </tbody>
          </table>
        </div>
      </section>

    </AppShell>
  );
}

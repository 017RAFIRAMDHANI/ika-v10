import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import { getAuditLog, getVoteIntegrity } from "@/lib/db";
import { getSessionUser, isAdmin } from "@/lib/session";

export const dynamic = "force-dynamic";

const actionLabels: Record<string, string> = {
  "admin.login": "Login administrator",
  "admin.ganti_password": "Ganti password administrator (wajib, password lemah)",
  "akun.tambah": "Tambah akun",
  "akun.ubah": "Ubah akun",
  "akun.hapus": "Hapus akun",
  "wajah.reset": "Reset data wajah",
  "wajah.hapus_semua": "Hapus seluruh data wajah (retensi)",
  "kandidat.tambah": "Tambah kandidat",
  "kandidat.ubah": "Ubah kandidat",
  "kandidat.hapus": "Hapus kandidat",
  "pemilih.impor": "Impor data pemilih",
  "pemilih.ekspor": "Ekspor data pemilih",
  "dpt.impor": "Unggah DPT resmi",
  "pemilu.jadwal": "Ubah jadwal pemilu",
  "pemilu.buka": "Buka pemungutan suara",
  "pemilu.tutup": "Tutup pemungutan suara",
  "pemilu.reset": "Kembalikan pemilu ke Persiapan (tanpa suara)",
  "sistem.migrasi_v9": "Migrasi data dari v9"
};

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "medium",
    timeZone: "Asia/Jakarta"
  }).format(date) + " WIB";
}

function formatDetails(details: Record<string, string | number | boolean>) {
  const entries = Object.entries(details ?? {});
  if (entries.length === 0) return "-";
  return entries.map(([key, value]) => `${key}: ${typeof value === "boolean" ? (value ? "ya" : "tidak") : value}`).join(" · ");
}

export default async function AuditLogPage() {
  const user = await getSessionUser();
  if (!user || !isAdmin(user)) redirect("/admin/login");
  const [entries, integrity] = await Promise.all([getAuditLog(), getVoteIntegrity()]);

  return (
    <AppShell user={user}>
      <div className="page-heading">
        <div>
          <span className="eyebrow">Transparansi Administrator</span>
          <h1>Log Audit</h1>
          <p>Setiap tindakan administrator tercatat otomatis dan tidak dapat diubah atau dihapus dari aplikasi. Pilihan kandidat pemilih tidak pernah dicatat.</p>
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

      <section className="app-card">
        <div className="toolbar">
          <div>
            <strong style={{ color: "var(--app-900)", fontSize: ".85rem" }}>Riwayat Tindakan</strong>
            <div className="muted" style={{ fontSize: ".66rem", marginTop: 4 }}>{entries.length} catatan terbaru</div>
          </div>
        </div>
        <div className="data-table-wrap">
          <table className="data-table">
            <thead><tr><th>Waktu</th><th>Administrator</th><th>Tindakan</th><th>Sasaran</th><th>Rincian</th></tr></thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id}>
                  <td>{formatDate(entry.createdAt)}</td>
                  <td><strong>{entry.actorName}</strong><div className="muted" style={{ fontSize: ".66rem" }}>{entry.actorUserId}</div></td>
                  <td>{actionLabels[entry.action] ?? entry.action}</td>
                  <td>{entry.targetLabel ?? "-"}</td>
                  <td className="muted">{formatDetails(entry.details)}</td>
                </tr>
              ))}
              {entries.length === 0 && <tr><td colSpan={5}><div className="empty-state"><i className="bx bx-history" />Belum ada tindakan administrator.</div></td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </AppShell>
  );
}

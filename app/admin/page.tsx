import Link from "next/link";
import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import { getAdminStats, getCandidates } from "@/lib/db";
import { getSessionUser, isAdmin } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  const user = await getSessionUser();
  if (!user || !isAdmin(user)) redirect("/admin/login");
  const [stats, candidates] = await Promise.all([getAdminStats(), getCandidates()]);
  const unvoted = Math.max(stats.voters - stats.voted, 0);
  const total = candidates.reduce((sum, item) => sum + item.votes, 0);

  return (
    <AppShell user={user}>
      <div className="page-heading">
        <div><span className="eyebrow">Ringkasan Sistem</span><h1>Dashboard Administrator</h1><p>Pantau partisipasi, kandidat, akun, dan perolehan suara dari satu panel.</p></div>
      </div>

      <section className="stats-grid">
        <Link href="/datapemilih" className="stat-card primary"><i className="bx bx-group stat-icon" /><p>Total DPT</p><strong>{stats.voters}</strong></Link>
        <div className="stat-card"><i className="bx bx-check-circle stat-icon success" /><p>Sudah Memilih</p><strong>{stats.voted}</strong></div>
        <div className="stat-card"><i className="bx bx-time-five stat-icon warning" /><p>Belum Memilih</p><strong>{unvoted}</strong></div>
        <Link href="/calonketua" className="stat-card"><i className="bx bx-award stat-icon" /><p>Total Kandidat</p><strong>{stats.candidates}</strong></Link>
        <Link href="/admin/users" className="stat-card"><i className="bx bx-id-card stat-icon info" /><p>Total Akun</p><strong>{stats.users}</strong></Link>
      </section>

      <section className="quick-section">
        <div className="section-title-row"><h2>Perolehan Suara Terkini</h2><span className="live-chip"><span className="live-dot" /> Rekap Sistem</span></div>
        <div className="app-card card-pad quick-count">
          {candidates.length ? candidates.map((candidate, index) => {
            const percentage = total ? Math.round((candidate.votes / total) * 100) : 0;
            return (
              <div key={candidate.id}>
                <div className="quick-row-head"><span>{String(index + 1).padStart(2, "0")} - {candidate.name}</span><span>{percentage}% <small>({candidate.votes} Suara)</small></span></div>
                <div className="quick-track"><div className="quick-fill" style={{ width: `${percentage}%` }} /></div>
              </div>
            );
          }) : <div className="empty-state"><i className="bx bx-user-x" />Belum ada kandidat.</div>}
        </div>
      </section>

      <section className="admin-menu-grid" aria-label="Menu cepat administrator">
        <Link href="/datapemilih" className="admin-menu-card"><i className="bx bx-data" /><strong>Data Pemilih</strong><span>Cari pemilih, lihat detail, dan ekspor Excel.</span></Link>
        <Link href="/calonketua" className="admin-menu-card"><i className="bx bx-user-pin" /><strong>Kelola Kandidat</strong><span>Tambah, edit, dan hapus kandidat sesuai aturan sistem.</span></Link>
        <Link href="/admin/users" className="admin-menu-card"><i className="bx bx-group" /><strong>Kelola Akun</strong><span>Tambah akun, ubah role/password, dan hapus akun yang belum memilih.</span></Link>
        <Link href="/live" className="admin-menu-card"><i className="bx bx-bar-chart-alt-2" /><strong>Hasil Suara</strong><span>Lihat rekap kandidat dan grafik perolehan suara.</span></Link>
        <Link href="/excel" className="admin-menu-card"><i className="bx bx-import" /><strong>Import Excel</strong><span>Impor akun pemilih secara massal dari XLSX atau CSV.</span></Link>
        <Link href="/admin/audit" className="admin-menu-card"><i className="bx bx-history" /><strong>Log Audit</strong><span>Riwayat seluruh tindakan administrator dan rekonsiliasi jumlah suara.</span></Link>
      </section>
    </AppShell>
  );
}

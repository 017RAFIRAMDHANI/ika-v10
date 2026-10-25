"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import type { SessionUser } from "@/lib/types";

function isActive(pathname: string, route: string) {
  return route === "/" || route === "/admin" ? pathname === route : pathname.startsWith(route);
}

const adminLinks = [
  { href: "/admin", label: "Dashboard", icon: "bx-grid-alt" },
  { href: "/datapemilih", label: "DPT", icon: "bx-group" },
  { href: "/calonketua", label: "Kandidat", icon: "bx-user-pin" },
  { href: "/live", label: "Hasil", icon: "bx-bar-chart-alt-2" },
  { href: "/admin/pemilu", label: "Pemilu", icon: "bx-calendar-check" },
  { href: "/admin/users", label: "Akun", icon: "bx-id-card" },
  { href: "/excel", label: "Import", icon: "bx-import" },
  { href: "/admin/audit", label: "Audit", icon: "bx-history" }
] as const;

export default function AppShell({
  user,
  children
}: {
  user: SessionUser | null;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const admin = user?.role === "Admin";

  if (!user) return <>{children}</>;

  if (admin) {
    return (
      <div className="app-shell admin-shell">
        <header className="admin-header">
          <div className="shell-width admin-header-inner">
            <Link href="/admin" className="admin-brand" aria-label="Dashboard admin">
              <span className="admin-brand-icon"><img src="/assets/img/logo.png" alt="Logo" style={{ width: 24, height: 24, objectFit: "contain" }} /></span>
              <span>
                <strong>Admin Panel</strong>
                <small>E-Voting IKA</small>
              </span>
            </Link>

            <nav className="admin-desktop-nav" aria-label="Navigasi administrator">
              {adminLinks.map((item) => (
                <Link key={item.href} href={item.href} className={isActive(pathname, item.href) ? "active" : ""}>
                  {item.label}
                </Link>
              ))}
              <form action="/api/auth/logout?target=admin" method="post" onSubmit={(e) => { if (!window.confirm("Apakah Anda yakin ingin keluar dari Admin Panel?")) e.preventDefault(); }}>
                <button type="submit" className="nav-logout">Keluar</button>
              </form>
            </nav>
          </div>
        </header>

        <main className="shell-width app-content admin-content">{children}</main>

        <nav className="mobile-bottom-nav admin-mobile-nav" aria-label="Navigasi admin mobile">
          {adminLinks.slice(0, 4).map((item) => (
            <Link key={item.href} href={item.href} className={isActive(pathname, item.href) ? "active" : ""}>
              <i className={`bx ${item.icon}`} />
              <span>{item.label}</span>
            </Link>
          ))}
          <button type="button" className={moreOpen ? "active" : ""} onClick={() => setMoreOpen((value) => !value)}>
            <i className="bx bx-dots-horizontal-rounded" />
            <span>Lainnya</span>
          </button>
        </nav>

        {moreOpen && (
          <div className="mobile-more-sheet" role="dialog" aria-label="Menu lainnya">
            <button className="mobile-sheet-close" type="button" onClick={() => setMoreOpen(false)} aria-label="Tutup menu">
              <i className="bx bx-x" />
            </button>
            <h3>Menu Administrator</h3>
            <div className="mobile-more-grid">
              <Link href="/admin/pemilu" onClick={() => setMoreOpen(false)}><i className="bx bx-calendar-check" /><span>Jadwal Pemilu</span></Link>
              <Link href="/admin/users" onClick={() => setMoreOpen(false)}><i className="bx bx-id-card" /><span>Kelola Akun</span></Link>
              <Link href="/excel" onClick={() => setMoreOpen(false)}><i className="bx bx-import" /><span>Import Excel</span></Link>
              <Link href="/admin/audit" onClick={() => setMoreOpen(false)}><i className="bx bx-history" /><span>Log Audit</span></Link>
              <form action="/api/auth/logout?target=admin" method="post" onSubmit={(e) => { if (!window.confirm("Apakah Anda yakin ingin keluar dari Admin Panel?")) e.preventDefault(); }}>
                <button type="submit"><i className="bx bx-log-out" /><span>Keluar</span></button>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  }

  const dashboard = pathname === "/";
  return (
    <div className="app-shell voter-shell">
      <header className={`voter-header ${dashboard ? "voter-header-dashboard" : "voter-header-compact"}`}>
        <div className="shell-width voter-topbar">
          <Link href="/" className="voter-brand">
            <img src="/assets/img/logo.png" alt="Logo IKA" style={{ height: 42, width: "auto" }} /><small>E-Voting</small>
          </Link>
          <nav className="voter-desktop-nav">
            <Link href="/" className={isActive(pathname, "/") ? "active" : ""}>Beranda</Link>
            <Link href="/pemilihan" className={isActive(pathname, "/pemilihan") ? "active" : ""}>Bilik Suara</Link>
            <Link href="/live" className={isActive(pathname, "/live") ? "active" : ""}>Siaran Live</Link>
            <Link href="/akun" className={isActive(pathname, "/akun") ? "active" : ""}>Akun Saya</Link>
            <form action="/api/auth/logout?target=voter" method="post" onSubmit={(e) => { if (!window.confirm("Apakah Anda yakin ingin keluar?")) e.preventDefault(); }}>
              <button type="submit"><i className="bx bx-log-out" /> Keluar</button>
            </form>
          </nav>
        </div>
        {dashboard && (
          <div className="shell-width voter-profile-strip">
            <div className="voter-profile">
              <span className="voter-avatar">{user.displayName.slice(0, 2).toUpperCase()}</span>
              <span><small>Selamat Datang,</small><strong>{user.displayName}</strong><em>ID: {user.userId}</em></span>
            </div>
            <div className={`vote-status-card ${user.hasVoted ? "used" : "available"}`}>
              <span className="status-icon"><i className={`bx ${user.hasVoted ? "bx-check-shield" : "bx-shield-quarter"}`} /></span>
              <span><small>Hak Suara</small><strong>{user.hasVoted ? "Sudah Digunakan" : "Belum Digunakan"}</strong></span>
            </div>
          </div>
        )}
      </header>

      <main className="shell-width app-content voter-content">{children}</main>

      <nav className="mobile-bottom-nav voter-mobile-nav" aria-label="Navigasi pemilih mobile">
        <Link href="/" className={isActive(pathname, "/") ? "active" : ""}><i className="bx bx-home-alt" /><span>Beranda</span></Link>
        <Link href="/pemilihan" className={`vote-nav ${isActive(pathname, "/pemilihan") ? "active" : ""}`}><i className="bx bx-check-square" /><span>Voting</span></Link>
        <button type="button" className={moreOpen ? "active" : ""} onClick={() => setMoreOpen((value) => !value)}>
          <i className="bx bx-dots-horizontal-rounded" />
          <span>Pengaturan</span>
        </button>
      </nav>

      {moreOpen && (
        <div className="mobile-more-sheet" role="dialog" aria-label="Pengaturan">
          <button className="mobile-sheet-close" type="button" onClick={() => setMoreOpen(false)} aria-label="Tutup menu">
            <i className="bx bx-x" />
          </button>
          <h3>Pengaturan</h3>
          <div className="mobile-more-grid">
            <Link href="/live" onClick={() => setMoreOpen(false)}><i className="bx bx-broadcast" /><span>Siaran Live</span></Link>
            <Link href="/akun" onClick={() => setMoreOpen(false)}><i className="bx bx-user" /><span>Akun Saya</span></Link>
            <form action="/api/auth/logout?target=voter" method="post" onSubmit={(e) => { if (!window.confirm("Apakah Anda yakin ingin keluar?")) e.preventDefault(); }}>
              <button type="submit"><i className="bx bx-log-out" /><span>Keluar</span></button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

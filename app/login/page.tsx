import Link from "next/link";
import { redirect } from "next/navigation";
import LoginForm from "@/components/LoginForm";
import { getSessionUser, isAdmin } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const user = await getSessionUser();
  if (isAdmin(user)) redirect("/admin");
  if (user) redirect("/");

  return (
    <main className="auth-page">
      <section className="auth-panel">
        <aside className="auth-brand">
          <div>
            <Link href="/" className="auth-back"><i className="bx bx-left-arrow-alt" /> Kembali</Link>
            <div style={{ marginTop: 42 }}>
              <img src="/assets/img/logo.png" alt="Logo IKA" className="auth-logo" />
              <h1>Portal Resmi<br />E-Voting Alumni</h1>
              <p>Masuk menggunakan User ID dan password yang sudah terdaftar untuk mengakses bilik suara.</p>
            </div>
          </div>
          <footer>IKA AN/AP FISIP UNPAD · Sistem Pemilihan Ketua</footer>
        </aside>

        <div className="auth-form-side">
          <div className="auth-mobile-bar"><Link href="/"><i className="bx bx-chevron-left" /></Link><span>Otorisasi</span><i /></div>
          <div className="auth-mobile-icon"><i className="bx bx-fingerprint" /></div>
          <h2>Selamat Datang</h2>
          <p>Masuk untuk melanjutkan ke dashboard dan bilik suara.</p>
          <div className="auth-hint">
            <i className="bx bx-info-circle" />
            <span>
              <strong>User ID dan password:</strong> tahun angkatan + tanggal lahir + bulan lahir + tahun lahir.<br />
              Contoh: angkatan 2004, lahir 19 Desember 1995 → <strong>200419121995</strong>. Angka 0 pada tanggal/bulan boleh ditulis atau tidak (05 atau 5).<br />
              Mendaftar mandiri: User ID = NPM/NIM, password sesuai saat mendaftar.
            </span>
          </div>
          <LoginForm />
          <Link href="/daftar" className="auth-register-link"><i className="bx bx-user-plus" /> Belum masuk DPT? Daftar tanpa login</Link>
          <Link href="/admin/login" className="app-btn app-btn-soft auth-switch"><i className="bx bx-shield-quarter" /> Masuk sebagai Administrator</Link>
        </div>
      </section>
    </main>
  );
}

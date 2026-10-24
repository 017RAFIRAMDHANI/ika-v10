import Link from "next/link";
import { redirect } from "next/navigation";
import AdminLoginForm from "@/components/AdminLoginForm";
import { getSessionUser, isAdmin } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function AdminLoginPage() {
  const user = await getSessionUser();
  if (isAdmin(user)) redirect("/admin");

  return (
    <main className="auth-page">
      <section className="auth-panel">
        <aside className="auth-brand">
          <div>
            <Link href="/login" className="auth-back"><i className="bx bx-left-arrow-alt" /> Login Pemilih</Link>
            <div style={{ marginTop: 42 }}>
              <img src="/assets/img/logo.png" alt="Logo IKA" className="auth-logo" />
              <h1>Administrator<br />E-Voting IKA</h1>
              <p>Panel ini khusus administrator untuk mengelola kandidat, akun, data pemilih, impor data, dan rekapitulasi suara.</p>
            </div>
          </div>
          <footer>Akses administratif · Gunakan kredensial resmi</footer>
        </aside>

        <div className="auth-form-side">
          <div className="auth-mobile-bar"><Link href="/login"><i className="bx bx-chevron-left" /></Link><span>Admin</span><i /></div>
          <div className="auth-mobile-icon"><i className="bx bx-shield-quarter" /></div>
          <h2>Login Admin</h2>
          <p>Masukkan kredensial administrator untuk membuka panel pengelolaan.</p>
          <div className="auth-hint"><i className="bx bx-lock-alt" /><span>Akses akan ditolak jika akun yang digunakan bukan akun dengan role Admin.</span></div>
          <AdminLoginForm />
          <Link href="/login" className="app-btn app-btn-soft auth-switch"><i className="bx bx-user" /> Kembali ke Login Pemilih</Link>
        </div>
      </section>
    </main>
  );
}

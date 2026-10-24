import Link from "next/link";
import { redirect } from "next/navigation";
import RegistrationForm from "@/components/RegistrationForm";
import { getSessionUser, isAdmin } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function RegistrationPage() {
  const user = await getSessionUser();
  if (isAdmin(user)) redirect("/admin");
  if (user) redirect("/");

  return (
    <main className="registration-page">
      <header className="registration-header">
        <div className="registration-header-inner">
          <Link href="/" className="registration-brand"><img src="/assets/img/logo.png" alt="Logo IKA" /><span><strong>Pendaftaran DPT</strong><small>IKA AN/AP FISIP UNPAD</small></span></Link>
          <Link href="/login" className="app-btn app-btn-soft"><i className="bx bx-log-in" /> Sudah punya akun?</Link>
        </div>
      </header>
      <div className="registration-shell">
        <div className="registration-hero">
          <span className="eyebrow">Formulir Resmi dengan Kode Primary</span>
          <h1>Daftar sebagai Pemilih</h1>
          <p>Verifikasi Kode Primary DPT, lengkapi biodata alumni, lalu daftarkan wajah melalui tiga langkah terpisah. Kode diberikan oleh administrator kepada calon pemilih yang berhak.</p>
          <div className="registration-trust"><span><i className="bx bx-key" /> Akses dengan kode primary</span><span><i className="bx bx-lock-alt" /> Data biometrik terenkripsi</span><span><i className="bx bx-camera" /> Foto tidak disimpan</span><span><i className="bx bx-check-shield" /> Satu akun, satu verifikasi</span></div>
        </div>
        <div className="registration-card app-card"><RegistrationForm /></div>
      </div>
    </main>
  );
}

import Link from "next/link";
import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import { formatWib } from "@/lib/election";
import { getElectionState } from "@/lib/election-guard";
import { getSessionUser, isAdmin } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const user = await getSessionUser();
  if (isAdmin(user)) redirect("/admin");

  if (!user) {
    return (
      <main className="onboarding">
        <section className="onboarding-content">
          <div className="onboarding-inner">
            <div className="onboarding-logo">IKA</div>
            <span className="eyebrow">Portal E-Voting Resmi</span>
            <h1>Sinergi Kuat,<br /><span>Tradisi Hebat.</span></h1>
            <p>
              Selamat datang di platform pemilihan Ketua IKA AN/AP FISIP UNPAD. Gunakan akun yang terdaftar untuk masuk dan menggunakan hak suara secara aman melalui sistem yang telah tersedia.
            </p>
            <div className="onboarding-features">
              <div className="onboarding-feature">
                <i className="bx bx-shield-quarter" />
                <strong>Akses Terautentikasi</strong>
                <small>Session pengguna dilindungi dan hanya akun terdaftar yang dapat memberikan suara.</small>
              </div>
              <div className="onboarding-feature">
                <i className="bx bx-check-square" />
                <strong>Satu Akun, Satu Suara</strong>
                <small>Sistem menolak pengiriman suara kedua setelah hak pilih digunakan.</small>
              </div>
            </div>
            <Link href="/login" className="app-btn app-btn-gold onboarding-cta">
              Masuk ke Sistem Pemilihan <i className="bx bx-right-arrow-alt" />
            </Link>
            <Link href="/daftar" className="onboarding-register-link">
              Belum terdaftar di DPT? <strong>Daftar sebagai alumni</strong> <i className="bx bx-user-plus" />
            </Link>
          </div>
        </section>
        <section className="onboarding-image" aria-label="Ilustrasi alumni">
          <div className="onboarding-image-top">
            <img src="/assets/img/logo.png" alt="Logo IKA" />
            <span className="version-chip">E-Voting IKA</span>
          </div>
        </section>
      </main>
    );
  }

  // T1: isi banner mengikuti tahap pemilu yang diatur admin.
  const { settings, phase } = await getElectionState();
  const schedule = settings.opensAt
    ? `Pemungutan suara dibuka ${formatWib(settings.opensAt)}${settings.closesAt ? ` dan ditutup ${formatWib(settings.closesAt)}` : ""}.`
    : "Jadwal pemungutan suara belum ditetapkan panitia.";
  const banner = user.hasVoted
    ? { heading: "Terima kasih telah memilih", text: "Hak suara akun ini sudah digunakan. Pilihan yang telah dikirim tidak dapat diubah oleh pemilih.", href: "/pemilihan", cta: "Lihat Status Pemilihan", primary: false }
    : phase === "persiapan"
      ? {
          heading: "Bilik Suara Belum Dibuka",
          text: `${schedule} ${user.faceEnrolled ? "Wajah Anda sudah aktif; silakan kembali saat bilik suara dibuka." : "Sambil menunggu, aktifkan wajah Anda sekarang agar siap memilih."}`,
          href: "/pemilihan",
          cta: user.faceEnrolled ? "Lihat Status Aktivasi" : "Aktivasi Wajah",
          primary: !user.faceEnrolled
        }
      : phase === "pemungutan"
        ? {
            heading: "Bilik Suara Dibuka",
            text: `Pelajari profil, visi, misi, dan program unggulan setiap kandidat sebelum menentukan pilihan Anda.${settings.closesAt ? ` Bilik suara ditutup ${formatWib(settings.closesAt)}.` : ""}`,
            href: "/pemilihan",
            cta: "Masuk Bilik Suara",
            primary: true
          }
        : { heading: "Pemungutan Suara Telah Ditutup", text: "Terima kasih atas partisipasi seluruh alumni. Hasil akhir dapat dilihat di Siaran Live.", href: "/live", cta: "Lihat Hasil", primary: false };

  return (
    <AppShell user={user}>
      <section className="user-dashboard-grid">
        <article className={`vote-action-banner ${banner.primary ? "" : "disabled"}`}>
          <span className="eyebrow">Pemilihan Ketua IKA AN/AP</span>
          <h2>{banner.heading}</h2>
          <p>{banner.text}</p>
          <Link href={banner.href} className={`app-btn ${banner.primary ? "app-btn-gold" : "app-btn-soft"}`}>
            {banner.cta} <i className="bx bx-right-arrow-alt" />
          </Link>
        </article>

        <aside className="info-panel">
          <h3>Informasi Penting</h3>
          <div className="info-list">
            <div className="info-item">
              <span className="info-icon blue"><i className="bx bx-user-check" /></span>
              <div><strong>Pastikan Identitas Akun</strong><p>Gunakan User ID yang diberikan panitia. Nama dan status hak suara mengikuti data pada sistem.</p></div>
            </div>
            <div className="info-item">
              <span className="info-icon green"><i className="bx bx-lock-alt" /></span>
              <div><strong>Pilihan Bersifat Final</strong><p>Setelah suara berhasil dikirim, sistem menandai akun sebagai sudah memilih dan mencegah voting ulang.</p></div>
            </div>
          </div>
        </aside>
      </section>
    </AppShell>
  );
}

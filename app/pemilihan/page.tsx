import Link from "next/link";
import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import FaceGate from "@/components/FaceGate";
import VotingForm from "@/components/VotingForm";
import { getCandidates, getFaceVerificationRecord } from "@/lib/db";
import { formatWib } from "@/lib/election";
import { getElectionState } from "@/lib/election-guard";
import { FACE_MODEL_VERSIONS } from "@/lib/face-types";
import { getSessionUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function VotingPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  if (user.role === "Admin") {
    return (
      <AppShell user={user}>
        <section className="success-screen">
          <div className="success-inner">
            <div className="success-check" style={{ color: "var(--app-error)" }}>
              <i className="bx bx-shield-x" style={{ fontSize: 48 }} />
            </div>
            <h1>Akses Ditolak</h1>
            <p>Akun Administrator tidak memiliki hak suara dalam pemilihan ini. Bilik suara hanya dapat diakses oleh Alumni yang terdaftar dalam DPT.</p>
            <Link href="/admin" className="app-btn app-btn-gold">Kembali ke Dashboard <i className="bx bx-home-alt" /></Link>
          </div>
        </section>
      </AppShell>
    );
  }

  if (user.hasVoted) {
    return (
      <AppShell user={user}>
        <section className="success-screen">
          <div className="success-inner">
            <div className="success-check">
              <svg className="animated-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
            </div>
            <h1>Voting Berhasil!</h1>
            <p>Hak suara akun Anda sudah tercatat oleh sistem. Sesuai aturan aplikasi, akun yang sudah memilih tidak dapat mengirim suara kedua.</p>
            <div className="success-ticket">
              <div className="success-ticket-row"><span>Status</span><strong>Suara Tercatat</strong></div>
              <div className="success-ticket-row"><span>Nama Pemilih</span><strong>{user.displayName}</strong></div>
              <div className="success-ticket-row"><span>User ID</span><strong>{user.userId}</strong></div>
            </div>
            <Link href="/" className="app-btn app-btn-gold">Kembali ke Beranda <i className="bx bx-home-alt" /></Link>
          </div>
        </section>
      </AppShell>
    );
  }

  // T1: bilik suara hanya dibuka selama pemungutan suara; tahap persiapan untuk aktivasi wajah.
  const { settings, phase } = await getElectionState();
  if (phase === "ditutup") {
    return (
      <AppShell user={user}>
        <section className="success-screen">
          <div className="success-inner">
            <div className="success-check"><i className="bx bx-lock-alt" style={{ fontSize: 44 }} /></div>
            <h1>Pemungutan Suara Telah Ditutup</h1>
            <p>Bilik suara sudah ditutup sehingga hak suara tidak dapat digunakan lagi. Hasil akhir dapat dilihat di Siaran Live.</p>
            <Link href="/live" className="app-btn app-btn-gold">Lihat Hasil <i className="bx bx-bar-chart-alt-2" /></Link>
          </div>
        </section>
      </AppShell>
    );
  }
  const schedule = settings.opensAt
    ? `Bilik suara dibuka ${formatWib(settings.opensAt)}${settings.closesAt ? ` dan ditutup ${formatWib(settings.closesAt)}` : ""}.`
    : "Jadwal pemungutan suara belum ditetapkan panitia.";
  if (phase === "persiapan" && user.faceEnrolled) {
    return (
      <AppShell user={user}>
        <section className="success-screen">
          <div className="success-inner">
            <div className="success-check"><i className="bx bx-time-five" style={{ fontSize: 44 }} /></div>
            <h1>Bilik Suara Belum Dibuka</h1>
            <p>{schedule} Wajah Anda sudah aktif dan siap dipakai saat bilik suara dibuka.</p>
            <Link href="/" className="app-btn app-btn-gold">Kembali ke Beranda <i className="bx bx-home-alt" /></Link>
          </div>
        </section>
      </AppShell>
    );
  }

  if (!user.faceVerified) {
    const canonicalRecord = user.canonicalEnrolled
      ? await getFaceVerificationRecord(user.id, "canonical-cross-device", "human-wasm-v1")
      : null;
    const canonicalModelVersion = FACE_MODEL_VERSIONS.find((version) => version === canonicalRecord?.modelVersion) ?? null;
    return (
      <AppShell user={user}>
        <div className="voting-page-head">
          <Link href="/" className="back-link"><i className="bx bx-left-arrow-alt" /> Kembali ke dashboard</Link>
          <span className="eyebrow" style={{ display: "block", marginBottom: 6 }}>Verifikasi Identitas</span>
          <h1>{phase === "persiapan" ? "Aktivasi Wajah" : "Bilik Suara Terkunci"}</h1>
          <p>{phase === "persiapan"
            ? `${schedule} Aktifkan wajah Anda sekarang agar siap memilih saat bilik suara dibuka.`
            : "Verifikasi wajah pendaftar diperlukan pada sesi login ini sebelum kandidat dapat ditampilkan."}</p>
        </div>
        <FaceGate
          desktopPrimaryEnrolled={user.desktopPrimaryEnrolled}
          mobilePrimaryEnrolled={user.mobilePrimaryEnrolled}
          canonicalEnrolled={user.canonicalEnrolled}
          canonicalModelVersion={canonicalModelVersion}
        />
      </AppShell>
    );
  }

  const candidates = await getCandidates();
  return (
    <AppShell user={user}>
      <div className="voting-page-head">
        <Link href="/" className="back-link"><i className="bx bx-left-arrow-alt" /> Kembali ke dashboard</Link>
        <span className="eyebrow" style={{ display: "block", marginBottom: 6 }}>Gunakan Hak Suara</span>
        <h1>Bilik Suara</h1>
        <p>Pelajari seluruh informasi kandidat sebelum mengirim pilihan.</p>
      </div>
      <VotingForm candidates={candidates} />
    </AppShell>
  );
}

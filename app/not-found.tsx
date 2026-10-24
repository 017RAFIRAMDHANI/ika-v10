import Link from "next/link";

export default function NotFound() {
  return (
    <main className="system-message">
      <section className="system-message-card">
        <i className="bx bx-map-alt" />
        <h1>Halaman tidak ditemukan</h1>
        <p>Alamat yang dibuka tidak tersedia pada aplikasi E-Voting IKA.</p>
        <Link className="app-btn app-btn-primary" href="/">Kembali ke Beranda</Link>
      </section>
    </main>
  );
}

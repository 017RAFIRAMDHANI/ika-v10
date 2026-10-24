"use client";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="system-message">
      <section className="system-message-card">
        <i className="bx bx-error-circle" />
        <h1>Aplikasi belum dapat memuat data</h1>
        <p>Periksa koneksi database dan variabel lingkungan, lalu coba kembali.</p>
        <button type="button" className="app-btn app-btn-primary" onClick={reset}>Coba Lagi</button>
      </section>
    </main>
  );
}

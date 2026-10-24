"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import LoadingButton from "@/components/LoadingButton";

export default function ImportDptForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    if (!window.confirm("Unggah DPT resmi? Daftar DPT resmi yang lama akan diganti seluruhnya.")) return;
    setBusy(true); setMessage(""); setError("");
    try {
      const response = await fetch("/api/dpt/import", { method: "POST", body: new FormData(formElement) });
      const result = (await response.json()) as { ok: boolean; total?: number; duplicates?: number; message?: string };
      if (!response.ok) throw new Error(result.message || "Unggah DPT gagal.");
      setMessage(`${result.total ?? 0} NIM tersimpan sebagai DPT resmi${result.duplicates ? ` (${result.duplicates} NIM ganda dilewati)` : ""}.`);
      formElement.reset();
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unggah DPT gagal.");
    } finally { setBusy(false); }
  }

  return (
    <form onSubmit={submit} encType="multipart/form-data">
      <div className="import-drop">
        <i className="bx bx-list-check" />
        <h3>Unggah DPT Resmi</h3>
        <p>Daftar alumni yang berhak mendaftar sendiri melalui halaman pendaftaran. Format .xlsx atau .csv, maksimal 10 MB.</p>
        <input className="app-input" type="file" name="file" id="dptFile" accept=".xlsx,.csv" required style={{ maxWidth: 460, margin: "0 auto 14px" }} />
        <div><LoadingButton busy={busy} type="submit" className="app-btn app-btn-primary"><i className="bx bx-upload" /> Unggah DPT</LoadingButton></div>
      </div>
      <div className="import-note"><strong>Format:</strong> NIM di <strong>kolom A</strong> dan Nama di <strong>kolom B</strong> (seperti databook), atau baris pertama berjudul <strong>NIM</strong> dan <strong>Nama</strong>. Atur kolom NIM sebagai <strong>Teks</strong> agar angka 0 di depan tidak hilang. Setelah DPT diunggah, pendaftaran mandiri hanya diterima untuk NIM yang ada di daftar dengan nama yang sesuai.</div>
      {message && <div className="alert alert-success" role="status">{message}</div>}
      {error && <div className="alert alert-danger" role="alert">{error}</div>}
    </form>
  );
}

"use client";

import { useState, type FormEvent } from "react";
import LoadingButton from "@/components/LoadingButton";

export default function ImportUsersForm() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true); setMessage(""); setError("");
    try {
      const response = await fetch("/api/users/import", { method: "POST", body: form });
      const result = (await response.json()) as { ok: boolean; imported?: number; created?: number; skipped?: number; format?: "backup" | "legacy"; message?: string };
      if (!response.ok) throw new Error(result.message || "Impor gagal.");
      setMessage(`${result.imported ?? 0} akun diproses (${result.created ?? 0} akun baru)${result.format === "backup" ? " dari file ekspor" : " dari format lama"}.${result.skipped ? ` ${result.skipped} baris dilewati karena User ID milik akun administrator.` : ""}`);
      event.currentTarget.reset();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Impor gagal.");
    } finally { setBusy(false); }
  }

  return (
    <form onSubmit={submit} encType="multipart/form-data">
      <div className="import-drop">
        <i className="bx bx-spreadsheet" />
        <h3>Unggah File Data Pemilih</h3>
        <p>Format yang didukung: .xlsx dan .csv. Ukuran maksimal 20 MB dan maksimal 5.000 akun dalam satu proses impor.</p>
        <input className="app-input" type="file" name="file" id="file" accept=".xlsx,.csv" required style={{ maxWidth: 460, margin: "0 auto 14px" }} />
        <div><LoadingButton busy={busy} type="submit" className="app-btn app-btn-primary"><i className="bx bx-upload" /> Import Data</LoadingButton></div>
      </div>
      <div className="import-note"><strong>Dua format tetap didukung:</strong> file lama membaca nama dari <strong>kolom E</strong> dan User ID dari <strong>kolom K</strong>. File hasil <strong>Export Excel</strong> sistem ini dapat diimpor kembali untuk memulihkan biodata. Akun baru memakai password awal = User ID; <strong>password akun yang sudah ada tidak pernah diubah</strong> dan akun administrator dilewati. Data wajah tidak diimpor dari Excel.</div>
      {message && <div className="alert alert-success" role="status">{message}</div>}
      {error && <div className="alert alert-danger" role="alert">{error}</div>}
    </form>
  );
}

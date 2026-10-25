"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import LoadingButton from "@/components/LoadingButton";
import type { VoterRecord } from "@/lib/types";

const sourceLabels: Record<string, string> = {
  PublicRegistration: "Form Pendaftaran DPT",
  ExcelBackup: "Import Backup Excel",
  ExcelLegacy: "Import Excel Lama",
  Admin: "Ditambahkan Administrator"
};

function formatDate(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Asia/Jakarta"
  }).format(date) + " WIB";
}

export default function VoterEditForm({ voter }: { voter: VoterRecord }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function resetFace() {
    if (!voter.userRecordId || !window.confirm("Reset seluruh data wajah aktif pemilih ini? Pemilih wajib melakukan aktivasi wajah ulang. Data suara tidak ikut direset.")) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch(`/api/admin/users/${voter.userRecordId}/reset-face`, { method: "POST" });
      const result = await response.json() as { message?: string };
      if (!response.ok) throw new Error(result.message || "Data wajah gagal direset.");
      setMessage("Data wajah berhasil direset. Pemilih sekarang berstatus belum verifikasi dan wajib aktivasi ulang."); router.refresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Data wajah gagal direset."); }
    finally { setBusy(false); }
  }

  return (
    <div className="voter-detail">
      <div className="voter-detail-summary">
        <span className="voter-detail-avatar">{(voter.displayName || voter.userId || "DP").slice(0, 2).toUpperCase()}</span>
        <div>
          <span className="eyebrow">Profil Pemilih</span>
          <h2>{voter.displayName || "Nama tidak tersedia"}</h2>
          <p>{voter.userId || "User ID tidak tersedia"} · {voter.role}</p>
        </div>
        <div className="voter-detail-badges">
          <span className={`badge ${voter.faceEnrolled ? "badge-success" : "badge-warning"}`}>{voter.faceEnrolled ? "Wajah Terdaftar" : "Wajah Belum Terdaftar"}</span>
          <span className={`badge ${voter.hasVoted ? "badge-success" : "badge-neutral"}`}>{voter.hasVoted ? "Sudah Memilih" : "Belum Memilih"}</span>
        </div>
      </div>

      <section className="detail-section">
        <div className="detail-section-heading"><i className="bx bx-id-card" /><div><h3>Identitas Akun</h3><p>Identitas utama dan hak akses pemilih.</p></div></div>
        <div className="detail-grid">
          <div className="detail-item"><span>ID Database</span><strong>#{voter.id}</strong></div>
          <div className="detail-item"><span>User ID (kode login)</span><strong>{voter.userId || "-"}</strong></div>
          <div className="detail-item"><span>NPM / NIM</span><strong>{voter.nim || "-"}</strong></div>
          <div className="detail-item full"><span>Nama Lengkap</span><strong>{voter.displayName || "-"}</strong></div>
          <div className="detail-item"><span>Role Akun</span><strong>{voter.role}</strong></div>
          <div className="detail-item"><span>Sumber Pendaftaran</span><strong>{voter.registrationSource ? sourceLabels[voter.registrationSource] || voter.registrationSource : "-"}</strong></div>
        </div>
      </section>

      <section className="detail-section">
        <div className="detail-section-heading"><i className="bx bx-book-reader" /><div><h3>Biodata Alumni</h3><p>Data akademik, kontak, dan domisili.</p></div></div>
        <div className="detail-grid">
          <div className="detail-item"><span>Program Studi</span><strong>{voter.studyProgram || "-"}</strong></div>
          <div className="detail-item"><span>Angkatan</span><strong>{voter.cohort || "-"}</strong></div>
          <div className="detail-item"><span>Tahun Lulus</span><strong>{voter.graduationYear || "-"}</strong></div>
          <div className="detail-item"><span>Domisili</span><strong>{voter.domicile || "-"}</strong></div>
          <div className="detail-item"><span>Email</span><strong>{voter.email || "-"}</strong></div>
          <div className="detail-item"><span>WhatsApp</span><strong>{voter.whatsapp || "-"}</strong></div>
        </div>
      </section>

      <section className="detail-section">
        <div className="detail-section-heading"><i className="bx bx-face" /><div><h3>Verifikasi Wajah</h3><p>Status template biometrik dan verifikasi sebelum memilih.</p></div></div>
        <div className="detail-grid">
          <div className="detail-item"><span>Template Wajah</span><strong>{voter.faceEnrolled ? "Tersedia dan terenkripsi" : "Belum tersedia"}</strong></div>
          <div className="detail-item"><span>Desktop Primary</span><strong>{voter.desktopPrimaryEnrolled ? "Aktif" : "Belum tersedia"}</strong></div>
          <div className="detail-item"><span>Mobile Primary</span><strong>{voter.mobilePrimaryEnrolled ? "Aktif" : "Belum tersedia"}</strong></div>
          <div className="detail-item"><span>Lintas Perangkat</span><strong>{voter.canonicalEnrolled ? "Aktif" : "Belum tersedia"}</strong></div>
          <div className="detail-item"><span>Jumlah Template Aktif</span><strong>{voter.faceTemplateCount}</strong></div>
          <div className="detail-item"><span>Status Verifikasi</span><strong>{voter.faceVerified ? "Sudah terverifikasi" : "Belum terverifikasi"}</strong></div>
          <div className="detail-item"><span>Waktu Pendaftaran Wajah</span><strong>{formatDate(voter.faceEnrolledAt)}</strong></div>
          <div className="detail-item"><span>Waktu Verifikasi Wajah</span><strong>{formatDate(voter.faceVerifiedAt)}</strong></div>
        </div>
      </section>

      <section className="detail-section">
        <div className="detail-section-heading"><i className="bx bx-check-square" /><div><h3>Status Pemilihan</h3><p>Status penggunaan hak suara. Pilihan kandidat bersifat rahasia dan tidak disimpan bersama identitas pemilih.</p></div></div>
        <div className="detail-grid">
          <div className="detail-item"><span>Status Hak Suara</span><strong>{voter.hasVoted ? "Sudah memilih" : "Belum memilih"}</strong></div>
        </div>
      </section>

      <section className="detail-section">
        <div className="detail-section-heading"><i className="bx bx-time-five" /><div><h3>Informasi Sistem</h3><p>Riwayat waktu pencatatan data akun.</p></div></div>
        <div className="detail-grid">
          <div className="detail-item"><span>Akun Dibuat</span><strong>{formatDate(voter.createdAt)}</strong></div>
          <div className="detail-item"><span>Terakhir Diperbarui</span><strong>{formatDate(voter.updatedAt)}</strong></div>
        </div>
      </section>

      <div className="detail-actions">
        {voter.faceEnrolled && <LoadingButton busy={busy} className="app-btn app-btn-danger" type="button" onClick={resetFace}><i className="bx bx-face" /> Reset Data Wajah</LoadingButton>}
      </div>
      {message && <div className="alert alert-success" role="status">{message}</div>}
      {error && <div className="alert alert-danger" role="alert">{error}</div>}
    </div>
  );
}

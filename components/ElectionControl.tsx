"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import LoadingButton from "@/components/LoadingButton";
import {
  ELECTION_PHASE_LABELS,
  FACE_PURGE_CONFIRMATION,
  formatWib,
  toWibInput,
  type ElectionPhase,
  type ElectionSettings
} from "@/lib/election";

const phaseBadge: Record<ElectionPhase, string> = {
  persiapan: "badge-info",
  pemungutan: "badge-success",
  ditutup: "badge-neutral"
};

export default function ElectionControl({ settings, phase, faceTemplateCount, ballotCount }: { settings: ElectionSettings; phase: ElectionPhase; faceTemplateCount: number; ballotCount: number }) {
  const router = useRouter();
  const [opensAt, setOpensAt] = useState(toWibInput(settings.opensAt));
  const [closesAt, setClosesAt] = useState(toWibInput(settings.closesAt));
  const [registration, setRegistration] = useState(settings.registrationDuringVoting);
  const [liveResults, setLiveResults] = useState(settings.liveResultsDuringVoting);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const voting = phase === "pemungutan";

  async function send(body: Record<string, unknown>, success: string) {
    setBusy(true); setMessage(""); setError("");
    try {
      const response = await fetch("/api/admin/pemilu", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const result = await response.json() as { message?: string };
      if (!response.ok) throw new Error(result.message || "Pengaturan pemilu gagal disimpan.");
      setMessage(success);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Pengaturan pemilu gagal disimpan.");
    } finally { setBusy(false); }
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void send({
      aksi: "jadwal",
      dibukaPada: opensAt,
      ditutupPada: closesAt,
      pendaftaranSaatVoting: registration,
      hasilLiveSaatVoting: liveResults
    }, "Jadwal pemilu tersimpan.");
  }

  function openNow() {
    if (!window.confirm("Buka pemungutan suara SEKARANG? Pemilih dapat langsung memilih, dan kandidat, impor data, serta kelola akun akan dikunci.")) return;
    void send({ aksi: "buka" }, "Pemungutan suara dibuka.");
  }

  // T3: retensi data biometrik. Setelah pemilu ditutup, data wajah tidak diperlukan lagi.
  async function purgeFaceData() {
    const typed = window.prompt(`Hapus SEMUA data wajah (${faceTemplateCount} template)? Tindakan ini permanen. Ketik ${FACE_PURGE_CONFIRMATION} untuk melanjutkan.`);
    if (typed === null) return;
    setBusy(true); setMessage(""); setError("");
    try {
      const response = await fetch("/api/admin/data-wajah", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ konfirmasi: typed.trim() })
      });
      const result = await response.json() as { deleted?: number; message?: string };
      if (!response.ok) throw new Error(result.message || "Data wajah gagal dihapus.");
      setMessage(`${result.deleted ?? 0} template wajah dihapus.`);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Data wajah gagal dihapus.");
    } finally { setBusy(false); }
  }

  // v10.5: hanya tersedia selama belum ada suara masuk (dijaga juga oleh trigger database).
  function resetToPreparation() {
    if (!window.confirm("Kembalikan pemilu ke tahap Persiapan? Jadwal dikosongkan dan pemungutan suara tertutup sampai dibuka lagi. Ini hanya bisa karena belum ada suara masuk.")) return;
    void send({ aksi: "reset" }, "Pemilu dikembalikan ke tahap Persiapan.");
  }

  function closeNow() {
    if (!window.confirm("Tutup pemungutan suara SEKARANG? Penutupan bersifat FINAL dan tidak dapat dibuka kembali.")) return;
    if (!window.confirm("Konfirmasi sekali lagi: tutup pemungutan suara secara permanen?")) return;
    void send({ aksi: "tutup" }, "Pemungutan suara ditutup.");
  }

  return (
    <section className="app-card card-pad">
      <div className="section-title-row">
        <div><span className="eyebrow">Status Pemilu</span><h2>{ELECTION_PHASE_LABELS[phase]}</h2></div>
        <span className={`badge ${phaseBadge[phase]}`}>{ELECTION_PHASE_LABELS[phase]}</span>
      </div>
      <div className="detail-grid">
        <div className="detail-item"><span>Dibuka</span><strong>{settings.opensAt ? formatWib(settings.opensAt) : "Belum dijadwalkan"}</strong></div>
        <div className="detail-item"><span>Ditutup</span><strong>{settings.closedManuallyAt ? `${formatWib(settings.closedManuallyAt)} (manual)` : settings.closesAt ? formatWib(settings.closesAt) : "Sampai ditutup manual"}</strong></div>
        <div className="detail-item"><span>Pendaftaran saat voting</span><strong>{settings.registrationDuringVoting ? "Dibuka" : "Ditutup"}</strong></div>
        <div className="detail-item"><span>Hasil live untuk pemilih saat voting</span><strong>{settings.liveResultsDuringVoting ? "Per kandidat" : "Hanya jumlah pemilih"}</strong></div>
      </div>

      {phase === "ditutup" ? (
        <>
          {ballotCount > 0 ? (
            <div className="alert alert-success" role="status">Pemungutan suara telah ditutup. Hasil sudah final dan pengaturan pemilu tidak dapat diubah.</div>
          ) : (
            <div className="alert alert-warning" role="status">
              Pemungutan suara ditutup tanpa satu pun suara masuk, sehingga pemilu masih dapat dikembalikan ke tahap Persiapan (misalnya setelah uji coba).
              <div style={{ marginTop: 12 }}>
                <button type="button" className="app-btn app-btn-primary" disabled={busy} onClick={resetToPreparation}><i className="bx bx-reset" /> Kembali ke Persiapan</button>
              </div>
            </div>
          )}
          <div className="detail-section" style={{ marginTop: 16 }}>
            <strong>Retensi data wajah (UU PDP)</strong>
            <p className="muted" style={{ fontSize: ".78rem", margin: "6px 0 12px" }}>
              {faceTemplateCount > 0
                ? `Masih tersimpan ${faceTemplateCount} template wajah terenkripsi. Setelah hasil pemilu disahkan, data biometrik ini tidak diperlukan lagi dan sebaiknya dihapus.`
                : "Seluruh data wajah sudah dihapus."}
            </p>
            {faceTemplateCount > 0 && (
              <button type="button" className="app-btn app-btn-danger" disabled={busy} onClick={() => void purgeFaceData()}>
                <i className="bx bx-trash" /> Hapus Semua Data Wajah
              </button>
            )}
          </div>
        </>
      ) : (
        <form className="form-grid" onSubmit={save} style={{ marginTop: 16 }}>
          <div className="field half">
            <label htmlFor="dibukaPada">Waktu dibuka (WIB)</label>
            <input className="app-input" type="datetime-local" id="dibukaPada" value={opensAt} disabled={voting} onChange={(event) => setOpensAt(event.target.value)} />
          </div>
          <div className="field half">
            <label htmlFor="ditutupPada">Waktu ditutup (WIB)</label>
            <input className="app-input" type="datetime-local" id="ditutupPada" value={closesAt} onChange={(event) => setClosesAt(event.target.value)} />
          </div>
          <div className="field">
            <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <input type="checkbox" checked={registration} disabled={voting} onChange={(event) => setRegistration(event.target.checked)} />
              <span>Izinkan pendaftaran mandiri selama pemungutan suara</span>
            </label>
            <label style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 8 }}>
              <input type="checkbox" checked={liveResults} disabled={voting} onChange={(event) => setLiveResults(event.target.checked)} />
              <span>Tampilkan perolehan per kandidat kepada pemilih selama pemungutan suara</span>
            </label>
          </div>
          <div className="form-actions" style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <LoadingButton busy={busy} type="submit" className="app-btn app-btn-primary"><i className="bx bx-calendar-check" /> Simpan Jadwal</LoadingButton>
            {phase === "persiapan" && <button type="button" className="app-btn app-btn-gold" disabled={busy} onClick={openNow}><i className="bx bx-play-circle" /> Buka Sekarang</button>}
            {voting && <button type="button" className="app-btn app-btn-danger" disabled={busy} onClick={closeNow}><i className="bx bx-stop-circle" /> Tutup Sekarang</button>}
            {voting && ballotCount === 0 && <button type="button" className="app-btn app-btn-soft" disabled={busy} onClick={resetToPreparation}><i className="bx bx-reset" /> Kembali ke Persiapan</button>}
          </div>
          <p className="muted" style={{ gridColumn: "span 12", fontSize: ".75rem", margin: 0 }}>
            {voting
              ? "Selama pemungutan suara hanya waktu tutup yang dapat diubah. Kandidat, impor data, kelola akun, dan reset wajah dikunci."
              : "Kosongkan waktu ditutup bila pemungutan suara akan ditutup manual. Penutupan bersifat final."}
          </p>
        </form>
      )}
      {message && <div className="alert alert-success" role="status">{message}</div>}
      {error && <div className="alert alert-danger" role="alert">{error}</div>}
    </section>
  );
}

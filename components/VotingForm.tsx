"use client";

import { useState } from "react";
import LoadingButton from "@/components/LoadingButton";
import { mediaUrl } from "@/lib/media";
import type { Candidate } from "@/lib/types";

function isImage(value: string) {
  return value.startsWith("/") || value.startsWith("data:image/") || value.startsWith("http://") || value.startsWith("https://");
}

function DetailValue({ value, alt }: { value: string; alt: string }) {
  return isImage(value)
    ? <img src={mediaUrl(value)} alt={alt} />
    : <p>{value}</p>;
}

export default function VotingForm({ candidates }: { candidates: Candidate[] }) {
  const [selected, setSelected] = useState<Candidate | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submitVote() {
    if (!selected) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/vote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        cache: "no-store",
        body: JSON.stringify({ candidateId: selected.id })
      });
      const result = (await response.json().catch(() => ({
        ok: false,
        message: `Server mengembalikan respons yang tidak valid (${response.status}).`
      }))) as { ok: boolean; message?: string; redirectTo?: string };
      if (!response.ok) throw new Error(result.message || "Pilihan gagal disimpan.");
      window.location.replace(result.redirectTo || "/pemilihan");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Pilihan gagal disimpan.");
    } finally {
      setBusy(false);
    }
  }

  if (!candidates.length) {
    return <div className="app-card empty-state"><i className="bx bx-user-x" />Belum ada kandidat yang tersedia untuk dipilih.</div>;
  }

  return (
    <>
      <div className="voting-cards">
        {candidates.map((candidate, index) => (
          <article className="voting-card" key={candidate.id}>
            <div className="voting-card-top">
              <img src={mediaUrl(candidate.image)} alt={`Foto ${candidate.name}`} />
              <span className="voting-card-number">{String(index + 1).padStart(2, "0")}</span>
              <div className="voting-card-title">
                <h2>{candidate.name}</h2>
                <p>{candidate.occupation}</p>
              </div>
            </div>
            <div className="voting-card-body">
              <div className="voting-meta"><span>Angkatan {candidate.cohort}</span><span>Kandidat {String(index + 1).padStart(2, "0")}</span></div>
              <div className="candidate-detail-block">
                <h4><i className="bx bx-target-lock" /> Visi</h4>
                <DetailValue value={candidate.vision} alt={`Visi ${candidate.name}`} />
              </div>
              <div className="candidate-extra">
                <div className="candidate-detail-block">
                  <h4><i className="bx bx-list-check" /> Misi</h4>
                  <DetailValue value={candidate.mission} alt={`Misi ${candidate.name}`} />
                </div>
                <div className="candidate-detail-block">
                  <h4><i className="bx bx-bulb" /> Program Unggulan</h4>
                  <DetailValue value={candidate.featuredProgram} alt={`Program unggulan ${candidate.name}`} />
                </div>
              </div>
              <button type="button" className="app-btn app-btn-primary" onClick={() => { setSelected(candidate); setError(""); }}>
                Pilih Kandidat {String(index + 1).padStart(2, "0")} <i className="bx bx-check-circle" />
              </button>
            </div>
          </article>
        ))}
      </div>

      {selected && (
        <div className="vote-modal-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setSelected(null); }}>
          <div className="vote-modal" role="dialog" aria-modal="true" aria-labelledby="confirmVoteTitle">
            <div className="vote-modal-icon"><i className="bx bx-info-circle" /></div>
            <h3 id="confirmVoteTitle">Konfirmasi Pilihan</h3>
            <p>Pilihan tidak dapat diubah setelah berhasil dikirim. Pastikan kandidat berikut sudah sesuai.</p>
            <div className="vote-modal-choice"><span className="initial-avatar">{selected.name.slice(0, 2).toUpperCase()}</span><strong>{selected.name}</strong></div>
            {error && <div className="alert alert-danger" role="alert">{error}</div>}
            <div className="vote-modal-actions">
              <button type="button" className="app-btn app-btn-soft" disabled={busy} onClick={() => setSelected(null)}>Batal</button>
              <LoadingButton busy={busy} type="button" className="app-btn app-btn-primary" onClick={submitVote}>Ya, Kirim Suara</LoadingButton>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

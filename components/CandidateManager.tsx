"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import LoadingButton from "@/components/LoadingButton";
import { mediaUrl } from "@/lib/media";
import type { Candidate } from "@/lib/types";

const empty = { id: 0, name: "", cohort: "", occupation: "", vision: "", mission: "", featuredProgram: "" };

export default function CandidateManager({ candidates }: { candidates: Candidate[] }) {
  const router = useRouter();
  const [form, setForm] = useState(empty);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  function edit(candidate: Candidate) {
    setForm({ id: candidate.id, name: candidate.name, cohort: candidate.cohort, occupation: candidate.occupation, vision: candidate.vision, mission: candidate.mission, featuredProgram: candidate.featuredProgram });
    setMessage(""); setError(""); window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage(""); setError("");
    const payload = new FormData(event.currentTarget);
    try {
      const response = await fetch(form.id ? `/api/candidates/${form.id}` : "/api/candidates", { method: form.id ? "PATCH" : "POST", body: payload });
      const result = await response.json() as { message?: string };
      if (!response.ok) throw new Error(result.message || "Kandidat gagal disimpan.");
      setMessage(form.id ? "Kandidat berhasil diperbarui." : "Kandidat berhasil ditambahkan.");
      setForm(empty); router.refresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Kandidat gagal disimpan."); }
    finally { setBusy(false); }
  }

  async function remove(candidate: Candidate) {
    if (!window.confirm(`Hapus kandidat ${candidate.name}?`)) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch(`/api/candidates/${candidate.id}`, { method: "DELETE" });
      const result = await response.json() as { message?: string };
      if (!response.ok) throw new Error(result.message || "Kandidat gagal dihapus.");
      setMessage("Kandidat berhasil dihapus."); router.refresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Kandidat gagal dihapus."); }
    finally { setBusy(false); }
  }

  return (
    <>
      <section className="app-card manager-form-card">
        <div className="manager-form-head">
          <div><span className="eyebrow">Form Kandidat</span><h2>{form.id ? "Edit Kandidat" : "Tambah Kandidat Baru"}</h2></div>
          {form.id > 0 && <button className="app-btn app-btn-soft app-btn-sm" type="button" onClick={() => setForm(empty)}><i className="bx bx-x" /> Batal Edit</button>}
        </div>
        <div className="manager-form-body">
          <form className="form-grid" onSubmit={submit} key={form.id}>
            <div className="field half"><label>Nama Calon</label><input name="name" className="app-input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div className="field quarter"><label>Tahun Angkatan</label><input name="cohort" className="app-input" required pattern="[0-9]{4}" maxLength={4} value={form.cohort} onChange={(e) => setForm({ ...form, cohort: e.target.value })} /></div>
            <div className="field quarter"><label>Foto {form.id ? "(opsional)" : ""}</label><input name="image" type="file" accept="image/jpeg,image/png,image/gif,image/webp" className="app-input" required={!form.id} /></div>
            <div className="field"><label>Pekerjaan</label><input name="occupation" className="app-input" required value={form.occupation} onChange={(e) => setForm({ ...form, occupation: e.target.value })} /></div>
            <div className="field third"><label>Visi</label><textarea name="vision" className="app-textarea" required value={form.vision} onChange={(e) => setForm({ ...form, vision: e.target.value })} /></div>
            <div className="field third"><label>Misi</label><textarea name="mission" className="app-textarea" required value={form.mission} onChange={(e) => setForm({ ...form, mission: e.target.value })} /></div>
            <div className="field third"><label>Program Unggulan</label><textarea name="featuredProgram" className="app-textarea" required value={form.featuredProgram} onChange={(e) => setForm({ ...form, featuredProgram: e.target.value })} /></div>
            <div className="form-actions"><LoadingButton busy={busy} className="app-btn app-btn-primary" type="submit"><i className={`bx ${form.id ? "bx-save" : "bx-user-plus"}`} /> {form.id ? "Simpan Perubahan" : "Tambah Kandidat"}</LoadingButton></div>
          </form>
          {message && <div className="alert alert-success" role="status">{message}</div>}
          {error && <div className="alert alert-danger" role="alert">{error}</div>}
        </div>
      </section>

      <div className="section-title-row"><h2>Daftar Kandidat Aktif</h2><span className="badge badge-neutral">{candidates.length} Kandidat</span></div>
      <section className="candidate-admin-grid">
        {candidates.map((candidate, index) => (
          <article className="candidate-admin-card" key={candidate.id}>
            <div className="candidate-admin-main">
              <div className="candidate-admin-image"><img src={mediaUrl(candidate.image)} alt={`Foto ${candidate.name}`} /><span className="candidate-number">{String(index + 1).padStart(2, "0")}</span></div>
              <div className="candidate-admin-copy"><h3>{candidate.name}</h3><span className="occupation">{candidate.occupation}</span><small>Angkatan {candidate.cohort} · {candidate.votes} suara</small></div>
            </div>
            <div className="candidate-card-actions">
              <button type="button" onClick={() => edit(candidate)}><i className="bx bx-edit" /> Edit</button>
              <button type="button" disabled={busy} onClick={() => remove(candidate)}><i className="bx bx-trash" /> Hapus</button>
            </div>
          </article>
        ))}
        {candidates.length === 0 && <div className="app-card empty-state"><i className="bx bx-user-x" />Belum ada kandidat.</div>}
      </section>
    </>
  );
}

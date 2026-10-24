"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import LoadingButton from "@/components/LoadingButton";
import type { SessionUser } from "@/lib/types";

export default function AkunForm({ user }: { user: SessionUser }) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState(user.displayName);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");

    if (password && password !== confirmPassword) {
      setError("Konfirmasi password tidak cocok.");
      setBusy(false);
      return;
    }

    try {
      const response = await fetch("/api/voter/akun", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName, password }),
      });
      const result = await response.json() as { message?: string };
      
      if (!response.ok) {
        throw new Error(result.message || "Gagal memperbarui profil.");
      }
      
      setMessage(result.message || "Profil berhasil diperbarui.");
      setPassword("");
      setConfirmPassword("");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Terjadi kesalahan.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="app-card manager-form-card" style={{ maxWidth: "800px" }}>
      <div className="manager-form-head">
        <div>
          <span className="eyebrow">Data Diri</span>
          <h2>Edit Profil</h2>
        </div>
      </div>
      <div className="manager-form-body">
        <form className="form-grid" onSubmit={submit}>
          <div className="field half">
            <label>User ID (NIM)</label>
            <input 
              className="app-input" 
              value={user.userId} 
              disabled 
              style={{ backgroundColor: "var(--app-bg)", cursor: "not-allowed" }}
              title="User ID bersifat tetap dan tidak dapat diubah." 
            />
          </div>
          <div className="field half">
            <label>Nama Pengguna</label>
            <input 
              className="app-input" 
              required 
              value={displayName} 
              onChange={(e) => setDisplayName(e.target.value)} 
            />
          </div>

          <div className="field half">
            <label>Ganti Password (kosongkan jika tetap)</label>
            <div style={{ position: "relative" }}>
              <input 
                type={showPassword ? "text" : "password"} 
                className="app-input" 
                minLength={6} 
                value={password} 
                onChange={(e) => setPassword(e.target.value)} 
                style={{ paddingRight: "40px" }} 
              />
              <button 
                type="button" 
                onClick={() => setShowPassword(!showPassword)} 
                style={{ position: "absolute", right: "12px", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--app-muted)", fontSize: "1.2rem", padding: 0 }} 
                aria-label={showPassword ? "Sembunyikan password" : "Tampilkan password"}
              >
                <i className={`bx ${showPassword ? "bx-hide" : "bx-show"}`} />
              </button>
            </div>
          </div>
          <div className="field half">
            <label>Konfirmasi Password Baru</label>
            <div style={{ position: "relative" }}>
              <input 
                type={showPassword ? "text" : "password"} 
                className="app-input" 
                required={!!password} 
                minLength={6} 
                value={confirmPassword} 
                onChange={(e) => setConfirmPassword(e.target.value)} 
                style={{ paddingRight: "40px" }} 
              />
              <button 
                type="button" 
                onClick={() => setShowPassword(!showPassword)} 
                style={{ position: "absolute", right: "12px", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--app-muted)", fontSize: "1.2rem", padding: 0 }} 
                aria-label={showPassword ? "Sembunyikan password" : "Tampilkan password"}
              >
                <i className={`bx ${showPassword ? "bx-hide" : "bx-show"}`} />
              </button>
            </div>
          </div>

          <div className="form-actions" style={{ gridColumn: "span 12" }}>
            <LoadingButton busy={busy} type="submit" className="app-btn app-btn-primary">
              <i className="bx bx-save" /> Simpan Perubahan
            </LoadingButton>
          </div>
        </form>
        {message && <div className="alert alert-success" role="status" style={{ marginTop: "1rem" }}>{message}</div>}
        {error && <div className="alert alert-danger" role="alert" style={{ marginTop: "1rem" }}>{error}</div>}
      </div>
    </section>
  );
}

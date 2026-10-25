"use client";

import { useState, type FormEvent } from "react";
import LoadingButton from "@/components/LoadingButton";

export default function AdminLoginForm() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [needsNewPassword, setNeedsNewPassword] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (needsNewPassword && form.get("newPassword") !== form.get("confirmNewPassword")) {
      setError("Ulangi password baru dengan tepat.");
      return;
    }
    setBusy(true);
    setError("");

    try {
      const response = await fetch("/api/auth/admin-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        cache: "no-store",
        body: JSON.stringify({
          userId: form.get("userId"),
          password: form.get("password"),
          ...(needsNewPassword ? { newPassword: form.get("newPassword") } : {})
        })
      });
      const result = (await response.json().catch(() => ({
        ok: false,
        message: `Server mengembalikan respons yang tidak valid (${response.status}).`
      }))) as { ok: boolean; message?: string; redirectTo?: string; needsNewPassword?: boolean };
      if (result.needsNewPassword) setNeedsNewPassword(true);
      if (!response.ok) throw new Error(result.message || "Login administrator gagal.");
      window.location.replace(result.redirectTo || "/admin");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Login administrator gagal.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="auth-form">
      <div className="auth-field">
        <label htmlFor="adminUserId">User ID Administrator</label>
        <div className="auth-input-wrap"><i className="bx bx-user" /><input type="text" id="adminUserId" className="app-input" name="userId" required autoFocus autoComplete="username" placeholder="Masukkan User ID admin" /></div>
      </div>
      <div className="auth-field">
        <label htmlFor="adminPassword">Kata Sandi</label>
        <div className="auth-input-wrap"><i className="bx bx-lock-alt" /><input type="password" id="adminPassword" className="app-input" name="password" required autoComplete="current-password" placeholder="Masukkan password" /></div>
      </div>
      {needsNewPassword && (
        <>
          <div className="auth-field">
            <label htmlFor="adminNewPassword">Password Baru</label>
            <div className="auth-input-wrap"><i className="bx bx-key" /><input type="password" id="adminNewPassword" className="app-input" name="newPassword" required minLength={12} autoComplete="new-password" placeholder="Minimal 12 karakter, tanpa User ID" /></div>
          </div>
          <div className="auth-field">
            <label htmlFor="adminConfirmNewPassword">Ulangi Password Baru</label>
            <div className="auth-input-wrap"><i className="bx bx-key" /><input type="password" id="adminConfirmNewPassword" className="app-input" name="confirmNewPassword" required minLength={12} autoComplete="new-password" placeholder="Ketik ulang password baru" /></div>
          </div>
        </>
      )}
      {error && <div className="alert alert-danger" role="alert">{error}</div>}
      <LoadingButton busy={busy} className="app-btn app-btn-primary" type="submit">{needsNewPassword ? "Simpan Password & Masuk" : "Masuk Administrator"} <i className="bx bx-right-arrow-alt" /></LoadingButton>
    </form>
  );
}

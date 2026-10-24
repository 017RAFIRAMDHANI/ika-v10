"use client";

import { useState, type FormEvent } from "react";
import LoadingButton from "@/components/LoadingButton";

export default function LoginForm() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        cache: "no-store",
        body: JSON.stringify({ userId: form.get("userId"), password: form.get("password") })
      });
      const result = (await response.json().catch(() => ({
        ok: false,
        message: `Server mengembalikan respons yang tidak valid (${response.status}).`
      }))) as { ok: boolean; message?: string; redirectTo?: string };
      if (!response.ok) throw new Error(result.message || "Login gagal.");
      window.location.replace(result.redirectTo || "/");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Login gagal.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="auth-form">
      <div className="auth-field">
        <label htmlFor="userId">User ID</label>
        <div className="auth-input-wrap"><i className="bx bx-user" /><input type="text" id="userId" className="app-input" name="userId" required autoFocus autoComplete="username" placeholder="Masukkan User ID" /></div>
      </div>
      <div className="auth-field">
        <label htmlFor="password">Kata Sandi</label>
        <div className="auth-input-wrap"><i className="bx bx-lock-alt" /><input type="password" id="password" className="app-input" name="password" required autoComplete="current-password" placeholder="Masukkan password" /></div>
      </div>
      {error && <div className="alert alert-danger" role="alert">{error}</div>}
      <LoadingButton busy={busy} className="app-btn app-btn-primary" type="submit">Masuk sebagai Pemilih <i className="bx bx-right-arrow-alt" /></LoadingButton>
    </form>
  );
}

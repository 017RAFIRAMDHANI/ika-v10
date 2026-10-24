"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import FaceCapture, { preloadFaceModels } from "@/components/FaceCapture";
import LoadingButton from "@/components/LoadingButton";
import { detectFaceDeviceClass } from "@/lib/face-device";
import { FACE_ARCFACE_MODEL_VERSION, type FaceCapturePayload, type FaceDeviceClass } from "@/lib/face-types";

type RegistrationStep = 1 | 2 | 3;

type RegistrationData = {
  userId: string;
  displayName: string;
  email: string;
  whatsapp: string;
  studyProgram: string;
  cohort: string;
  graduationYear: string;
  domicile: string;
  password: string;
  confirmPassword: string;
};

const initialData: RegistrationData = {
  userId: "",
  displayName: "",
  email: "",
  whatsapp: "",
  studyProgram: "",
  cohort: "",
  graduationYear: "",
  domicile: "",
  password: "",
  confirmPassword: ""
};

const stepLabels = ["Kode Primary", "Biodata & Akun", "Verifikasi Wajah"];

export default function RegistrationForm() {
  const [step, setStep] = useState<RegistrationStep>(1);
  const [primaryCode, setPrimaryCode] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [data, setData] = useState(initialData);
  const [deviceClass, setDeviceClass] = useState<FaceDeviceClass | null>(null);
  const [canonicalFace, setCanonicalFace] = useState<FaceCapturePayload | null>(null);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isLoaded, setIsLoaded] = useState(false);
  const SESSION_KEY = "dpt_registration_draft";

  useEffect(() => {
    const timer = window.setTimeout(() => setDeviceClass(detectFaceDeviceClass()), 0);
    return () => window.clearTimeout(timer);
  }, []);

  // Model wajah diunduh di latar belakang selama pengisian biodata agar pemindaian langsung siap.
  useEffect(() => {
    if (deviceClass && step >= 2) preloadFaceModels("canonical-cross-device", deviceClass, FACE_ARCFACE_MODEL_VERSION);
  }, [deviceClass, step]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(SESSION_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.expiresAt && Date.now() > parsed.expiresAt) {
          localStorage.removeItem(SESSION_KEY);
        } else {
          // eslint-disable-next-line react-hooks/set-state-in-effect
          if (parsed.step) setStep(parsed.step);
          if (parsed.primaryCode) setPrimaryCode(parsed.primaryCode);
          if (parsed.accessToken) setAccessToken(parsed.accessToken);
          if (parsed.data) setData(parsed.data);
          if (parsed.canonicalFace) setCanonicalFace(parsed.canonicalFace);
          if (parsed.consent !== undefined) setConsent(parsed.consent);
        }
      }
    } catch {
      // ignore storage errors
    }
    setIsLoaded(true);
  }, []);

  useEffect(() => {
    if (!isLoaded) return;
    const draft = {
      step,
      primaryCode,
      accessToken,
      data,
      canonicalFace,
      consent,
      expiresAt: Date.now() + 5 * 60 * 1000 // 5 minutes expiration
    };
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify(draft));
    } catch {
      // ignore storage errors
    }
  }, [isLoaded, step, primaryCode, accessToken, data, canonicalFace, consent]);

  function update<K extends keyof RegistrationData>(key: K, value: RegistrationData[K]) {
    setData((current) => ({ ...current, [key]: value }));
  }

  function moveTo(nextStep: RegistrationStep) {
    setError("");
    setStep(nextStep);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function verifyPrimaryCode() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/registration/access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        cache: "no-store",
        body: JSON.stringify({ code: primaryCode })
      });
      const result = await response.json().catch(() => ({
        ok: false,
        message: `Server mengembalikan respons yang tidak valid (${response.status}).`
      })) as { ok: boolean; accessToken?: string; message?: string };
      if (!response.ok || !result.accessToken) {
        throw new Error(result.message || "Kode Primary DPT tidak dapat diverifikasi.");
      }
      setAccessToken(result.accessToken);
      moveTo(2);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Kode Primary DPT tidak dapat diverifikasi.");
    } finally {
      setBusy(false);
    }
  }

  function continueFromBiodata() {
    if (data.password !== data.confirmPassword) {
      setError("Konfirmasi password tidak sama.");
      return;
    }
    moveTo(3);
  }

  async function submitRegistration(website: FormDataEntryValue | null) {
    if (!canonicalFace) {
      setError("Selesaikan pemindaian dan liveness wajah sebelum mengirim pendaftaran.");
      return;
    }
    if (!accessToken) {
      setError("Akses pendaftaran telah berakhir. Masukkan kembali Kode Primary DPT.");
      setStep(1);
      return;
    }

    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/registration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        cache: "no-store",
        body: JSON.stringify({
          accessToken,
          ...data,
          consent,
          website,
          faceTemplates: [canonicalFace]
        })
      });
      const result = await response.json().catch(() => ({
        ok: false,
        message: `Server mengembalikan respons yang tidak valid (${response.status}).`
      })) as { ok: boolean; message?: string };
      if (!response.ok) {
        if (response.status === 403) {
          setAccessToken("");
          setCanonicalFace(null);
          setStep(1);
        }
        throw new Error(result.message || "Pendaftaran gagal.");
      }
      try {
        localStorage.removeItem(SESSION_KEY);
      } catch {
        // ignore
      }
      setSuccess(result.message || "Pendaftaran berhasil.");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Pendaftaran gagal.");
    } finally {
      setBusy(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (step === 1) {
      await verifyPrimaryCode();
      return;
    }
    if (step === 2) {
      continueFromBiodata();
      return;
    }
    const form = new FormData(event.currentTarget);
    await submitRegistration(form.get("website"));
  }

  if (success) {
    return (
      <div className="registration-success">
        <span className="success-check"><i className="bx bx-check" /></span>
        <span className="eyebrow">Pendaftaran DPT Selesai</span>
        <h2>Hak pilih Anda sudah dibuat</h2>
        <p>{success}</p>
        <div className="auth-hint">
          <i className="bx bx-face" />
          <span>Saat pertama membuka bilik suara, lakukan satu kali pencocokan wajah menggunakan data yang baru didaftarkan.</span>
        </div>
        <Link href="/login" className="app-btn app-btn-primary">Masuk ke Akun <i className="bx bx-right-arrow-alt" /></Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="registration-form">
      <div className="registration-stepper" aria-label={`Langkah ${step} dari 3`}>
        {stepLabels.map((label, index) => {
          const number = (index + 1) as RegistrationStep;
          const state = number < step ? "done" : number === step ? "active" : "";
          return (
            <div className={`registration-step ${state}`} key={label}>
              <span>{number < step ? <i className="bx bx-check" /> : number}</span>
              <div><small>Langkah {number}</small><strong>{label}</strong></div>
            </div>
          );
        })}
      </div>

      {step === 1 && (
        <section className="registration-section registration-access-step">
          <div className="registration-access-icon"><i className="bx bx-key" /></div>
          <div className="registration-section-title"><span>1</span><div><h2>Masukkan Kode Primary DPT</h2><p>Kode ini diberikan oleh administrator kepada calon pemilih yang berhak mendaftar.</p></div></div>
          <div className="field">
            <label htmlFor="primaryCode">Kode Primary DPT</label>
            <input
              className="app-input"
              type="password"
              id="primaryCode"
              value={primaryCode}
              onChange={(event) => { setPrimaryCode(event.target.value); setAccessToken(""); }}
              required
              minLength={8}
              maxLength={128}
              autoComplete="one-time-code"
              placeholder="Masukkan kode dari administrator"
              autoFocus
            />
          </div>
          <div className="registration-access-note"><i className="bx bx-shield-quarter" /><span>Pendaftaran tidak dapat dilanjutkan tanpa kode yang sesuai. Kode diperiksa langsung oleh server dan tidak disimpan di browser.</span></div>
        </section>
      )}

      {step === 2 && (
        <section className="registration-section">
          <div className="registration-section-title"><span>2</span><div><h2>Biodata Alumni dan Akun</h2><p>Gunakan identitas akademik yang benar dan buat password untuk masuk ke sistem.</p></div></div>
          <div className="form-grid">
            <div className="field half"><label htmlFor="displayName">Nama Lengkap</label><input className="app-input" id="displayName" required maxLength={255} autoComplete="name" placeholder="Nama lengkap beserta gelar (opsional)" value={data.displayName} onChange={(event) => update("displayName", event.target.value)} /></div>
            <div className="field half"><label htmlFor="userId">NPM / NIM</label><input className="app-input" id="userId" required minLength={5} maxLength={64} autoComplete="username" placeholder="Digunakan sebagai User ID" value={data.userId} onChange={(event) => update("userId", event.target.value)} /></div>
            <div className="field half"><label htmlFor="studyProgram">Program Studi</label><select className="app-select" id="studyProgram" required value={data.studyProgram} onChange={(event) => update("studyProgram", event.target.value)}><option value="" disabled>Pilih program studi</option><option>Administrasi Negara</option><option>Administrasi Publik</option></select></div>
            <div className="field quarter"><label htmlFor="cohort">Angkatan</label><input className="app-input" id="cohort" required inputMode="numeric" pattern="[0-9]{4}" maxLength={4} placeholder="Contoh: 2012" value={data.cohort} onChange={(event) => update("cohort", event.target.value)} /></div>
            <div className="field quarter"><label htmlFor="graduationYear">Tahun Lulus</label><input className="app-input" id="graduationYear" inputMode="numeric" pattern="[0-9]{4}" maxLength={4} placeholder="Opsional" value={data.graduationYear} onChange={(event) => update("graduationYear", event.target.value)} /></div>
            <div className="field half"><label htmlFor="email">Email Aktif</label><input className="app-input" type="email" id="email" required maxLength={320} autoComplete="email" placeholder="nama@email.com" value={data.email} onChange={(event) => update("email", event.target.value)} /></div>
            <div className="field half"><label htmlFor="whatsapp">Nomor WhatsApp</label><input className="app-input" type="tel" id="whatsapp" required minLength={8} maxLength={32} autoComplete="tel" placeholder="Contoh: +628123456789" value={data.whatsapp} onChange={(event) => update("whatsapp", event.target.value)} /></div>
            <div className="field"><label htmlFor="domicile">Domisili</label><input className="app-input" id="domicile" maxLength={160} autoComplete="address-level2" placeholder="Kota/Kabupaten (opsional)" value={data.domicile} onChange={(event) => update("domicile", event.target.value)} /></div>
            <div className="field half"><label htmlFor="password">Password</label><input className="app-input" type="password" id="password" required minLength={8} maxLength={255} autoComplete="new-password" placeholder="Minimal 8 karakter" value={data.password} onChange={(event) => update("password", event.target.value)} /></div>
            <div className="field half"><label htmlFor="confirmPassword">Konfirmasi Password</label><input className="app-input" type="password" id="confirmPassword" required minLength={8} maxLength={255} autoComplete="new-password" placeholder="Ulangi password" value={data.confirmPassword} onChange={(event) => update("confirmPassword", event.target.value)} /></div>
          </div>
        </section>
      )}

      {step === 3 && (
        <section className="registration-section">
          <div className="registration-section-title"><span>3</span><div><h2>Daftarkan Wajah</h2><p>Ikuti instruksi acak: kedip, tengok kiri, tengok kanan, lalu hadap lurus.</p></div></div>
          {!deviceClass && <div className="alert alert-info">Mendeteksi profil kamera perangkat…</div>}
          {deviceClass && !canonicalFace && (
            <>
              <div className="registration-access-note"><i className="bx bx-transfer-alt" /><span>Cukup satu kali pemindaian. Data wajah ini berlaku untuk login melalui PC maupun HP.</span></div>
              <FaceCapture
                mode="register"
                templateRole="canonical-cross-device"
                modelVersion={FACE_ARCFACE_MODEL_VERSION}
                deviceClass={deviceClass}
                onReset={() => setCanonicalFace(null)}
                onComplete={(payload) => { setCanonicalFace(payload); setError(""); }}
              />
            </>
          )}
          {canonicalFace && (
            <div className="alert alert-success" role="status">Wajah berhasil dipindai. Data ini berlaku untuk login melalui PC maupun HP.</div>
          )}
          <div className="registration-consent">
            <label><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} required /><span>Saya menyatakan data yang diisi benar dan menyetujui pemrosesan descriptor wajah terenkripsi untuk pendaftaran serta satu kali verifikasi sebelum memilih.</span></label>
            <input className="registration-honeypot" type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" />
          </div>
        </section>
      )}

      {error && <div className="alert alert-danger" role="alert">{error}</div>}

      <div className="registration-navigation">
        {step > 1 && (
          <button type="button" className="app-btn app-btn-soft" disabled={busy} onClick={() => {
            moveTo((step - 1) as RegistrationStep);
          }}>
            <i className="bx bx-left-arrow-alt" /> Kembali
          </button>
        )}
        <LoadingButton busy={busy} type="submit" className={step === 3 ? "app-btn app-btn-gold" : "app-btn app-btn-primary"} disabled={step === 3 && !canonicalFace}>
          <i className={`bx ${step === 1 ? "bx-lock-open-alt" : step === 2 ? "bx-right-arrow-alt" : "bx-user-plus"}`} />
          {step === 1 ? "Verifikasi Kode" : step === 2 ? "Lanjut Verifikasi Wajah" : "Daftarkan sebagai Pemilih"}
        </LoadingButton>
        {step === 3 && !canonicalFace && <small>Selesaikan pemindaian wajah untuk mengaktifkan tombol pendaftaran.</small>}
      </div>
    </form>
  );
}

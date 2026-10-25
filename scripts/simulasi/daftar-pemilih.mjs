// Simulasi uji coba: mendaftarkan pemilih SIMULASI lewat API pendaftaran mandiri (jalur yang sama dengan
// browser). Wajah memakai descriptor ArcFace sintetis (bukan kamera); pemeriksaan server tetap berlaku.
// Pemakaian: node --env-file=.env.local scripts/simulasi/daftar-pemilih.mjs [jumlah=100] [url=https://ika-v10.vercel.app]
// Syarat: status pemilu PERSIAPAN. Akun: NIM SIMULASI-001 dst. Daftar kode + wajah disimpan di
// scripts/simulasi/.hasil/pemilih.json (di-.gitignore) dan dipakai pilih-acak.mjs. Bisa dilanjutkan.
// Bersihkan: Reset Uji Coba (menu Pemilu) lalu database/hapus-akun-simulasi.sql. Lihat PANDUAN-V10 2.5f.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";
import { ARC, call, log, newFace, scanPayload } from "./lib.mjs";

const TOTAL = Number(process.argv[2] ?? 100);
const BASE = process.argv[3] ?? "https://ika-v10.vercel.app";
const { DATABASE_URL, REGISTRATION_PRIMARY_CODE } = process.env;
if (!DATABASE_URL || !REGISTRATION_PRIMARY_CODE) throw new Error("DATABASE_URL dan REGISTRATION_PRIMARY_CODE wajib ada di .env.local.");
const sql = neon(DATABASE_URL);
const OUTPUT = new URL("./.hasil/pemilih.json", import.meta.url);
mkdirSync(new URL("./.hasil/", import.meta.url), { recursive: true });

const preparation = async () => {
  const [row] = await sql`SELECT dibuka_pada IS NULL AND ditutup_manual_pada IS NULL AS persiapan FROM pengaturan_pemilu WHERE id = 1`;
  return row.persiapan;
};
const randomInt = (min, max) => min + Math.floor(Math.random() * (max - min + 1));

if (!(await preparation())) throw new Error("Status pemilu bukan Persiapan. Tekan Kembali ke Persiapan / Reset Uji Coba di menu Pemilu dulu.");
// Catatan lama hanya dipakai untuk akun yang masih ada (akun yang sudah dihapus didaftarkan ulang).
const saved = existsSync(OUTPUT) ? JSON.parse(readFileSync(OUTPUT, "utf8")) : [];
const stillThere = new Set((await sql`SELECT user_id FROM users WHERE user_id = ANY(${saved.map((voter) => voter.code)}::text[])`).map((row) => row.user_id));
const voters = saved.filter((voter) => stillThere.has(voter.code));
const done = new Set(voters.map((voter) => voter.nomor));
log(`${BASE}: ${voters.length} pemilih sudah ada, target ${TOTAL}`);

let access = await call(BASE, "POST", "/api/registration/access", { json: { code: REGISTRATION_PRIMARY_CODE } });
if (access.status !== 200) throw new Error(`Kode Primary DPT ditolak: ${access.text}`);
let accessAt = Date.now();
for (let nomor = 1; nomor <= TOTAL; nomor += 1) {
  if (done.has(nomor)) continue;
  if (!(await preparation())) { log("pemilu dibuka sebelum pendaftaran selesai; berhenti (jalankan lagi setelah Persiapan)"); break; }
  if (Date.now() - accessAt > 8 * 60 * 1000) {
    access = await call(BASE, "POST", "/api/registration/access", { json: { code: REGISTRATION_PRIMARY_CODE } });
    accessAt = Date.now();
  }
  const nim = `SIMULASI-${String(nomor).padStart(3, "0")}`;
  let registered = null;
  for (let attempt = 0; attempt < 5 && !registered; attempt += 1) {
    const cohort = randomInt(2008, 2020);
    const biodata = {
      nim, displayName: `Pemilih Simulasi ${String(nomor).padStart(3, "0")}`, email: `simulasi${nomor}.${Date.now()}@contoh.id`,
      whatsapp: `+62812000${String(nomor).padStart(4, "0")}`, studyProgram: nomor % 2 ? "Administrasi Publik" : "Administrasi Negara",
      cohort: String(cohort), graduationYear: "", domicile: "Simulasi",
      birthDay: String(randomInt(1, 28)), birthMonth: String(randomInt(1, 12)), birthYear: String(cohort - randomInt(17, 20))
    };
    const check = await call(BASE, "POST", "/api/registration/check", { json: { accessToken: access.json.accessToken, ...biodata } });
    if (check.status === 409 && /angkatan dan tanggal lahir/.test(check.text)) continue; // kode bentrok: coba tanggal lain
    if (check.status !== 200) { log(`${nim}: ${check.status} ${check.json?.message ?? check.text}`); break; }
    const face = newFace();
    const device = nomor % 3 ? "mobile" : "desktop";
    const query = new URLSearchParams({ mode: "register", templateRole: "canonical-cross-device", descriptorEngine: "human-wasm-v1", modelVersion: ARC, sourceDeviceClass: device });
    const challenge = await call(BASE, "GET", `/api/face/challenge?${query}`);
    const result = await call(BASE, "POST", "/api/registration", {
      json: { accessToken: access.json.accessToken, ...biodata, consent: true, website: "", faceTemplates: [scanPayload(face, challenge.json, device)] }
    });
    if (result.status === 201) registered = { nomor, code: result.json.loginCode, face };
    else log(`${nim}: pendaftaran ${result.status} ${result.json?.message ?? result.text}`);
  }
  if (registered) voters.push(registered);
  writeFileSync(OUTPUT, JSON.stringify(voters));
  if (voters.length % 10 === 0) log(`terdaftar ${voters.length} pemilih`);
}
log(`SELESAI: ${voters.length} pemilih simulasi siap. Tekan Buka Sekarang, lalu jalankan pilih-acak.mjs.`);

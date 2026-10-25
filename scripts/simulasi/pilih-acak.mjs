// Simulasi uji coba: pemilih SIMULASI (dari daftar-pemilih.mjs) login -> verifikasi wajah -> memilih
// kandidat secara acak. Menunggu sampai panitia menekan Buka Sekarang (maks. 60 menit), lalu
// mencocokkan rekap pilihan dengan database (hanya SELECT).
// Pemakaian: node --env-file=.env.local scripts/simulasi/pilih-acak.mjs [url=https://ika-v10.vercel.app]
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";
import { ARC, call, log, sameFace, scanPayload } from "./lib.mjs";

const BASE = process.argv[2] ?? "https://ika-v10.vercel.app";
const sql = neon(process.env.DATABASE_URL);
const voters = JSON.parse(readFileSync(new URL("./.hasil/pemilih.json", import.meta.url), "utf8"));
const isOpen = async () => {
  const [row] = await sql`
    SELECT dibuka_pada IS NOT NULL AND dibuka_pada <= NOW() AND ditutup_manual_pada IS NULL
      AND (ditutup_pada IS NULL OR ditutup_pada > NOW()) AS dibuka
    FROM pengaturan_pemilu WHERE id = 1`;
  return row.dibuka;
};

log(`${voters.length} pemilih siap; menunggu Buka Sekarang di ${BASE} ...`);
const deadline = Date.now() + 60 * 60 * 1000;
while (!(await isOpen())) {
  if (Date.now() > deadline) { log("batas waktu 60 menit habis"); process.exit(0); }
  await new Promise((resolve) => setTimeout(resolve, 5000));
}
log("pemungutan suara DIBUKA, mulai memilih");
const candidates = await sql`SELECT id, name FROM candidates ORDER BY id ASC`;
const tally = new Map(candidates.map((candidate) => [candidate.id, 0]));
const problems = [];
for (const voter of voters) {
  const login = await call(BASE, "POST", "/api/auth/login", { json: { userId: voter.code, password: voter.code } });
  if (login.status !== 200) { problems.push(`${voter.code} login ${login.status}`); continue; }
  let cookie = login.cookie;
  const query = new URLSearchParams({ mode: "verify", templateRole: "canonical-cross-device", descriptorEngine: "human-wasm-v1", modelVersion: ARC, sourceDeviceClass: "mobile" });
  const challenge = await call(BASE, "GET", `/api/face/challenge?${query}`, { cookie });
  const verify = await call(BASE, "POST", "/api/face/verify", { cookie, json: scanPayload(sameFace(voter.face), challenge.json, "mobile") });
  if (verify.status !== 200) { problems.push(`${voter.code} verifikasi ${verify.status} ${verify.json?.message ?? ""}`); continue; }
  if (verify.cookie) cookie = verify.cookie;
  const choice = candidates[Math.floor(Math.random() * candidates.length)];
  const vote = await call(BASE, "POST", "/api/vote", { cookie, json: { candidateId: choice.id } });
  if (vote.status !== 200) { problems.push(`${voter.code} memilih ${vote.status} ${vote.json?.message ?? ""}`); continue; }
  tally.set(choice.id, tally.get(choice.id) + 1);
  const total = [...tally.values()].reduce((a, b) => a + b, 0);
  if (total % 10 === 0) log(`${total} suara masuk`);
}

const rows = await sql`
  SELECT c.id, c.name, c.votes, (SELECT COUNT(*)::int FROM ballots b WHERE b.candidate_id = c.id) AS ballots
  FROM candidates c ORDER BY c.id`;
const [{ voted }] = await sql`SELECT COUNT(*)::int AS voted FROM users WHERE has_voted`;
log("REKAP (pilihan acak skrip | penghitung | surat suara di database):");
rows.forEach((row, index) => log(`  Kandidat ${String(index + 1).padStart(2, "0")} ${row.name}: ${tally.get(row.id)} | ${row.votes} | ${row.ballots}`));
log(`akun sudah memilih: ${voted}; gagal: ${problems.length}${problems.length ? " -> " + problems.join("; ") : ""}`);
log("Bersihkan: Reset Uji Coba di menu Pemilu, lalu jalankan database/hapus-akun-simulasi.sql.");

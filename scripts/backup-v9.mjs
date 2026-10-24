// Backup penuh database v9 ke file SQL yang dapat dipulihkan ke database kosong.
// Pemakaian: node --env-file=.env.local scripts/backup-v9.mjs
// Hasil disimpan di database/backup/ (di-.gitignore) karena memuat data pribadi,
// hash password, template wajah terenkripsi, dan relasi pemilih-kandidat milik v9.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

const url = process.env.V9_DATABASE_URL;
if (!url) {
  console.error("V9_DATABASE_URL belum diisi di .env.local.");
  process.exit(1);
}
const sql = neon(url);
const TABLES = ["candidates", "users", "user_face_templates", "voters"];

// Skema v9 diambil dari arsip database/v9-lama/neon-manual.sql (bagian CREATE saja).
const v9Schema = readFileSync(new URL("../database/v9-lama/neon-manual.sql", import.meta.url), "utf8");
const schema = v9Schema.slice(
  v9Schema.indexOf("CREATE EXTENSION"),
  v9Schema.indexOf("-- ================================================================\n-- DATA TIGA KANDIDAT")
).trim();

function dollarQuote(text) {
  let tag = "ika_backup";
  while (text.includes(`$${tag}$`)) tag += "_x";
  return `$${tag}$${text}$${tag}$`;
}

const stamp = new Date().toISOString().replace(/[:T]/g, "-").slice(0, 16);
const lines = [
  `-- BACKUP DATABASE IKA v9 — dibuat ${new Date().toISOString()}`,
  "-- RAHASIA: memuat data pribadi, hash password, template wajah terenkripsi, dan relasi pemilih-kandidat.",
  "-- Pemulihan: buat database Neon KOSONG, buka SQL Editor, jalankan seluruh isi file ini.",
  "-- Template wajah hanya dapat dibuka dengan FACE_DATA_SECRET milik v9.",
  "",
  "BEGIN;",
  "",
  schema,
  ""
];
const counts = {};
for (const table of TABLES) {
  const rows = await sql.query(`SELECT COALESCE(json_agg(t ORDER BY t.id), '[]'::json)::text AS data, COUNT(*)::int AS total FROM ${table} t`);
  counts[table] = rows[0].total;
  lines.push(`INSERT INTO ${table} SELECT * FROM json_populate_recordset(NULL::${table}, ${dollarQuote(rows[0].data)});`);
  lines.push(`SELECT setval(pg_get_serial_sequence('${table}', 'id'), (SELECT COALESCE(MAX(id), 1) FROM ${table}));`);
  lines.push("");
}
lines.push("COMMIT;", "");

mkdirSync(new URL("../database/backup/", import.meta.url), { recursive: true });
const target = new URL(`../database/backup/backup-v9-${stamp}.sql`, import.meta.url);
writeFileSync(target, lines.join("\n"));
console.log("Backup v9 selesai:", decodeURIComponent(target.pathname).replace(/^\/([A-Za-z]:)/, "$1"));
console.log("Jumlah baris:", counts);

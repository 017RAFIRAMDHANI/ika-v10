// Backup penuh database v10 (skema + seluruh data) ke file SQL yang dapat dipulihkan ke database kosong.
// Pemakaian: node --env-file=.env.local scripts/backup-v10.mjs
// Hasil di database/backup/ (di-.gitignore) karena memuat data pribadi dan template wajah terenkripsi.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL belum diisi di .env.local.");
  process.exit(1);
}
const sql = neon(url);

// Skema diambil dari database/neon-manual.sql (antara BEGIN; dan COMMIT; pertama).
const schemaFile = readFileSync(new URL("../database/neon-manual.sql", import.meta.url), "utf8");
const schema = schemaFile.slice(schemaFile.indexOf("BEGIN;") + "BEGIN;".length, schemaFile.indexOf("COMMIT;")).trim();

const existing = await sql`
  SELECT table_name FROM information_schema.tables
  WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
`;
const names = new Set(existing.map((row) => row.table_name));
// Urutan mengikuti foreign key. Tabel yang belum ada (versi lebih lama) dilewati.
const TABLES = ["candidates", "users", "user_face_templates", "ballots", "admin_audit_log", "security_events", "dpt_resmi", "pengaturan_pemilu"]
  .filter((table) => names.has(table));
// Hanya kolom yang ada di database sumber yang dipulihkan; kolom yang ditambahkan versi lebih baru
// (mis. users.login_* di v10.2) memakai nilai bawaan skema, bukan NULL.
const columnRows = await sql`
  SELECT table_name, column_name FROM information_schema.columns
  WHERE table_schema = 'public'
  ORDER BY ordinal_position
`;
const columnsOf = (table) => columnRows
  .filter((row) => row.table_name === table)
  .map((row) => `"${row.column_name}"`)
  .join(", ");

function dollarQuote(text) {
  let tag = "ika_backup";
  while (text.includes(`$${tag}$`)) tag += "_x";
  return `$${tag}$${text}$${tag}$`;
}

const stamp = new Date().toISOString().replace(/[:T]/g, "-").slice(0, 16);
const lines = [
  `-- BACKUP DATABASE IKA v10 — dibuat ${new Date().toISOString()}`,
  "-- RAHASIA: memuat data pribadi, hash password, dan template wajah terenkripsi.",
  "-- Pemulihan: buat database Neon KOSONG, buka SQL Editor, jalankan seluruh isi file ini.",
  `-- Tabel: ${TABLES.join(", ")}`,
  "",
  "BEGIN;",
  "",
  schema,
  ""
];
const counts = {};
for (const table of TABLES) {
  const order = table === "ballots" ? "" : " ORDER BY t.id";
  const key = table === "dpt_resmi" ? " ORDER BY t.nim" : order;
  const rows = await sql.query(`SELECT COALESCE(json_agg(t${key}), '[]'::json)::text AS data, COUNT(*)::int AS total FROM ${table} t`);
  counts[table] = rows[0].total;
  // Baris pengaturan_pemilu (id = 1) sudah dibuat oleh skema, jadi isinya ditimpa.
  const upsert = table === "pengaturan_pemilu"
    ? " ON CONFLICT (id) DO UPDATE SET dibuka_pada = EXCLUDED.dibuka_pada, ditutup_pada = EXCLUDED.ditutup_pada, ditutup_manual_pada = EXCLUDED.ditutup_manual_pada, pendaftaran_saat_voting = EXCLUDED.pendaftaran_saat_voting, hasil_live_saat_voting = EXCLUDED.hasil_live_saat_voting"
    : "";
  const columns = columnsOf(table);
  lines.push(`INSERT INTO ${table} (${columns}) SELECT ${columns} FROM json_populate_recordset(NULL::${table}, ${dollarQuote(rows[0].data)})${upsert};`);
  if (!["ballots", "dpt_resmi", "pengaturan_pemilu"].includes(table)) {
    lines.push(`SELECT setval(pg_get_serial_sequence('${table}', 'id'), (SELECT COALESCE(MAX(id), 1) FROM ${table}));`);
  }
  lines.push("");
}
lines.push("COMMIT;", "");

mkdirSync(new URL("../database/backup/", import.meta.url), { recursive: true });
const target = new URL(`../database/backup/backup-v10-${stamp}.sql`, import.meta.url);
writeFileSync(target, lines.join("\n"));
console.log("Backup v10 selesai:", decodeURIComponent(target.pathname).replace(/^\/([A-Za-z]:)/, "$1"));
console.log("Jumlah baris:", counts);

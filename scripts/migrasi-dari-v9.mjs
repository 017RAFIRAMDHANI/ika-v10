// Pindahkan data v9 ke database v10 (database Neon terpisah, sudah berisi skema neon-manual.sql).
// Pemakaian:
//   node --env-file=.env.local scripts/migrasi-dari-v9.mjs --dry-run   (simulasi, tidak menulis)
//   node --env-file=.env.local scripts/migrasi-dari-v9.mjs             (jalankan)
//
// - Database v9 hanya dibaca, tidak diubah.
// - Template wajah aktif didekripsi dengan V9_FACE_DATA_SECRET lalu dienkripsi ulang dengan
//   FACE_DATA_SECRET baru. Template yang sudah dicabut (revoked) tidak ikut dipindahkan.
// - Relasi pemilih-kandidat (tabel voters v9) diubah menjadi surat suara anonim (tabel ballots)
//   dalam urutan acak, sehingga v10 tidak menyimpan siapa memilih siapa.
// - Seluruh penulisan berjalan dalam satu transaksi: berhasil semua atau tidak sama sekali.
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomInt } from "node:crypto";
import { deflateRawSync, inflateRawSync } from "node:zlib";
import { neon } from "@neondatabase/serverless";

const dryRun = process.argv.includes("--dry-run");
const { DATABASE_URL, V9_DATABASE_URL, FACE_DATA_SECRET, V9_FACE_DATA_SECRET } = process.env;

function fail(message) {
  console.error(`GAGAL: ${message}`);
  process.exit(1);
}
if (!DATABASE_URL) fail("DATABASE_URL (database v10) belum diisi di .env.local.");
if (!V9_DATABASE_URL) fail("V9_DATABASE_URL belum diisi di .env.local.");
if (DATABASE_URL === V9_DATABASE_URL) fail("DATABASE_URL v10 harus berbeda dari database v9.");
if (!FACE_DATA_SECRET || FACE_DATA_SECRET.length < 32) fail("FACE_DATA_SECRET v10 minimal 32 karakter.");
if (!V9_FACE_DATA_SECRET) fail("V9_FACE_DATA_SECRET belum diisi di .env.local.");

const DESCRIPTOR_BYTES = 1024 * Float32Array.BYTES_PER_ELEMENT;
const keyFrom = (secret) => createHash("sha256").update(secret).digest();

// Format sama dengan lib/face.ts (v1: JSON, v2: Float32 terkompresi).
function decryptDescriptor(value, secret) {
  const [version, iv, tag, encrypted] = value.split(".");
  const decipher = createDecipheriv("aes-256-gcm", keyFrom(secret), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  const plain = Buffer.concat([decipher.update(Buffer.from(encrypted, "base64url")), decipher.final()]);
  if (version === "v2") {
    const raw = inflateRawSync(plain);
    if (raw.byteLength !== DESCRIPTOR_BYTES) throw new Error("panjang descriptor tidak valid");
    return raw;
  }
  if (version === "v1") {
    const values = JSON.parse(plain.toString("utf8"));
    if (!Array.isArray(values) || values.length !== 1024) throw new Error("panjang descriptor tidak valid");
    return Buffer.from(new Float32Array(values.map(Number)).buffer);
  }
  throw new Error(`versi enkripsi ${version} tidak dikenali`);
}

function encryptDescriptor(raw, secret) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyFrom(secret), iv);
  const encrypted = Buffer.concat([cipher.update(deflateRawSync(raw)), cipher.final()]);
  return `v2.${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${encrypted.toString("base64url")}`;
}

function shuffle(items) {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const swap = randomInt(index + 1);
    [items[index], items[swap]] = [items[swap], items[index]];
  }
  return items;
}

const v9 = neon(V9_DATABASE_URL);
const v10 = neon(DATABASE_URL);

const [schema] = await v10`
  SELECT COUNT(*)::int AS tables
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_name IN ('candidates', 'users', 'user_face_templates', 'ballots', 'admin_audit_log')
`;
if (schema.tables !== 5) fail("Skema v10 belum lengkap. Jalankan database/neon-manual.sql pada database v10 terlebih dahulu.");
const [existing] = await v10`
  SELECT
    (SELECT COUNT(*) FROM candidates)::int AS candidates,
    (SELECT COUNT(*) FROM users)::int AS users,
    (SELECT COUNT(*) FROM ballots)::int AS ballots
`;
if (existing.candidates || existing.users || existing.ballots) {
  fail(`Database v10 tidak kosong (${JSON.stringify(existing)}). Migrasi hanya untuk database v10 yang baru.`);
}

const candidates = await v9`
  SELECT id, name, vision, mission, featured_program, image, occupation, cohort, votes,
    created_at::text AS created_at, updated_at::text AS updated_at
  FROM candidates ORDER BY id
`;
const users = await v9`
  SELECT id, user_id, password_hash, display_name, role, has_voted, email, whatsapp, study_program,
    cohort, graduation_year, domicile, face_verified_at::text AS face_verified_at, registration_source,
    created_at::text AS created_at, updated_at::text AS updated_at
  FROM users ORDER BY id
`;
const templates = await v9`
  SELECT user_id, template_role, engine, model_version, template_encrypted, source_device_class,
    quality_score::float8 AS quality_score, enrolled_at::text AS enrolled_at, last_verified_at::text AS last_verified_at
  FROM user_face_templates
  WHERE revoked_at IS NULL
`;
const [revoked] = await v9`SELECT COUNT(*)::int AS total FROM user_face_templates WHERE revoked_at IS NOT NULL`;
const voterRows = await v9`
  SELECT v.candidate_id, u.role
  FROM voters v
  JOIN users u ON u.id = v.user_id
  WHERE v.candidate_id IS NOT NULL
`;

// Enkripsi ulang template wajah dengan kunci v10, lalu pastikan dapat dibuka kembali.
const reencrypted = templates.map((template) => {
  const raw = decryptDescriptor(template.template_encrypted, V9_FACE_DATA_SECRET);
  const encrypted = encryptDescriptor(raw, FACE_DATA_SECRET);
  if (!decryptDescriptor(encrypted, FACE_DATA_SECRET).equals(raw)) throw new Error("verifikasi enkripsi ulang gagal");
  return { ...template, template_encrypted: encrypted };
});

// Surat suara anonim: hanya candidate_id, urutan diacak.
const ballots = shuffle(voterRows.map((row) => Number(row.candidate_id)));
const ballotCount = new Map();
for (const candidateId of ballots) ballotCount.set(candidateId, (ballotCount.get(candidateId) ?? 0) + 1);
const candidateRows = candidates.map((candidate) => ({ ...candidate, votes: ballotCount.get(candidate.id) ?? 0 }));
const counterDrift = candidates
  .filter((candidate) => candidate.votes !== (ballotCount.get(candidate.id) ?? 0))
  .map((candidate) => `${candidate.name}: penghitung v9 ${candidate.votes}, surat suara ${ballotCount.get(candidate.id) ?? 0}`);
const votedUsers = users.filter((user) => user.has_voted).length;

const report = {
  mode: dryRun ? "SIMULASI (tidak menulis)" : "MIGRASI",
  kandidat: candidates.length,
  akun: users.length,
  akunAdmin: users.filter((user) => user.role === "Admin").length,
  templateWajahAktifDipindah: reencrypted.length,
  templateWajahDicabutTidakDipindah: revoked.total,
  suaraMenjadiSuratSuaraAnonim: ballots.length,
  suaraDariAkunAdminDiV9: voterRows.filter((row) => row.role !== "Alumni").length,
  akunSudahMemilih: votedUsers,
  selisihPenghitungV9: counterDrift.length ? counterDrift : "tidak ada",
  selisihAkunMemilihVsSuratSuara: votedUsers - ballots.length
};
console.log(JSON.stringify(report, null, 2));
if (dryRun) process.exit(0);

const json = (value) => JSON.stringify(value);
await v10.transaction([
  v10`
    INSERT INTO candidates (id, name, vision, mission, featured_program, image, occupation, cohort, votes, created_at, updated_at)
    SELECT id, name, vision, mission, featured_program, image, occupation, cohort, votes, created_at, updated_at
    FROM jsonb_to_recordset(${json(candidateRows)}::jsonb) AS c(
      id INTEGER, name TEXT, vision TEXT, mission TEXT, featured_program TEXT, image TEXT,
      occupation TEXT, cohort TEXT, votes INTEGER, created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ
    )
  `,
  v10`SELECT setval(pg_get_serial_sequence('candidates', 'id'), (SELECT COALESCE(MAX(id), 1) FROM candidates))`,
  v10`
    INSERT INTO users (id, user_id, password_hash, display_name, role, has_voted, email, whatsapp, study_program,
      cohort, graduation_year, domicile, face_verified_at, registration_source, created_at, updated_at)
    SELECT id, user_id, password_hash, display_name, role, has_voted, email, whatsapp, study_program,
      cohort, graduation_year, domicile, face_verified_at, registration_source, created_at, updated_at
    FROM jsonb_to_recordset(${json(users)}::jsonb) AS u(
      id BIGINT, user_id TEXT, password_hash TEXT, display_name TEXT, role TEXT, has_voted BOOLEAN,
      email TEXT, whatsapp TEXT, study_program TEXT, cohort TEXT, graduation_year TEXT, domicile TEXT,
      face_verified_at TIMESTAMPTZ, registration_source TEXT, created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ
    )
  `,
  v10`SELECT setval(pg_get_serial_sequence('users', 'id'), (SELECT COALESCE(MAX(id), 1) FROM users))`,
  v10`
    INSERT INTO user_face_templates (user_id, template_role, engine, model_version, descriptor_length,
      template_encrypted, source_device_class, quality_score, enrolled_at, last_verified_at)
    SELECT user_id, template_role, engine, model_version, 1024,
      template_encrypted, source_device_class, quality_score, enrolled_at, last_verified_at
    FROM jsonb_to_recordset(${json(reencrypted)}::jsonb) AS t(
      user_id BIGINT, template_role TEXT, engine TEXT, model_version TEXT, template_encrypted TEXT,
      source_device_class TEXT, quality_score NUMERIC, enrolled_at TIMESTAMPTZ, last_verified_at TIMESTAMPTZ
    )
  `,
  v10`
    INSERT INTO ballots (candidate_id)
    SELECT value::int
    FROM jsonb_array_elements_text(${json(ballots)}::jsonb) WITH ORDINALITY AS b(value, position)
    ORDER BY position
  `,
  v10`
    INSERT INTO admin_audit_log (actor_id, actor_user_id, actor_name, action, details)
    VALUES (NULL, 'sistem', 'Skrip migrasi v9 ke v10', 'sistem.migrasi_v9', ${json({
      kandidat: candidates.length,
      akun: users.length,
      templateWajah: reencrypted.length,
      suratSuara: ballots.length
    })}::jsonb)
  `
]);

const [after] = await v10`
  SELECT
    (SELECT COUNT(*) FROM candidates)::int AS kandidat,
    (SELECT COUNT(*) FROM users)::int AS akun,
    (SELECT COUNT(*) FROM user_face_templates)::int AS "templateWajah",
    (SELECT COUNT(*) FROM ballots)::int AS "suratSuara",
    (SELECT COALESCE(SUM(votes), 0) FROM candidates)::int AS "totalPenghitung"
`;
console.log("Migrasi selesai. Isi database v10:", JSON.stringify(after));

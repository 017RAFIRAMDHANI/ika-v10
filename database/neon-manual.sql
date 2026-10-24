-- ================================================================
-- PORTAL PEMILIHAN KETUA IKA V10 - SKEMA DATABASE NEON BARU
-- Jalankan seluruh file ini SEKALI pada project/database Neon yang baru dan kosong.
-- Jangan jalankan pada database v9 (lihat database/v9-lama/ untuk skema lama).
--
-- Perubahan dibanding v9:
--   K1  Tabel voters (user_id + candidate_id) diganti tabel ballots tanpa identitas
--       pemilih: id acak, tanpa waktu. Siapa memilih siapa tidak lagi tersimpan.
--   K2  Tabel admin_audit_log mencatat seluruh tindakan administrator.
--       ballots dan admin_audit_log bersifat append-only (UPDATE/DELETE/TRUNCATE ditolak).
--   K3  Hanya akun role Alumni yang dapat memilih (ditegakkan di aplikasi dan di castVote).
--   K5  Verifikasi wajah dikunci sementara setelah beberapa kali gagal (users.face_*).
--   K6  security_events (wajah dikunci / wajah ganda) dan dpt_resmi (daftar alumni resmi).
-- ================================================================

BEGIN;

-- Dipakai data-awal.sql untuk membuat hash bcrypt akun admin.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS candidates (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  vision TEXT NOT NULL,
  mission TEXT NOT NULL,
  featured_program TEXT NOT NULL,
  image TEXT NOT NULL,
  occupation VARCHAR(255) NOT NULL,
  cohort VARCHAR(4) NOT NULL,
  votes INTEGER NOT NULL DEFAULT 0 CHECK (votes >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name VARCHAR(255) NOT NULL,
  role VARCHAR(32) NOT NULL DEFAULT 'Alumni'
    CHECK (role IN ('Alumni', 'Admin')),
  has_voted BOOLEAN NOT NULL DEFAULT FALSE,
  email VARCHAR(320),
  whatsapp VARCHAR(32),
  study_program VARCHAR(64),
  cohort VARCHAR(4),
  graduation_year VARCHAR(4),
  domicile VARCHAR(160),
  face_verified_at TIMESTAMPTZ,
  registration_source VARCHAR(32) NOT NULL DEFAULT 'Admin',
  face_failed_attempts INTEGER NOT NULL DEFAULT 0
    CONSTRAINT chk_users_face_failed_attempts CHECK (face_failed_attempts >= 0),
  face_locked_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_face_templates (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  template_role VARCHAR(40) NOT NULL
    CHECK (template_role IN ('desktop-primary', 'mobile-primary', 'canonical-cross-device')),
  engine VARCHAR(40) NOT NULL
    CHECK (engine IN ('human-webgl-v1', 'human-wasm-v1')),
  model_version VARCHAR(96) NOT NULL,
  descriptor_length INTEGER NOT NULL DEFAULT 1024 CHECK (descriptor_length = 1024),
  template_encrypted TEXT NOT NULL,
  source_device_class VARCHAR(16) NOT NULL
    CHECK (source_device_class IN ('desktop', 'mobile')),
  quality_score NUMERIC(5,4) CHECK (quality_score IS NULL OR quality_score BETWEEN 0 AND 1),
  enrolled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_verified_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (
    (template_role = 'desktop-primary' AND engine = 'human-webgl-v1' AND source_device_class = 'desktop')
    OR (template_role = 'mobile-primary' AND engine = 'human-wasm-v1' AND source_device_class = 'mobile')
    OR (template_role = 'canonical-cross-device' AND engine = 'human-wasm-v1')
  )
);

-- K1: surat suara anonim. Tidak ada user_id dan tidak ada kolom waktu;
-- id berupa UUID acak sehingga urutan id tidak mencerminkan urutan pemilih.
CREATE TABLE IF NOT EXISTS ballots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id INTEGER NOT NULL REFERENCES candidates(id) ON DELETE RESTRICT
);

-- K2: log audit tindakan administrator. actor_* disalin (bukan foreign key)
-- agar riwayat tetap utuh walaupun akun administrator dihapus.
CREATE TABLE IF NOT EXISTS admin_audit_log (
  id BIGSERIAL PRIMARY KEY,
  actor_id BIGINT,
  actor_user_id VARCHAR(255) NOT NULL,
  actor_name VARCHAR(255) NOT NULL,
  action VARCHAR(64) NOT NULL,
  target_type VARCHAR(32),
  target_id BIGINT,
  target_label VARCHAR(600),
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- K5/K6: peringatan keamanan (verifikasi wajah dikunci, wajah ganda saat mendaftar).
CREATE TABLE IF NOT EXISTS security_events (
  id BIGSERIAL PRIMARY KEY,
  event VARCHAR(64) NOT NULL,
  user_id BIGINT,
  user_label VARCHAR(600),
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- K6a: daftar alumni resmi untuk mencocokkan pendaftaran mandiri (kosong = belum dicocokkan).
CREATE TABLE IF NOT EXISTS dpt_resmi (
  nim VARCHAR(64) PRIMARY KEY,
  nama VARCHAR(255) NOT NULL,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_candidates_name ON candidates(name);
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_email_ci
  ON users (LOWER(email)) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_face_templates_user_id
  ON user_face_templates(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_face_templates_active_role
  ON user_face_templates(user_id, template_role) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_ballots_candidate_id ON ballots(candidate_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_created_at ON admin_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_events_created_at ON security_events(created_at DESC);

-- Append-only: surat suara dan log audit tidak dapat diubah, dihapus, atau dikosongkan.
CREATE OR REPLACE FUNCTION ika_tolak_perubahan() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Tabel % bersifat append-only; % tidak diizinkan.', TG_TABLE_NAME, TG_OP;
END;
$$;

DROP TRIGGER IF EXISTS trg_ballots_append_only ON ballots;
CREATE TRIGGER trg_ballots_append_only
  BEFORE UPDATE OR DELETE ON ballots
  FOR EACH ROW EXECUTE FUNCTION ika_tolak_perubahan();
DROP TRIGGER IF EXISTS trg_ballots_no_truncate ON ballots;
CREATE TRIGGER trg_ballots_no_truncate
  BEFORE TRUNCATE ON ballots
  FOR EACH STATEMENT EXECUTE FUNCTION ika_tolak_perubahan();

DROP TRIGGER IF EXISTS trg_admin_audit_log_append_only ON admin_audit_log;
CREATE TRIGGER trg_admin_audit_log_append_only
  BEFORE UPDATE OR DELETE ON admin_audit_log
  FOR EACH ROW EXECUTE FUNCTION ika_tolak_perubahan();
DROP TRIGGER IF EXISTS trg_admin_audit_log_no_truncate ON admin_audit_log;
CREATE TRIGGER trg_admin_audit_log_no_truncate
  BEFORE TRUNCATE ON admin_audit_log
  FOR EACH STATEMENT EXECUTE FUNCTION ika_tolak_perubahan();

DROP TRIGGER IF EXISTS trg_security_events_append_only ON security_events;
CREATE TRIGGER trg_security_events_append_only
  BEFORE UPDATE OR DELETE ON security_events
  FOR EACH ROW EXECUTE FUNCTION ika_tolak_perubahan();
DROP TRIGGER IF EXISTS trg_security_events_no_truncate ON security_events;
CREATE TRIGGER trg_security_events_no_truncate
  BEFORE TRUNCATE ON security_events
  FOR EACH STATEMENT EXECUTE FUNCTION ika_tolak_perubahan();

COMMIT;

-- Verifikasi: harus menampilkan 7 tabel.
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('candidates', 'users', 'user_face_templates', 'ballots', 'admin_audit_log', 'security_events', 'dpt_resmi')
ORDER BY table_name;

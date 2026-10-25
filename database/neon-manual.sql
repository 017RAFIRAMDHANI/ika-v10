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
--   T1  pengaturan_pemilu: jadwal & status pemilu (persiapan -> pemungutan suara -> ditutup).
--   T4  Pembatasan percobaan login: users.login_* (kunci per akun) dan login_throttle (per jaringan).
--   v10.5 Pemilu dapat dikembalikan ke Persiapan selama belum ada suara (uji coba).
--   v10.3 Pendaftaran mandiri tanpa password: users.nim (User ID = kode angkatan + tanggal lahir).
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
  nim VARCHAR(64),
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
  login_failed_attempts INTEGER NOT NULL DEFAULT 0
    CONSTRAINT chk_users_login_failed_attempts CHECK (login_failed_attempts >= 0),
  login_locked_until TIMESTAMPTZ,
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

-- T1: jadwal pemilu.
-- Satu baris pengaturan (id = 1).
--   dibuka_pada / ditutup_pada : jadwal pemungutan suara (ditutup_pada kosong = sampai ditutup manual)
--   ditutup_manual_pada        : waktu admin menekan "Tutup Sekarang" (final)
--   pendaftaran_saat_voting /
--   hasil_live_saat_voting     : tidak dipakai sejak v10.6 (pendaftaran selalu tertutup saat pemungutan
--                                suara; perolehan per kandidat selalu tampil). Dibiarkan agar kompatibel.
CREATE TABLE IF NOT EXISTS pengaturan_pemilu (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  dibuka_pada TIMESTAMPTZ,
  ditutup_pada TIMESTAMPTZ,
  ditutup_manual_pada TIMESTAMPTZ,
  pendaftaran_saat_voting BOOLEAN NOT NULL DEFAULT FALSE,
  hasil_live_saat_voting BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_pengaturan_pemilu_jadwal
    CHECK (ditutup_pada IS NULL OR (dibuka_pada IS NOT NULL AND ditutup_pada > dibuka_pada))
);
INSERT INTO pengaturan_pemilu (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- T4: gagal login per jaringan dalam jendela waktu. Kunci = HMAC alamat IP (IP mentah tidak disimpan).
CREATE TABLE IF NOT EXISTS login_throttle (
  key VARCHAR(128) PRIMARY KEY,
  failures INTEGER NOT NULL DEFAULT 0,
  window_start TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_candidates_name ON candidates(name);
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_nim ON users(nim) WHERE nim IS NOT NULL;
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

-- Aturan perubahan ditegakkan di database:
--   - setelah ditutup (manual atau jadwal lewat) tidak ada yang dapat diubah, kecuali dikembalikan
--     ke Persiapan selama belum ada satu pun suara (v10.5);
--   - setelah dibuka, hanya waktu tutup (ke masa depan) dan penutupan manual yang diizinkan.
CREATE OR REPLACE FUNCTION ika_jaga_pengaturan_pemilu() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  -- Kembali ke Persiapan (seluruh jadwal dikosongkan) hanya bila belum ada satu pun suara.
  IF NEW.dibuka_pada IS NULL AND NEW.ditutup_pada IS NULL AND NEW.ditutup_manual_pada IS NULL
    AND (OLD.dibuka_pada IS NOT NULL OR OLD.ditutup_manual_pada IS NOT NULL) THEN
    IF EXISTS (SELECT 1 FROM ballots) OR EXISTS (SELECT 1 FROM users WHERE has_voted) THEN
      RAISE EXCEPTION 'Sudah ada suara masuk; pemilu tidak dapat dikembalikan ke tahap persiapan.';
    END IF;
    NEW.updated_at := NOW();
    RETURN NEW;
  END IF;
  IF OLD.ditutup_manual_pada IS NOT NULL OR (OLD.ditutup_pada IS NOT NULL AND OLD.ditutup_pada <= NOW()) THEN
    RAISE EXCEPTION 'Pemungutan suara telah ditutup; pengaturan pemilu tidak dapat diubah.';
  END IF;
  IF OLD.dibuka_pada IS NOT NULL AND OLD.dibuka_pada <= NOW() THEN
    IF NEW.dibuka_pada IS DISTINCT FROM OLD.dibuka_pada
      OR NEW.pendaftaran_saat_voting IS DISTINCT FROM OLD.pendaftaran_saat_voting
      OR NEW.hasil_live_saat_voting IS DISTINCT FROM OLD.hasil_live_saat_voting THEN
      RAISE EXCEPTION 'Selama pemungutan suara hanya waktu tutup yang dapat diubah.';
    END IF;
    IF NEW.ditutup_manual_pada IS NULL AND NEW.ditutup_pada IS NOT NULL AND NEW.ditutup_pada <= NOW() THEN
      RAISE EXCEPTION 'Waktu tutup harus di masa depan; gunakan Tutup Sekarang untuk menutup pemungutan suara.';
    END IF;
  END IF;
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pengaturan_pemilu_jaga ON pengaturan_pemilu;
CREATE TRIGGER trg_pengaturan_pemilu_jaga
  BEFORE UPDATE ON pengaturan_pemilu
  FOR EACH ROW EXECUTE FUNCTION ika_jaga_pengaturan_pemilu();
DROP TRIGGER IF EXISTS trg_pengaturan_pemilu_tetap ON pengaturan_pemilu;
CREATE TRIGGER trg_pengaturan_pemilu_tetap
  BEFORE DELETE ON pengaturan_pemilu
  FOR EACH ROW EXECUTE FUNCTION ika_tolak_perubahan();
DROP TRIGGER IF EXISTS trg_pengaturan_pemilu_no_truncate ON pengaturan_pemilu;
CREATE TRIGGER trg_pengaturan_pemilu_no_truncate
  BEFORE TRUNCATE ON pengaturan_pemilu
  FOR EACH STATEMENT EXECUTE FUNCTION ika_tolak_perubahan();

COMMIT;

-- Verifikasi: harus menampilkan 9 tabel.
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('candidates', 'users', 'user_face_templates', 'ballots', 'admin_audit_log', 'security_events', 'dpt_resmi', 'pengaturan_pemilu', 'login_throttle')
ORDER BY table_name;

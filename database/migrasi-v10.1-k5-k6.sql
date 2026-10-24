-- ================================================================
-- MIGRASI v10.0 -> v10.1 (K5 & K6) untuk database v10 yang SUDAH berisi data.
-- Backup dulu: node --env-file=.env.local scripts/backup-v10.mjs
-- Jalankan sekali di Neon SQL Editor. Tidak menghapus atau mengubah data yang ada.
-- Pembatalan: database/rollback-v10.1-ke-v10.0.sql
--
-- K5b  users.face_failed_attempts & users.face_locked_until: verifikasi wajah dikunci
--      sementara setelah beberapa kali gagal.
-- K5/K6 security_events: catatan peringatan keamanan (wajah dikunci, wajah ganda), append-only.
-- K6a  dpt_resmi: daftar alumni resmi (NIM + nama) untuk mencocokkan pendaftaran mandiri.
-- ================================================================

BEGIN;

ALTER TABLE users ADD COLUMN IF NOT EXISTS face_failed_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS face_locked_until TIMESTAMPTZ;
ALTER TABLE users DROP CONSTRAINT IF EXISTS chk_users_face_failed_attempts;
ALTER TABLE users ADD CONSTRAINT chk_users_face_failed_attempts CHECK (face_failed_attempts >= 0);

CREATE TABLE IF NOT EXISTS security_events (
  id BIGSERIAL PRIMARY KEY,
  event VARCHAR(64) NOT NULL,
  user_id BIGINT,
  user_label VARCHAR(600),
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_security_events_created_at ON security_events(created_at DESC);

CREATE TABLE IF NOT EXISTS dpt_resmi (
  nim VARCHAR(64) PRIMARY KEY,
  nama VARCHAR(255) NOT NULL,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ika_tolak_perubahan() sudah dibuat oleh skema v10.0.
DROP TRIGGER IF EXISTS trg_security_events_append_only ON security_events;
CREATE TRIGGER trg_security_events_append_only
  BEFORE UPDATE OR DELETE ON security_events
  FOR EACH ROW EXECUTE FUNCTION ika_tolak_perubahan();
DROP TRIGGER IF EXISTS trg_security_events_no_truncate ON security_events;
CREATE TRIGGER trg_security_events_no_truncate
  BEFORE TRUNCATE ON security_events
  FOR EACH STATEMENT EXECUTE FUNCTION ika_tolak_perubahan();

COMMIT;

-- Verifikasi: 2 kolom baru dan 2 tabel baru.
SELECT
  (SELECT COUNT(*) FROM information_schema.columns
    WHERE table_name = 'users' AND column_name IN ('face_failed_attempts', 'face_locked_until')) AS kolom_baru,
  (SELECT COUNT(*) FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name IN ('security_events', 'dpt_resmi')) AS tabel_baru;

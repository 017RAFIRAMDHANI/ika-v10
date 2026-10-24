-- ================================================================
-- ROLLBACK v10.1 -> v10.0: membatalkan migrasi-v10.1-k5-k6.sql.
-- Pakai hanya bila kode dikembalikan ke commit v10.0. Data akun, kandidat, suara,
-- dan log audit tidak tersentuh. Yang hilang: penghitung gagal/kunci wajah,
-- seluruh catatan security_events, dan daftar dpt_resmi.
-- Backup dulu: node --env-file=.env.local scripts/backup-v10.mjs
-- ================================================================

BEGIN;

DROP TABLE IF EXISTS dpt_resmi;
DROP TABLE IF EXISTS security_events;
ALTER TABLE users DROP CONSTRAINT IF EXISTS chk_users_face_failed_attempts;
ALTER TABLE users DROP COLUMN IF EXISTS face_locked_until;
ALTER TABLE users DROP COLUMN IF EXISTS face_failed_attempts;

COMMIT;

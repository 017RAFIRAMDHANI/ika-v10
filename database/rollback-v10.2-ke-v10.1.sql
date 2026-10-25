-- ================================================================
-- ROLLBACK v10.2 -> v10.1: membatalkan migrasi-v10.2-t1-t4.sql.
-- Pakai hanya bila kode dikembalikan ke commit v10.1. Data akun, kandidat, suara,
-- log audit, dan peringatan keamanan tidak tersentuh. Yang hilang: jadwal pemilu dan
-- penghitung percobaan login. Tanpa T1, pemungutan suara kembali terbuka kapan saja.
-- Backup dulu: node --env-file=.env.local scripts/backup-v10.mjs
-- ================================================================

BEGIN;

DROP TABLE IF EXISTS pengaturan_pemilu;
DROP FUNCTION IF EXISTS ika_jaga_pengaturan_pemilu();

DROP TABLE IF EXISTS login_throttle;
ALTER TABLE users DROP CONSTRAINT IF EXISTS chk_users_login_failed_attempts;
ALTER TABLE users DROP COLUMN IF EXISTS login_locked_until;
ALTER TABLE users DROP COLUMN IF EXISTS login_failed_attempts;

COMMIT;

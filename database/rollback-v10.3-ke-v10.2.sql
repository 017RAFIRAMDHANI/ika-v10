-- ================================================================
-- ROLLBACK v10.3 -> v10.2: membatalkan migrasi-v10.3-daftar-tanpa-password.sql.
-- Pakai hanya bila kode dikembalikan ke commit v10.2. Akun, kandidat, suara, log audit, dan
-- peringatan keamanan tidak tersentuh. Yang hilang: kolom NIM. Pendaftar yang mendaftar di v10.3
-- tetap dapat login dengan kode angkatan + tanggal lahir, tetapi NIM-nya tidak lagi tersimpan
-- (lihat backup). Backup dulu: node --env-file=.env.local scripts/backup-v10.mjs
-- ================================================================

BEGIN;

DROP INDEX IF EXISTS uq_users_nim;
ALTER TABLE users DROP COLUMN IF EXISTS nim;

COMMIT;

-- ================================================================
-- MIGRASI v10.2 -> v10.3 untuk database v10 yang SUDAH berisi data:
--   Pendaftaran mandiri tanpa isian password. User ID dan password pendaftar baru dibuat dari
--   tahun angkatan + tanggal lahir (sama seperti alumni lain); NPM/NIM disimpan di kolom users.nim.
-- Backup dulu: node --env-file=.env.local scripts/backup-v10.mjs
-- Jalankan sekali di Neon SQL Editor. Akun yang sudah ada tetap login seperti sebelumnya.
-- Pembatalan: database/rollback-v10.3-ke-v10.2.sql
-- ================================================================

BEGIN;

ALTER TABLE users ADD COLUMN IF NOT EXISTS nim VARCHAR(64);

-- Pendaftar mandiri lama memakai NIM sebagai User ID: NIM-nya dicatat agar tidak dapat didaftarkan lagi.
UPDATE users SET nim = user_id
WHERE registration_source = 'PublicRegistration' AND nim IS NULL;

-- Satu NIM hanya untuk satu akun.
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_nim ON users(nim) WHERE nim IS NOT NULL;

COMMIT;

-- Verifikasi: hanya akun pendaftaran mandiri yang memiliki NIM.
SELECT registration_source, COUNT(*)::int AS akun, COUNT(nim)::int AS ber_nim
FROM users
GROUP BY registration_source
ORDER BY registration_source;

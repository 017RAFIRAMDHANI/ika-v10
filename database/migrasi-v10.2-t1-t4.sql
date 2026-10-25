-- ================================================================
-- MIGRASI v10.1 -> v10.2 untuk database v10 yang SUDAH berisi data:
--   T1  jadwal pemilu (tabel pengaturan_pemilu)
--   T4  pembatasan percobaan login (kolom users.login_* dan tabel login_throttle)
-- Backup dulu: node --env-file=.env.local scripts/backup-v10.mjs
-- Jalankan sekali di Neon SQL Editor. Tidak mengubah data yang ada.
-- Pembatalan: database/rollback-v10.2-ke-v10.1.sql
--
-- PENTING: setelah migrasi, status pemilu = PERSIAPAN (jadwal kosong) sehingga
-- pemungutan suara TERTUTUP sampai admin mengatur jadwal atau menekan "Buka Sekarang"
-- di Dashboard Admin.
-- ================================================================

BEGIN;

-- Satu baris pengaturan (id = 1).
--   dibuka_pada / ditutup_pada : jadwal pemungutan suara (ditutup_pada kosong = sampai ditutup manual)
--   ditutup_manual_pada        : waktu admin menekan "Tutup Sekarang" (final)
--   pendaftaran_saat_voting    : izinkan pendaftaran mandiri selama pemungutan suara
--   hasil_live_saat_voting     : tampilkan perolehan per kandidat kepada pemilih selama pemungutan suara
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

-- Aturan perubahan ditegakkan di database:
--   - setelah ditutup (manual atau jadwal lewat) tidak ada yang dapat diubah;
--   - setelah dibuka, hanya waktu tutup (ke masa depan) dan penutupan manual yang diizinkan.
CREATE OR REPLACE FUNCTION ika_jaga_pengaturan_pemilu() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
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

-- T4: 5 kali salah password = akun dikunci 15 menit (diatur aplikasi).
ALTER TABLE users ADD COLUMN IF NOT EXISTS login_failed_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS login_locked_until TIMESTAMPTZ;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_users_login_failed_attempts') THEN
    ALTER TABLE users ADD CONSTRAINT chk_users_login_failed_attempts CHECK (login_failed_attempts >= 0);
  END IF;
END;
$$;

-- T4: gagal login per jaringan dalam jendela waktu. Kunci = HMAC alamat IP (IP mentah tidak disimpan).
CREATE TABLE IF NOT EXISTS login_throttle (
  key VARCHAR(128) PRIMARY KEY,
  failures INTEGER NOT NULL DEFAULT 0,
  window_start TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMIT;

-- Verifikasi: 1 baris, jadwal kosong (status PERSIAPAN).
SELECT id, dibuka_pada, ditutup_pada, ditutup_manual_pada, pendaftaran_saat_voting, hasil_live_saat_voting
FROM pengaturan_pemilu;

-- Verifikasi T4: 2 kolom baru dan tabel login_throttle.
SELECT column_name FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'users' AND column_name LIKE 'login_%'
UNION ALL
SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'login_throttle';

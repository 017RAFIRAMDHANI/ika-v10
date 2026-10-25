-- ================================================================
-- MIGRASI v10.4 -> v10.5: pemilu dapat dikembalikan ke tahap PERSIAPAN selama BELUM ADA SUARA.
-- Contoh kebutuhan: uji coba buka/tutup sebelum hari pemilihan. Begitu ada satu suara, penutupan
-- tetap final seperti sebelumnya. Hanya fungsi trigger yang diganti; data tidak berubah.
-- Backup dulu: node --env-file=.env.local scripts/backup-v10.mjs
-- Pembatalan: database/rollback-v10.5-ke-v10.4.sql
-- ================================================================

BEGIN;

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

COMMIT;

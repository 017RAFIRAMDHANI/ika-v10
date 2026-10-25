-- ================================================================
-- ROLLBACK v10.5 -> v10.4: penutupan pemilu kembali final tanpa pengecualian.
-- Pakai hanya bila kode dikembalikan ke commit v10.4. Data tidak berubah.
-- ================================================================

BEGIN;

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

COMMIT;

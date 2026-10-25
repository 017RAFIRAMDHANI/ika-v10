-- ================================================================
-- ROLLBACK v10.7 -> v10.6: surat suara kembali append-only tanpa pengecualian (Reset Uji Coba
-- tidak berfungsi lagi). Pakai hanya bila kode dikembalikan ke commit sebelum v10.7. Data tidak berubah.
-- ================================================================

BEGIN;

CREATE OR REPLACE FUNCTION ika_tolak_perubahan() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Tabel % bersifat append-only; % tidak diizinkan.', TG_TABLE_NAME, TG_OP;
END;
$$;

COMMIT;

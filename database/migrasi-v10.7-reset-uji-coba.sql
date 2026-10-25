-- ================================================================
-- MIGRASI ke v10.7: tombol "Reset Uji Coba" di menu Pemilu.
-- Surat suara tetap append-only. Satu-satunya pengecualian: transaksi Reset Uji Coba dari aplikasi,
-- yang menyalakan penanda ika.reset_uji_coba hanya di dalam transaksinya sendiri (SET LOCAL) dan
-- mencatat jumlah suara yang dihapus di admin_audit_log. DELETE biasa tetap ditolak.
-- Hanya fungsi trigger yang diganti; data tidak berubah.
-- Backup dulu: node --env-file=.env.local scripts/backup-v10.mjs
-- Pembatalan: database/rollback-v10.7-ke-v10.6.sql
-- ================================================================

BEGIN;

CREATE OR REPLACE FUNCTION ika_tolak_perubahan() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  -- v10.7: Reset Uji Coba boleh menghapus surat suara di dalam transaksinya sendiri.
  IF TG_TABLE_NAME = 'ballots' AND TG_OP = 'DELETE'
    AND current_setting('ika.reset_uji_coba', true) = 'ya' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'Tabel % bersifat append-only; % tidak diizinkan.', TG_TABLE_NAME, TG_OP;
END;
$$;

COMMIT;

-- ================================================================
-- Menghapus akun pemilih SIMULASI (NIM berawalan SIMULASI-) setelah uji coba.
-- Urutan: tekan Reset Uji Coba di menu Pemilu lebih dulu (status "sudah memilih" = 0),
-- lalu jalankan file ini di Neon SQL Editor. Data wajahnya ikut terhapus (ON DELETE CASCADE).
-- Hanya akun pendaftaran mandiri ber-NIM SIMULASI- yang belum memilih yang dihapus; akun alumni
-- asli tidak tersentuh. Penghapusan dicatat di admin_audit_log (sistem.hapus_akun_simulasi).
-- ================================================================

-- Cek dulu: akun simulasi yang akan dihapus dan yang tertahan karena sudah memilih (harus 0).
SELECT
  COUNT(*) FILTER (WHERE NOT has_voted) AS akan_dihapus,
  COUNT(*) FILTER (WHERE has_voted) AS sudah_memilih_jalankan_reset_dulu
FROM users
WHERE nim LIKE 'SIMULASI-%' AND registration_source = 'PublicRegistration' AND role = 'Alumni';

WITH removed AS (
  DELETE FROM users
  WHERE nim LIKE 'SIMULASI-%'
    AND registration_source = 'PublicRegistration'
    AND role = 'Alumni'
    AND NOT has_voted
  RETURNING id
), logged AS (
  INSERT INTO admin_audit_log (actor_user_id, actor_name, action, target_type, target_label, details)
  SELECT 'sistem', 'Pembersihan simulasi', 'sistem.hapus_akun_simulasi', 'user', 'Akun pemilih simulasi',
    jsonb_build_object('akunDihapus', (SELECT COUNT(*) FROM removed))
  WHERE EXISTS (SELECT 1 FROM removed)
  RETURNING id
)
SELECT COUNT(*) AS akun_dihapus FROM removed;

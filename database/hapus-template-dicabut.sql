-- ================================================================
-- PERAWATAN v10.4 (T3, retensi data biometrik) - opsional.
-- Sejak v10.4, reset wajah langsung MENGHAPUS template. Template yang dicabut oleh versi sebelumnya
-- (v10.0 - v10.3) masih tersimpan; file ini menghapusnya. Tidak ada perubahan skema.
-- Tidak dapat dibatalkan: backup dulu (node --env-file=.env.local scripts/backup-v10.mjs).
-- ================================================================

-- Cek dulu jumlahnya:
SELECT COUNT(*) AS template_dicabut FROM user_face_templates WHERE revoked_at IS NOT NULL;

BEGIN;
DELETE FROM user_face_templates WHERE revoked_at IS NOT NULL;
COMMIT;

-- Verifikasi: harus 0.
SELECT COUNT(*) AS template_dicabut FROM user_face_templates WHERE revoked_at IS NOT NULL;

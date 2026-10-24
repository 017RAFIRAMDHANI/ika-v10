-- OPSIONAL: cabut semua template wajah model lama (faceres) agar pemilih
-- mendaftarkan ulang wajah dengan model ArcFace lintas perangkat.
-- Setelah dijalankan, pemilih cukup satu kali pemindaian saat membuka bilik suara
-- berikutnya. Data suara/hak pilih tidak disentuh; template lama ditandai revoked untuk audit.
-- Backup database sebelum menjalankan.

BEGIN;

WITH revoked AS (
  UPDATE user_face_templates
  SET revoked_at = NOW(), updated_at = NOW()
  WHERE model_version = 'human-3.3.6-faceres-1024-v1'
    AND revoked_at IS NULL
  RETURNING user_id
)
UPDATE users
SET face_verified_at = NULL, updated_at = NOW()
WHERE id IN (SELECT user_id FROM revoked);

COMMIT;

SELECT
  model_version,
  COUNT(*) FILTER (WHERE revoked_at IS NULL) AS template_aktif,
  COUNT(*) FILTER (WHERE revoked_at IS NOT NULL) AS template_dicabut
FROM user_face_templates
GROUP BY model_version;

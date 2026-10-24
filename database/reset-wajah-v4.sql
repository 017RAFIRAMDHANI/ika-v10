-- RESET MANUAL SATU PEMILIH V4
-- Ganti NPM_NIM_TARGET secara tepat. Backup database sebelum menjalankan.
-- Data suara/hak pilih tidak disentuh; template lama ditandai revoked untuk audit.

BEGIN;

WITH target AS (
  SELECT id FROM users WHERE user_id = 'NPM_NIM_TARGET' LIMIT 1
)
UPDATE user_face_templates
SET revoked_at = NOW(), updated_at = NOW()
WHERE user_id = (SELECT id FROM target)
  AND revoked_at IS NULL;

UPDATE users
SET face_verified_at = NULL, updated_at = NOW()
WHERE user_id = 'NPM_NIM_TARGET';

COMMIT;

SELECT
  u.user_id,
  u.face_verified_at,
  COUNT(ft.id) FILTER (WHERE ft.revoked_at IS NULL) AS template_aktif,
  COUNT(ft.id) FILTER (WHERE ft.revoked_at IS NOT NULL) AS template_dicabut
FROM users u
LEFT JOIN user_face_templates ft ON ft.user_id = u.id
WHERE u.user_id = 'NPM_NIM_TARGET'
GROUP BY u.id, u.user_id, u.face_verified_at;

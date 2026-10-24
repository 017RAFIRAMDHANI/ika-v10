-- WAJIB untuk database yang sudah dibuat memakai IKA V4.0.0 atau V4.0.1.
-- Jalankan sekali di Neon V4 > SQL Editor sebelum memakai kode V4.0.2.
-- Tidak menghapus user, template lama, kandidat, atau suara.

BEGIN;

-- Nama otomatis constraint dari schema V4.0.0/V4.0.1.
ALTER TABLE user_face_templates
  DROP CONSTRAINT IF EXISTS user_face_templates_template_role_check;
ALTER TABLE user_face_templates
  DROP CONSTRAINT IF EXISTS user_face_templates_check;

-- Nama eksplisit untuk versi V4.0.2 dan seterusnya.
ALTER TABLE user_face_templates
  DROP CONSTRAINT IF EXISTS chk_face_template_role;
ALTER TABLE user_face_templates
  DROP CONSTRAINT IF EXISTS chk_face_template_profile_engine;

ALTER TABLE user_face_templates
  ADD CONSTRAINT chk_face_template_role CHECK (
    template_role IN ('desktop-primary', 'mobile-primary', 'canonical-cross-device')
  );

ALTER TABLE user_face_templates
  ADD CONSTRAINT chk_face_template_profile_engine CHECK (
    (template_role = 'desktop-primary' AND engine = 'human-webgl-v1' AND source_device_class = 'desktop')
    OR (template_role = 'mobile-primary' AND engine = 'human-wasm-v1' AND source_device_class = 'mobile')
    OR (template_role = 'canonical-cross-device' AND engine = 'human-wasm-v1')
  );

COMMIT;

SELECT
  COUNT(*) FILTER (WHERE template_role = 'desktop-primary' AND revoked_at IS NULL) AS desktop_primary,
  COUNT(*) FILTER (WHERE template_role = 'mobile-primary' AND revoked_at IS NULL) AS mobile_primary,
  COUNT(*) FILTER (WHERE template_role = 'canonical-cross-device' AND revoked_at IS NULL) AS canonical_lintas_perangkat
FROM user_face_templates;

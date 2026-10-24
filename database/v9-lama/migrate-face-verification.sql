-- OPSIONAL: hanya untuk pengembang yang sengaja menguji V4 pada salinan database V3.
-- Untuk produksi V4, buat database Neon BARU dan jalankan database/neon-manual.sql.
-- Script ini tidak memindahkan descriptor V3 karena engine asal harus dipastikan manual.

BEGIN;

ALTER TABLE users ADD COLUMN IF NOT EXISTS face_verified_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS user_face_templates (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  template_role VARCHAR(40) NOT NULL
    CHECK (template_role IN ('desktop-primary', 'mobile-primary', 'canonical-cross-device')),
  engine VARCHAR(40) NOT NULL
    CHECK (engine IN ('human-webgl-v1', 'human-wasm-v1')),
  model_version VARCHAR(96) NOT NULL,
  descriptor_length INTEGER NOT NULL DEFAULT 1024 CHECK (descriptor_length = 1024),
  template_encrypted TEXT NOT NULL,
  source_device_class VARCHAR(16) NOT NULL
    CHECK (source_device_class IN ('desktop', 'mobile')),
  quality_score NUMERIC(5,4) CHECK (quality_score IS NULL OR quality_score BETWEEN 0 AND 1),
  enrolled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_verified_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (
    (template_role = 'desktop-primary' AND engine = 'human-webgl-v1' AND source_device_class = 'desktop')
    OR (template_role = 'mobile-primary' AND engine = 'human-wasm-v1' AND source_device_class = 'mobile')
    OR (template_role = 'canonical-cross-device' AND engine = 'human-wasm-v1')
  )
);

CREATE INDEX IF NOT EXISTS idx_face_templates_user_id
  ON user_face_templates(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_face_templates_active_role
  ON user_face_templates(user_id, template_role) WHERE revoked_at IS NULL;

COMMIT;

SELECT
  COUNT(*) FILTER (WHERE template_role = 'desktop-primary' AND revoked_at IS NULL) AS desktop_primary,
  COUNT(*) FILTER (WHERE template_role = 'mobile-primary' AND revoked_at IS NULL) AS mobile_primary,
  COUNT(*) FILTER (WHERE template_role = 'canonical-cross-device' AND revoked_at IS NULL) AS lintas_perangkat
FROM user_face_templates;

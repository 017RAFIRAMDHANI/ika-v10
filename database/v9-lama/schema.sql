CREATE TABLE IF NOT EXISTS candidates (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  vision TEXT NOT NULL,
  mission TEXT NOT NULL,
  featured_program TEXT NOT NULL,
  image TEXT NOT NULL,
  occupation VARCHAR(255) NOT NULL,
  cohort VARCHAR(4) NOT NULL,
  votes INTEGER NOT NULL DEFAULT 0 CHECK (votes >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name VARCHAR(255) NOT NULL,
  role VARCHAR(32) NOT NULL DEFAULT 'Alumni'
    CHECK (role IN ('Alumni', 'Admin')),

  has_voted BOOLEAN NOT NULL DEFAULT FALSE,
  email VARCHAR(320),
  whatsapp VARCHAR(32),
  study_program VARCHAR(64),
  cohort VARCHAR(4),
  graduation_year VARCHAR(4),
  domicile VARCHAR(160),
  face_verified_at TIMESTAMPTZ,
  registration_source VARCHAR(32) NOT NULL DEFAULT 'Admin',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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

CREATE TABLE IF NOT EXISTS voters (
  id SERIAL PRIMARY KEY,
  user_id BIGINT UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  candidate_id INTEGER REFERENCES candidates(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_voters_user_id ON voters(user_id);
CREATE INDEX IF NOT EXISTS idx_voters_candidate_id ON voters(candidate_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_candidates_name ON candidates(name);
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_email_ci
  ON users (LOWER(email)) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_face_templates_user_id
  ON user_face_templates(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_face_templates_active_role
  ON user_face_templates(user_id, template_role) WHERE revoked_at IS NULL;

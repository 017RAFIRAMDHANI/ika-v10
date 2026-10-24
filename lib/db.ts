import { neon } from "@neondatabase/serverless";
import type { FaceDescriptorEngine, FaceDeviceClass, FaceTemplateRole } from "@/lib/face-types";
import type {
  AdminStats,
  AdminUserRecord,
  AuditLogEntry,
  Candidate,
  SecurityEventEntry,
  ExportVoterRecord,
  UserRole,
  VoteIntegrity,
  VoterRecord
} from "@/lib/types";

export type StoredFaceTemplateInput = {
  templateRole: FaceTemplateRole;
  descriptorEngine: FaceDescriptorEngine;
  modelVersion: string;
  sourceDeviceClass: FaceDeviceClass;
  templateEncrypted: string;
  qualityScore: number | null;
  enrolledAt?: string | null;
  lastVerifiedAt?: string | null;
};

// Administrator yang melakukan aksi; dicatat ke admin_audit_log pada statement yang sama dengan aksinya.
export type AuditActor = {
  id: number;
  userId: string;
  displayName: string;
};

function getSql() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL belum dikonfigurasi.");
  }
  return neon(databaseUrl);
}

export async function findUserByLogin(userId: string) {
  const sql = getSql();
  const rows = await sql`
    SELECT
      id::int AS id,
      user_id AS "userId",
      password_hash AS "passwordHash",
      display_name AS "displayName",
      role,
      has_voted AS "hasVoted",
      EXISTS (
        SELECT 1 FROM user_face_templates ft
        WHERE ft.user_id = users.id AND ft.revoked_at IS NULL
      ) AS "faceEnrolled",
      EXISTS (
        SELECT 1 FROM user_face_templates ft
        WHERE ft.user_id = users.id AND ft.template_role = 'desktop-primary' AND ft.revoked_at IS NULL
      ) AS "desktopPrimaryEnrolled",
      EXISTS (
        SELECT 1 FROM user_face_templates ft
        WHERE ft.user_id = users.id AND ft.template_role = 'mobile-primary' AND ft.revoked_at IS NULL
      ) AS "mobilePrimaryEnrolled",
      EXISTS (
        SELECT 1 FROM user_face_templates ft
        WHERE ft.user_id = users.id AND ft.template_role = 'canonical-cross-device' AND ft.revoked_at IS NULL
      ) AS "canonicalEnrolled",
      face_verified_at IS NOT NULL AS "faceVerified"
    FROM users
    WHERE user_id = ${userId}
    LIMIT 1
  `;
  return (rows[0] ?? null) as
    | {
        id: number;
        userId: string;
        passwordHash: string;
        displayName: string;
        role: "Alumni" | "Admin";
        hasVoted: boolean;
        faceEnrolled: boolean;
        faceVerified: boolean;
        desktopPrimaryEnrolled: boolean;
        mobilePrimaryEnrolled: boolean;
        canonicalEnrolled: boolean;
      }
    | null;
}

export async function findSessionUser(id: number) {
  const sql = getSql();
  const rows = await sql`
    SELECT
      id::int AS id,
      user_id AS "userId",
      display_name AS "displayName",
      role,
      has_voted AS "hasVoted",
      EXISTS (
        SELECT 1 FROM user_face_templates ft
        WHERE ft.user_id = users.id AND ft.revoked_at IS NULL
      ) AS "faceEnrolled",
      EXISTS (
        SELECT 1 FROM user_face_templates ft
        WHERE ft.user_id = users.id AND ft.template_role = 'desktop-primary' AND ft.revoked_at IS NULL
      ) AS "desktopPrimaryEnrolled",
      EXISTS (
        SELECT 1 FROM user_face_templates ft
        WHERE ft.user_id = users.id AND ft.template_role = 'mobile-primary' AND ft.revoked_at IS NULL
      ) AS "mobilePrimaryEnrolled",
      EXISTS (
        SELECT 1 FROM user_face_templates ft
        WHERE ft.user_id = users.id AND ft.template_role = 'canonical-cross-device' AND ft.revoked_at IS NULL
      ) AS "canonicalEnrolled",
      face_verified_at IS NOT NULL AS "faceVerified"
    FROM users
    WHERE id = ${id}
    LIMIT 1
  `;
  return (rows[0] ?? null) as
    | {
        id: number;
        userId: string;
        displayName: string;
        role: "Alumni" | "Admin";
        hasVoted: boolean;
        faceEnrolled: boolean;
        faceVerified: boolean;
        desktopPrimaryEnrolled: boolean;
        mobilePrimaryEnrolled: boolean;
        canonicalEnrolled: boolean;
      }
    | null;
}

export async function upgradeLegacyPassword(id: number, passwordHash: string) {
  const sql = getSql();
  await sql`
    UPDATE users
    SET password_hash = ${passwordHash}, updated_at = NOW()
    WHERE id = ${id}
  `;
}

export async function getCandidates(): Promise<Candidate[]> {
  const sql = getSql();
  const rows = await sql`
    SELECT
      id,
      name,
      vision,
      mission,
      featured_program AS "featuredProgram",
      image,
      occupation,
      cohort,
      votes
    FROM candidates
    ORDER BY id ASC
  `;
  return rows as Candidate[];
}

// Surat suara disimpan tanpa identitas pemilih (asas rahasia): tabel ballots hanya berisi
// candidate_id dengan id acak dan tanpa waktu. candidates.updated_at sengaja tidak diubah
// agar waktu suara masuk tidak dapat dicocokkan dengan users.updated_at.
export async function castVote(userId: number, candidateId: number, faceVerified: boolean) {
  const sql = getSql();
  const rows = await sql`
    WITH candidate_exists AS (
      SELECT id FROM candidates WHERE id = ${candidateId}
    ), updated_user AS (
      UPDATE users
      SET has_voted = TRUE, updated_at = NOW()
      WHERE id = ${userId}
        AND role = 'Alumni'
        AND has_voted = FALSE
        AND ${faceVerified} = TRUE
        AND EXISTS (SELECT 1 FROM candidate_exists)
      RETURNING id
    ), new_ballot AS (
      INSERT INTO ballots (candidate_id)
      SELECT ${candidateId}
      FROM updated_user
      RETURNING id
    )
    UPDATE candidates
    SET votes = votes + 1
    WHERE id = ${candidateId} AND EXISTS (SELECT 1 FROM new_ballot)
    RETURNING id
  `;
  return rows as Candidate[];
}

export async function getVoters(search = ""): Promise<VoterRecord[]> {
  const sql = getSql();
  const query = `%${search.trim()}%`;
  const rows = await sql`
    SELECT
      u.id,
      u.id::int AS "userRecordId",
      u.user_id AS "userId",
      u.display_name AS "displayName",
      u.role,
      u.has_voted AS "hasVoted",
      u.email,
      u.whatsapp,
      u.study_program AS "studyProgram",
      u.cohort,
      u.graduation_year AS "graduationYear",
      u.domicile,
      COALESCE(face_data.template_count, 0) > 0 AS "faceEnrolled",
      COALESCE(face_data.desktop_primary, FALSE) AS "desktopPrimaryEnrolled",
      COALESCE(face_data.mobile_primary, FALSE) AS "mobilePrimaryEnrolled",
      COALESCE(face_data.canonical, FALSE) AS "canonicalEnrolled",
      COALESCE(face_data.template_count, 0)::int AS "faceTemplateCount",
      u.face_verified_at IS NOT NULL AS "faceVerified",
      face_data.first_enrolled_at::text AS "faceEnrolledAt",
      u.face_verified_at::text AS "faceVerifiedAt",
      u.registration_source AS "registrationSource",
      u.created_at::text AS "createdAt",
      u.updated_at::text AS "updatedAt"
    FROM users u
    LEFT JOIN LATERAL (
      SELECT
        COUNT(*)::int AS template_count,
        BOOL_OR(ft.template_role = 'desktop-primary') AS desktop_primary,
        BOOL_OR(ft.template_role = 'mobile-primary') AS mobile_primary,
        BOOL_OR(ft.template_role = 'canonical-cross-device') AS canonical,
        MIN(ft.enrolled_at) AS first_enrolled_at
      FROM user_face_templates ft
      WHERE ft.user_id = u.id AND ft.revoked_at IS NULL
    ) face_data ON TRUE
    WHERE u.role = 'Alumni'
      AND (${search.trim() === ""}
       OR u.user_id ILIKE ${query}
       OR u.display_name ILIKE ${query})
    ORDER BY u.created_at ASC
  `;
  return rows as VoterRecord[];
}

export async function getVoter(id: number) {
  const sql = getSql();
  const rows = await sql`
    SELECT
      u.id,
      u.id::int AS "userRecordId",
      u.user_id AS "userId",
      u.display_name AS "displayName",
      u.role,
      u.has_voted AS "hasVoted",
      u.email,
      u.whatsapp,
      u.study_program AS "studyProgram",
      u.cohort,
      u.graduation_year AS "graduationYear",
      u.domicile,
      COALESCE(face_data.template_count, 0) > 0 AS "faceEnrolled",
      COALESCE(face_data.desktop_primary, FALSE) AS "desktopPrimaryEnrolled",
      COALESCE(face_data.mobile_primary, FALSE) AS "mobilePrimaryEnrolled",
      COALESCE(face_data.canonical, FALSE) AS "canonicalEnrolled",
      COALESCE(face_data.template_count, 0)::int AS "faceTemplateCount",
      u.face_verified_at IS NOT NULL AS "faceVerified",
      face_data.first_enrolled_at::text AS "faceEnrolledAt",
      u.face_verified_at::text AS "faceVerifiedAt",
      u.registration_source AS "registrationSource",
      u.created_at::text AS "createdAt",
      u.updated_at::text AS "updatedAt"
    FROM users u
    LEFT JOIN LATERAL (
      SELECT
        COUNT(*)::int AS template_count,
        BOOL_OR(ft.template_role = 'desktop-primary') AS desktop_primary,
        BOOL_OR(ft.template_role = 'mobile-primary') AS mobile_primary,
        BOOL_OR(ft.template_role = 'canonical-cross-device') AS canonical,
        MIN(ft.enrolled_at) AS first_enrolled_at
      FROM user_face_templates ft
      WHERE ft.user_id = u.id AND ft.revoked_at IS NULL
    ) face_data ON TRUE
    WHERE u.id = ${id}
    LIMIT 1
  `;
  return (rows[0] ?? null) as VoterRecord | null;
}

export async function getVotersForExport(): Promise<ExportVoterRecord[]> {
  const sql = getSql();
  const rows = await sql`
    SELECT
      u.id,
      u.id::int AS "userRecordId",
      u.user_id AS "userId",
      u.display_name AS "displayName",
      u.role,
      u.has_voted AS "hasVoted",
      u.email,
      u.whatsapp,
      u.study_program AS "studyProgram",
      u.cohort,
      u.graduation_year AS "graduationYear",
      u.domicile,
      COALESCE(face_data.template_count, 0) > 0 AS "faceEnrolled",
      COALESCE(face_data.desktop_primary, FALSE) AS "desktopPrimaryEnrolled",
      COALESCE(face_data.mobile_primary, FALSE) AS "mobilePrimaryEnrolled",
      COALESCE(face_data.canonical, FALSE) AS "canonicalEnrolled",
      COALESCE(face_data.template_count, 0)::int AS "faceTemplateCount",
      u.face_verified_at IS NOT NULL AS "faceVerified",
      face_data.first_enrolled_at::text AS "faceEnrolledAt",
      u.face_verified_at::text AS "faceVerifiedAt",
      u.registration_source AS "registrationSource",
      u.created_at::text AS "createdAt",
      u.updated_at::text AS "updatedAt",
      face_data.templates_json::text AS "faceTemplatesJson"
    FROM users u
    LEFT JOIN LATERAL (
      SELECT
        COUNT(*)::int AS template_count,
        BOOL_OR(ft.template_role = 'desktop-primary') AS desktop_primary,
        BOOL_OR(ft.template_role = 'mobile-primary') AS mobile_primary,
        BOOL_OR(ft.template_role = 'canonical-cross-device') AS canonical,
        MIN(ft.enrolled_at) AS first_enrolled_at,
        JSONB_AGG(JSONB_BUILD_OBJECT(
          'templateRole', ft.template_role,
          'descriptorEngine', ft.engine,
          'modelVersion', ft.model_version,
          'sourceDeviceClass', ft.source_device_class,
          'templateEncrypted', ft.template_encrypted,
          'qualityScore', ft.quality_score,
          'enrolledAt', ft.enrolled_at,
          'lastVerifiedAt', ft.last_verified_at
        ) ORDER BY ft.template_role) AS templates_json
      FROM user_face_templates ft
      WHERE ft.user_id = u.id AND ft.revoked_at IS NULL
    ) face_data ON TRUE
    WHERE u.role = 'Alumni'
    ORDER BY u.created_at ASC
  `;
  return rows as ExportVoterRecord[];
}

export async function importUsers(
  users: Array<{
    userId: string;
    displayName: string;
    passwordHash: string;
    updatePassword: boolean;
    email: string | null;
    whatsapp: string | null;
    studyProgram: string | null;
    cohort: string | null;
    graduationYear: string | null;
    domicile: string | null;
    faceTemplates: StoredFaceTemplateInput[];
    faceVerifiedAt: string | null;
  }>,
  actor: AuditActor,
  format: "backup" | "legacy"
) {
  const sql = getSql();
  const payload = JSON.stringify(
    users.map((user) => ({
      user_id: user.userId,
      display_name: user.displayName,
      password_hash: user.passwordHash,
      update_password: user.updatePassword,
      email: user.email,
      whatsapp: user.whatsapp,
      study_program: user.studyProgram,
      cohort: user.cohort,
      graduation_year: user.graduationYear,
      domicile: user.domicile,
      face_templates: user.faceTemplates,
      face_verified_at: user.faceVerifiedAt
    }))
  );
  const rows = await sql`
    WITH imported AS (
      SELECT *
      FROM jsonb_to_recordset(${payload}::jsonb) AS source(
        user_id TEXT,
        display_name TEXT,
        password_hash TEXT,
        update_password BOOLEAN,
        email TEXT,
        whatsapp TEXT,
        study_program TEXT,
        cohort TEXT,
        graduation_year TEXT,
        domicile TEXT,
        face_templates JSONB,
        face_verified_at TIMESTAMPTZ
      )
    ), saved AS (
      INSERT INTO users (
        user_id, display_name, password_hash, role, has_voted,
        email, whatsapp, study_program, cohort, graduation_year, domicile,
        face_verified_at, registration_source
      )
      SELECT
        user_id, display_name, password_hash, 'Alumni', FALSE,
        email, whatsapp, study_program, cohort, graduation_year, domicile,
        face_verified_at,
        CASE WHEN update_password THEN 'ExcelLegacy' ELSE 'ExcelBackup' END
      FROM imported
      ON CONFLICT (user_id) DO UPDATE SET
        display_name = EXCLUDED.display_name,
        password_hash = CASE
          WHEN EXCLUDED.registration_source = 'ExcelLegacy'
            THEN EXCLUDED.password_hash
          ELSE users.password_hash
        END,
        email = COALESCE(EXCLUDED.email, users.email),
        whatsapp = COALESCE(EXCLUDED.whatsapp, users.whatsapp),
        study_program = COALESCE(EXCLUDED.study_program, users.study_program),
        cohort = COALESCE(EXCLUDED.cohort, users.cohort),
        graduation_year = COALESCE(EXCLUDED.graduation_year, users.graduation_year),
        domicile = COALESCE(EXCLUDED.domicile, users.domicile),
        face_verified_at = COALESCE(EXCLUDED.face_verified_at, users.face_verified_at),
        updated_at = NOW()
      RETURNING id, user_id
    ), template_rows AS (
      SELECT
        saved.id AS user_id,
        template."templateRole" AS template_role,
        template."descriptorEngine" AS engine,
        template."modelVersion" AS model_version,
        template."sourceDeviceClass" AS source_device_class,
        template."templateEncrypted" AS template_encrypted,
        template."qualityScore" AS quality_score,
        template."enrolledAt" AS enrolled_at,
        template."lastVerifiedAt" AS last_verified_at
      FROM saved
      JOIN imported ON imported.user_id = saved.user_id
      CROSS JOIN LATERAL jsonb_to_recordset(COALESCE(imported.face_templates, '[]'::jsonb)) AS template(
        "templateRole" TEXT,
        "descriptorEngine" TEXT,
        "modelVersion" TEXT,
        "sourceDeviceClass" TEXT,
        "templateEncrypted" TEXT,
        "qualityScore" NUMERIC,
        "enrolledAt" TIMESTAMPTZ,
        "lastVerifiedAt" TIMESTAMPTZ
      )
    ), saved_templates AS (
      INSERT INTO user_face_templates (
        user_id, template_role, engine, model_version, descriptor_length,
        template_encrypted, source_device_class, quality_score, enrolled_at, last_verified_at
      )
      SELECT
        user_id, template_role, engine, model_version, 1024,
        template_encrypted, source_device_class, quality_score,
        COALESCE(enrolled_at, NOW()), last_verified_at
      FROM template_rows
      ON CONFLICT (user_id, template_role) WHERE revoked_at IS NULL
      DO UPDATE SET
        engine = EXCLUDED.engine,
        model_version = EXCLUDED.model_version,
        descriptor_length = EXCLUDED.descriptor_length,
        template_encrypted = EXCLUDED.template_encrypted,
        source_device_class = EXCLUDED.source_device_class,
        quality_score = EXCLUDED.quality_score,
        enrolled_at = EXCLUDED.enrolled_at,
        last_verified_at = EXCLUDED.last_verified_at
      RETURNING id
    ), logged AS (
      INSERT INTO admin_audit_log (actor_id, actor_user_id, actor_name, action, details)
      VALUES (
        ${actor.id}, ${actor.userId}, ${actor.displayName}, 'pemilih.impor',
        jsonb_build_object('format', ${format}::text, 'jumlahAkun', (SELECT COUNT(*) FROM saved))
      )
      RETURNING id
    )
    SELECT COUNT(*)::int AS count FROM saved
  `;
  return Number(rows[0]?.count ?? 0);
}

export async function createPublicVoter(data: {
  userId: string;
  displayName: string;
  passwordHash: string;
  email: string;
  whatsapp: string;
  studyProgram: string;
  cohort: string;
  graduationYear: string | null;
  domicile: string | null;
  faceTemplates: StoredFaceTemplateInput[];
}) {
  const sql = getSql();
  const templates = JSON.stringify(data.faceTemplates);
  const rows = await sql`
    WITH saved_user AS (
      INSERT INTO users (
        user_id, password_hash, display_name, role, has_voted,
        email, whatsapp, study_program, cohort, graduation_year, domicile,
        face_verified_at, registration_source
      ) VALUES (
        ${data.userId}, ${data.passwordHash}, ${data.displayName}, 'Alumni', FALSE,
        ${data.email}, ${data.whatsapp}, ${data.studyProgram}, ${data.cohort},
        ${data.graduationYear}, ${data.domicile}, NULL, 'PublicRegistration'
      )
      RETURNING id
    ), saved_templates AS (
      INSERT INTO user_face_templates (
        user_id, template_role, engine, model_version, descriptor_length,
        template_encrypted, source_device_class, quality_score
      )
      SELECT
        saved_user.id, template."templateRole", template."descriptorEngine",
        template."modelVersion", 1024, template."templateEncrypted",
        template."sourceDeviceClass", template."qualityScore"
      FROM saved_user
      CROSS JOIN LATERAL jsonb_to_recordset(${templates}::jsonb) AS template(
        "templateRole" TEXT,
        "descriptorEngine" TEXT,
        "modelVersion" TEXT,
        "sourceDeviceClass" TEXT,
        "templateEncrypted" TEXT,
        "qualityScore" NUMERIC
      )
      RETURNING id
    )
    SELECT id::int AS id FROM saved_user
  `;
  return rows[0] as { id: number };
}

export async function getFaceTemplateAvailability(userId: number) {
  const sql = getSql();
  const rows = await sql`
    SELECT
      EXISTS (
        SELECT 1 FROM user_face_templates
        WHERE user_id = ${userId} AND template_role = 'desktop-primary' AND revoked_at IS NULL
      ) AS "desktopPrimaryEnrolled",
      EXISTS (
        SELECT 1 FROM user_face_templates
        WHERE user_id = ${userId} AND template_role = 'mobile-primary' AND revoked_at IS NULL
      ) AS "mobilePrimaryEnrolled",
      EXISTS (
        SELECT 1 FROM user_face_templates
        WHERE user_id = ${userId} AND template_role = 'canonical-cross-device' AND revoked_at IS NULL
      ) AS "canonicalEnrolled"
  `;
  return rows[0] as {
    desktopPrimaryEnrolled: boolean;
    mobilePrimaryEnrolled: boolean;
    canonicalEnrolled: boolean;
  };
}

export async function getFaceVerificationRecord(
  userId: number,
  templateRole: FaceTemplateRole,
  descriptorEngine: FaceDescriptorEngine
) {
  const sql = getSql();
  const rows = await sql`
    SELECT
      template_encrypted AS "templateEncrypted",
      model_version AS "modelVersion",
      source_device_class AS "sourceDeviceClass",
      enrolled_at::text AS "enrolledAt",
      last_verified_at::text AS "lastVerifiedAt"
    FROM user_face_templates
    WHERE user_id = ${userId}
      AND template_role = ${templateRole}
      AND engine = ${descriptorEngine}
      AND revoked_at IS NULL
    LIMIT 1
  `;
  return (rows[0] ?? null) as
    | {
        templateEncrypted: string;
        modelVersion: string;
        sourceDeviceClass: FaceDeviceClass;
        enrolledAt: string;
        lastVerifiedAt: string | null;
      }
    | null;
}

export async function saveFaceTemplate(userId: number, data: StoredFaceTemplateInput) {
  const sql = getSql();
  const rows = await sql`
    INSERT INTO user_face_templates (
      user_id, template_role, engine, model_version, descriptor_length,
      template_encrypted, source_device_class, quality_score
    )
    SELECT
      id, ${data.templateRole}, ${data.descriptorEngine}, ${data.modelVersion}, 1024,
      ${data.templateEncrypted}, ${data.sourceDeviceClass}, ${data.qualityScore}
    FROM users
    WHERE id = ${userId}
      AND NOT EXISTS (
        SELECT 1 FROM user_face_templates ft
        WHERE ft.user_id = users.id
          AND ft.template_role = ${data.templateRole}
          AND ft.revoked_at IS NULL
      )
    RETURNING id
  `;
  return rows.length === 1;
}

export async function markFaceVerified(userId: number, templateRole: FaceTemplateRole) {
  const sql = getSql();
  const rows = await sql`
    WITH verified_template AS (
      UPDATE user_face_templates
      SET last_verified_at = NOW(), updated_at = NOW()
      WHERE user_id = ${userId}
        AND template_role = ${templateRole}
        AND revoked_at IS NULL
      RETURNING user_id
    )
    UPDATE users
    SET face_verified_at = NOW(), face_failed_attempts = 0, face_locked_until = NULL, updated_at = NOW()
    WHERE id = ${userId}
      AND EXISTS (SELECT 1 FROM verified_template)
    RETURNING id
  `;
  return rows.length === 1;
}

export async function resetUserFaceTemplates(userId: number, actor: AuditActor) {
  const sql = getSql();
  const rows = await sql`
    WITH reset_templates AS (
      UPDATE user_face_templates
      SET revoked_at = NOW(), updated_at = NOW()
      WHERE user_id = ${userId} AND revoked_at IS NULL
      RETURNING user_id
    ), reset_user AS (
      UPDATE users
      SET face_verified_at = NULL, face_failed_attempts = 0, face_locked_until = NULL, updated_at = NOW()
      WHERE id = ${userId}
        AND EXISTS (SELECT 1 FROM reset_templates)
      RETURNING id, user_id, display_name
    ), logged AS (
      INSERT INTO admin_audit_log (actor_id, actor_user_id, actor_name, action, target_type, target_id, target_label, details)
      SELECT ${actor.id}, ${actor.userId}, ${actor.displayName}, 'wajah.reset', 'user', id,
        user_id || ' - ' || display_name,
        jsonb_build_object('templateDicabut', (SELECT COUNT(*) FROM reset_templates))
      FROM reset_user
      RETURNING id
    )
    SELECT id FROM reset_user
  `;
  return rows.length === 1;
}

export async function createCandidate(data: Omit<Candidate, "id" | "votes">, actor: AuditActor) {
  const sql = getSql();
  const rows = await sql`
    WITH created AS (
      INSERT INTO candidates (
        name, vision, mission, featured_program, image, occupation, cohort, votes
      ) VALUES (
        ${data.name}, ${data.vision}, ${data.mission}, ${data.featuredProgram},
        ${data.image}, ${data.occupation}, ${data.cohort}, 0
      )
      RETURNING id, name
    ), logged AS (
      INSERT INTO admin_audit_log (actor_id, actor_user_id, actor_name, action, target_type, target_id, target_label, details)
      SELECT ${actor.id}, ${actor.userId}, ${actor.displayName}, 'kandidat.tambah', 'candidate', id, name, '{}'::jsonb
      FROM created
      RETURNING id
    )
    SELECT id FROM created
  `;
  return rows[0] as { id: number };
}

export async function getAdminStats(): Promise<AdminStats> {
  const sql = getSql();
  const rows = await sql`
    SELECT
      (SELECT COUNT(*)::int FROM users) AS users,
      (SELECT COUNT(*)::int FROM users WHERE role = 'Alumni') AS voters,
      (SELECT COUNT(*)::int FROM users WHERE role = 'Alumni' AND has_voted = TRUE) AS voted,
      (SELECT COUNT(*)::int FROM candidates) AS candidates,
      (SELECT COALESCE(SUM(votes), 0)::int FROM candidates) AS "totalVotes"
  `;
  return rows[0] as AdminStats;
}

export async function getAdminUsers(): Promise<AdminUserRecord[]> {
  const sql = getSql();
  const rows = await sql`
    SELECT
      u.id::int AS id,
      u.user_id AS "userId",
      u.display_name AS "displayName",
      u.role,
      u.has_voted AS "hasVoted"
    FROM users u
    ORDER BY u.created_at ASC
  `;
  return rows as AdminUserRecord[];
}

export async function getAdminUser(id: number) {
  const sql = getSql();
  const rows = await sql`
    SELECT id::int AS id, role, has_voted AS "hasVoted"
    FROM users
    WHERE id = ${id}
    LIMIT 1
  `;
  return (rows[0] ?? null) as { id: number; role: UserRole; hasVoted: boolean } | null;
}

export async function createAdminUser(
  data: {
    userId: string;
    displayName: string;
    role: UserRole;
    passwordHash: string;
  },
  actor: AuditActor
) {
  const sql = getSql();
  const rows = await sql`
    WITH created AS (
      INSERT INTO users (user_id, display_name, role, password_hash, has_voted)
      VALUES (${data.userId}, ${data.displayName}, ${data.role}, ${data.passwordHash}, FALSE)
      RETURNING id, user_id, display_name, role
    ), logged AS (
      INSERT INTO admin_audit_log (actor_id, actor_user_id, actor_name, action, target_type, target_id, target_label, details)
      SELECT ${actor.id}, ${actor.userId}, ${actor.displayName}, 'akun.tambah', 'user', id,
        user_id || ' - ' || display_name, jsonb_build_object('role', role)
      FROM created
      RETURNING id
    )
    SELECT id::int AS id FROM created
  `;
  return rows[0] as { id: number };
}

export async function updateAdminUser(
  id: number,
  data: { userId: string; displayName: string; role: UserRole; passwordHash: string | null },
  actor: AuditActor
) {
  const sql = getSql();
  const rows = await sql`
    WITH previous AS (
      SELECT id, user_id, display_name, role FROM users WHERE id = ${id}
    ), updated AS (
      UPDATE users
      SET
        user_id = ${data.userId},
        display_name = ${data.displayName},
        role = ${data.role},
        password_hash = COALESCE(${data.passwordHash}, password_hash),
        updated_at = NOW()
      WHERE id = ${id}
      RETURNING id, user_id, display_name, role
    ), logged AS (
      INSERT INTO admin_audit_log (actor_id, actor_user_id, actor_name, action, target_type, target_id, target_label, details)
      SELECT ${actor.id}, ${actor.userId}, ${actor.displayName}, 'akun.ubah', 'user', u.id,
        u.user_id || ' - ' || u.display_name,
        jsonb_strip_nulls(jsonb_build_object(
          'userIdSebelum', CASE WHEN p.user_id <> u.user_id THEN p.user_id END,
          'namaSebelum', CASE WHEN p.display_name <> u.display_name THEN p.display_name END,
          'roleSebelum', CASE WHEN p.role <> u.role THEN p.role END,
          'roleSesudah', CASE WHEN p.role <> u.role THEN u.role END,
          'passwordDiubah', ${data.passwordHash !== null}::boolean
        ))
      FROM updated u
      JOIN previous p ON p.id = u.id
      RETURNING id
    )
    SELECT id FROM updated
  `;
  return rows.length === 1;
}

export async function updateVoterAccount(
  id: number,
  data: { displayName: string; passwordHash: string | null }
) {
  const sql = getSql();
  const rows = await sql`
    UPDATE users
    SET
      display_name = ${data.displayName},
      password_hash = COALESCE(${data.passwordHash}, password_hash),
      updated_at = NOW()
    WHERE id = ${id}
    RETURNING id
  `;
  return rows.length === 1;
}

// Akun yang sudah memilih tidak dapat dihapus agar jumlah suara dan DPT tetap dapat direkonsiliasi.
export async function deleteAdminUser(id: number, actor: AuditActor): Promise<"deleted" | "voted" | "missing"> {
  const sql = getSql();
  const rows = await sql`
    WITH removed AS (
      DELETE FROM users
      WHERE id = ${id} AND has_voted = FALSE
      RETURNING id, user_id, display_name, role
    ), logged AS (
      INSERT INTO admin_audit_log (actor_id, actor_user_id, actor_name, action, target_type, target_id, target_label, details)
      SELECT ${actor.id}, ${actor.userId}, ${actor.displayName}, 'akun.hapus', 'user', id,
        user_id || ' - ' || display_name, jsonb_build_object('role', role)
      FROM removed
      RETURNING id
    )
    SELECT
      (SELECT COUNT(*)::int FROM removed) AS deleted,
      (SELECT has_voted FROM users WHERE id = ${id}) AS "hasVoted"
  `;
  const result = rows[0] as { deleted: number; hasVoted: boolean | null } | undefined;
  if (result?.deleted === 1) return "deleted";
  return result?.hasVoted ? "voted" : "missing";
}

export async function updateCandidate(
  id: number,
  data: Omit<Candidate, "id" | "votes" | "image"> & { image: string | null },
  actor: AuditActor
) {
  const sql = getSql();
  const rows = await sql`
    WITH previous AS (
      SELECT id, name FROM candidates WHERE id = ${id}
    ), updated AS (
      UPDATE candidates
      SET
        name = ${data.name},
        vision = ${data.vision},
        mission = ${data.mission},
        featured_program = ${data.featuredProgram},
        image = COALESCE(${data.image}, image),
        occupation = ${data.occupation},
        cohort = ${data.cohort},
        updated_at = NOW()
      WHERE id = ${id}
      RETURNING id, name
    ), logged AS (
      INSERT INTO admin_audit_log (actor_id, actor_user_id, actor_name, action, target_type, target_id, target_label, details)
      SELECT ${actor.id}, ${actor.userId}, ${actor.displayName}, 'kandidat.ubah', 'candidate', u.id, u.name,
        jsonb_strip_nulls(jsonb_build_object(
          'namaSebelum', CASE WHEN p.name <> u.name THEN p.name END,
          'fotoDiganti', ${data.image !== null}::boolean
        ))
      FROM updated u
      JOIN previous p ON p.id = u.id
      RETURNING id
    )
    SELECT id FROM updated
  `;
  return rows.length === 1;
}

export async function deleteCandidate(id: number, actor: AuditActor) {
  const sql = getSql();
  const rows = await sql`
    WITH removed AS (
      DELETE FROM candidates c
      WHERE c.id = ${id}
        AND c.votes = 0
        AND NOT EXISTS (SELECT 1 FROM ballots b WHERE b.candidate_id = c.id)
      RETURNING id, name
    ), logged AS (
      INSERT INTO admin_audit_log (actor_id, actor_user_id, actor_name, action, target_type, target_id, target_label, details)
      SELECT ${actor.id}, ${actor.userId}, ${actor.displayName}, 'kandidat.hapus', 'candidate', id, name, '{}'::jsonb
      FROM removed
      RETURNING id
    )
    SELECT id FROM removed
  `;
  return rows.length === 1;
}

// Untuk aksi admin yang tidak mengubah data (login, ekspor).
export async function logAdminAction(
  actor: AuditActor,
  action: string,
  details: Record<string, string | number | boolean> = {}
) {
  const sql = getSql();
  await sql`
    INSERT INTO admin_audit_log (actor_id, actor_user_id, actor_name, action, details)
    VALUES (${actor.id}, ${actor.userId}, ${actor.displayName}, ${action}, ${JSON.stringify(details)}::jsonb)
  `;
}

export async function getAuditLog(limit = 300): Promise<AuditLogEntry[]> {
  const sql = getSql();
  const rows = await sql`
    SELECT
      id::int AS id,
      actor_user_id AS "actorUserId",
      actor_name AS "actorName",
      action,
      target_type AS "targetType",
      target_label AS "targetLabel",
      details,
      created_at::text AS "createdAt"
    FROM admin_audit_log
    ORDER BY id DESC
    LIMIT ${limit}
  `;
  return rows as AuditLogEntry[];
}

// Rekonsiliasi: jumlah surat suara anonim per kandidat harus sama dengan penghitung suara kandidat,
// dan jumlah pemilih yang sudah memilih harus sama dengan jumlah surat suara.
export async function getVoteIntegrity(): Promise<VoteIntegrity> {
  const sql = getSql();
  const [candidates, totals] = await Promise.all([
    sql`
      SELECT
        c.id::int AS id,
        c.name,
        c.votes::int AS votes,
        (SELECT COUNT(*)::int FROM ballots b WHERE b.candidate_id = c.id) AS ballots
      FROM candidates c
      ORDER BY c.id ASC
    `,
    sql`
      SELECT
        (SELECT COUNT(*)::int FROM ballots) AS ballots,
        (SELECT COUNT(*)::int FROM users WHERE has_voted = TRUE) AS "votedUsers"
    `
  ]);
  const total = totals[0] as { ballots: number; votedUsers: number };
  const rows = candidates as VoteIntegrity["candidates"];
  return {
    candidates: rows,
    ballots: total.ballots,
    votedUsers: total.votedUsers,
    consistent: total.ballots === total.votedUsers && rows.every((row) => row.votes === row.ballots)
  };
}

// ---------- K5b: kunci sementara verifikasi wajah setelah beberapa kali gagal

export async function getFaceLock(userId: number) {
  const sql = getSql();
  const rows = await sql`
    SELECT face_locked_until::text AS "lockedUntil"
    FROM users
    WHERE id = ${userId} AND face_locked_until > NOW()
  `;
  return (rows[0]?.lockedUntil as string | undefined) ?? null;
}

// Menambah penghitung gagal secara atomik; pada batas maksimum akun dikunci dan dicatat.
export async function recordFaceFailure(userId: number, maxAttempts: number, lockMinutes: number) {
  const sql = getSql();
  const rows = await sql`
    WITH updated AS (
      UPDATE users
      SET
        face_failed_attempts = CASE WHEN face_failed_attempts + 1 >= ${maxAttempts}::int THEN 0 ELSE face_failed_attempts + 1 END,
        face_locked_until = CASE
          WHEN face_failed_attempts + 1 >= ${maxAttempts}::int THEN NOW() + make_interval(mins => ${lockMinutes}::int)
          ELSE face_locked_until
        END
      WHERE id = ${userId}
      RETURNING id, user_id, display_name, face_failed_attempts, face_locked_until
    ), logged AS (
      INSERT INTO security_events (event, user_id, user_label, details)
      SELECT 'wajah.dikunci', id, user_id || ' - ' || display_name,
        jsonb_build_object('percobaanGagal', ${maxAttempts}::int, 'menit', ${lockMinutes}::int)
      FROM updated
      WHERE face_locked_until > NOW()
      RETURNING id
    )
    SELECT face_failed_attempts AS "failedAttempts", face_locked_until > NOW() AS locked
    FROM updated
  `;
  return (rows[0] ?? { failedAttempts: 0, locked: false }) as { failedAttempts: number; locked: boolean };
}

// ---------- K6b: cek wajah ganda

export async function getArcFaceTemplatesForDuplicateCheck(modelVersion: string, excludeUserId: number | null) {
  const sql = getSql();
  const rows = await sql`
    SELECT ft.user_id::int AS "userId", u.user_id || ' - ' || u.display_name AS "userLabel", ft.template_encrypted AS "templateEncrypted"
    FROM user_face_templates ft
    JOIN users u ON u.id = ft.user_id
    WHERE ft.revoked_at IS NULL
      AND ft.model_version = ${modelVersion}
      AND (${excludeUserId}::bigint IS NULL OR ft.user_id <> ${excludeUserId}::bigint)
  `;
  return rows as Array<{ userId: number; userLabel: string; templateEncrypted: string }>;
}

export async function recordSecurityEvent(
  event: string,
  user: { id: number | null; label: string | null },
  details: Record<string, string | number | boolean> = {}
) {
  const sql = getSql();
  await sql`
    INSERT INTO security_events (event, user_id, user_label, details)
    VALUES (${event}, ${user.id}, ${user.label}, ${JSON.stringify(details)}::jsonb)
  `;
}

export async function getSecurityEvents(limit = 200): Promise<SecurityEventEntry[]> {
  const sql = getSql();
  const rows = await sql`
    SELECT id::int AS id, event, user_label AS "userLabel", details, created_at::text AS "createdAt"
    FROM security_events
    ORDER BY id DESC
    LIMIT ${limit}
  `;
  return rows as SecurityEventEntry[];
}

// ---------- K6a: DPT resmi untuk mencocokkan pendaftaran mandiri

export async function getOfficialDptStatus() {
  const sql = getSql();
  const rows = await sql`
    SELECT COUNT(*)::int AS total, MAX(imported_at)::text AS "importedAt" FROM dpt_resmi
  `;
  return rows[0] as { total: number; importedAt: string | null };
}

export async function findOfficialDpt(nim: string) {
  const sql = getSql();
  const rows = await sql`SELECT nim, nama FROM dpt_resmi WHERE nim = ${nim} LIMIT 1`;
  return (rows[0] ?? null) as { nim: string; nama: string } | null;
}

// Mengganti seluruh daftar DPT resmi dalam satu transaksi dan mencatatnya di log audit.
export async function replaceOfficialDpt(entries: Array<{ nim: string; nama: string }>, actor: AuditActor) {
  const sql = getSql();
  const payload = JSON.stringify(entries);
  await sql.transaction([
    sql`DELETE FROM dpt_resmi`,
    sql`
      INSERT INTO dpt_resmi (nim, nama)
      SELECT nim, nama FROM jsonb_to_recordset(${payload}::jsonb) AS d(nim TEXT, nama TEXT)
    `,
    sql`
      INSERT INTO admin_audit_log (actor_id, actor_user_id, actor_name, action, details)
      VALUES (${actor.id}, ${actor.userId}, ${actor.displayName}, 'dpt.impor',
        jsonb_build_object('jumlahNim', ${entries.length}::int))
    `
  ]);
  return entries.length;
}

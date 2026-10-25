import { neon } from "@neondatabase/serverless";
import type { ElectionSettings } from "@/lib/election";
import type { FaceDescriptorEngine, FaceDeviceClass, FaceTemplateRole } from "@/lib/face-types";
import type {
  AdminStats,
  AdminUserRecord,
  Candidate,
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

// Beberapa User ID sekaligus: login menerima penulisan kode yang setara (lihat lib/login-code.ts).
export async function findUsersByLogin(userIds: string[]) {
  const sql = getSql();
  const rows = await sql`
    SELECT
      id::int AS id,
      user_id AS "userId",
      password_hash AS "passwordHash",
      display_name AS "displayName",
      role,
      has_voted AS "hasVoted",
      login_failed_attempts AS "loginFailedAttempts",
      CASE WHEN login_locked_until > NOW() THEN to_json(login_locked_until) #>> '{}' END AS "loginLockedUntil",
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
    WHERE user_id = ANY(${userIds}::text[])
  `;
  return rows as LoginAccount[];
}

export type LoginAccount = {
  id: number;
  userId: string;
  passwordHash: string;
  displayName: string;
  role: "Alumni" | "Admin";
  hasVoted: boolean;
  loginFailedAttempts: number;
  loginLockedUntil: string | null;
  faceEnrolled: boolean;
  faceVerified: boolean;
  desktopPrimaryEnrolled: boolean;
  mobilePrimaryEnrolled: boolean;
  canonicalEnrolled: boolean;
};

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
        -- T1: suara hanya diterima selama pemungutan suara berlangsung (jam database).
        AND EXISTS (
          SELECT 1 FROM pengaturan_pemilu p
          WHERE p.id = 1
            AND p.ditutup_manual_pada IS NULL
            AND p.dibuka_pada <= NOW()
            AND (p.ditutup_pada IS NULL OR p.ditutup_pada > NOW())
        )
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
      u.nim,
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
      u.nim,
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

export async function getVotersForExport(): Promise<VoterRecord[]> {
  const sql = getSql();
  const rows = await sql`
    SELECT
      u.id,
      u.id::int AS "userRecordId",
      u.user_id AS "userId",
      u.nim,
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
    ORDER BY u.created_at ASC
  `;
  return rows as VoterRecord[];
}

// Impor akun. Akun baru memakai password awal = User ID. T5: akun yang sudah ada tidak pernah diubah
// password-nya, dan akun Admin tidak disentuh sama sekali. T3: data wajah tidak diimpor dari Excel.
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
      domicile: user.domicile
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
        domicile TEXT
      )
    ), saved AS (
      INSERT INTO users (
        user_id, display_name, password_hash, role, has_voted,
        email, whatsapp, study_program, cohort, graduation_year, domicile,
        registration_source
      )
      SELECT
        user_id, display_name, password_hash, 'Alumni', FALSE,
        email, whatsapp, study_program, cohort, graduation_year, domicile,
        CASE WHEN update_password THEN 'ExcelLegacy' ELSE 'ExcelBackup' END
      FROM imported
      ON CONFLICT (user_id) DO UPDATE SET
        display_name = EXCLUDED.display_name,
        email = COALESCE(EXCLUDED.email, users.email),
        whatsapp = COALESCE(EXCLUDED.whatsapp, users.whatsapp),
        study_program = COALESCE(EXCLUDED.study_program, users.study_program),
        cohort = COALESCE(EXCLUDED.cohort, users.cohort),
        graduation_year = COALESCE(EXCLUDED.graduation_year, users.graduation_year),
        domicile = COALESCE(EXCLUDED.domicile, users.domicile),
        updated_at = NOW()
      WHERE users.role = 'Alumni'
      RETURNING id, user_id, (xmax = 0) AS created
    ), logged AS (
      INSERT INTO admin_audit_log (actor_id, actor_user_id, actor_name, action, details)
      VALUES (
        ${actor.id}, ${actor.userId}, ${actor.displayName}, 'pemilih.impor',
        jsonb_build_object(
          'format', ${format}::text,
          'jumlahAkun', (SELECT COUNT(*) FROM saved),
          'akunBaru', (SELECT COUNT(*) FROM saved WHERE created),
          'dilewati', ${users.length}::int - (SELECT COUNT(*) FROM saved)
        )
      )
      RETURNING id
    )
    SELECT COUNT(*)::int AS saved, COUNT(*) FILTER (WHERE created)::int AS created FROM saved
  `;
  return { saved: Number(rows[0]?.saved ?? 0), created: Number(rows[0]?.created ?? 0) };
}

// Pendaftaran mandiri: NIM sudah dipakai, atau kode login (salah satu penulisannya) sudah dipakai akun lain.
export async function findRegistrationConflicts(nim: string, loginCodes: string[]) {
  const sql = getSql();
  const rows = await sql`
    SELECT
      EXISTS (SELECT 1 FROM users WHERE nim = ${nim}) AS "nimTaken",
      EXISTS (SELECT 1 FROM users WHERE user_id = ANY(${loginCodes}::text[])) AS "codeTaken"
  `;
  return rows[0] as { nimTaken: boolean; codeTaken: boolean };
}

export async function createPublicVoter(data: {
  userId: string;
  nim: string;
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
        user_id, nim, password_hash, display_name, role, has_voted,
        email, whatsapp, study_program, cohort, graduation_year, domicile,
        face_verified_at, registration_source
      ) VALUES (
        ${data.userId}, ${data.nim}, ${data.passwordHash}, ${data.displayName}, 'Alumni', FALSE,
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

// T3: template wajah yang direset langsung dihapus (bukan sekadar dicabut) agar data biometrik
// yang tidak dipakai lagi tidak tersimpan.
export async function resetUserFaceTemplates(userId: number, actor: AuditActor) {
  const sql = getSql();
  const rows = await sql`
    WITH reset_templates AS (
      DELETE FROM user_face_templates
      WHERE user_id = ${userId}
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
        jsonb_build_object('templateDihapus', (SELECT COUNT(*) FROM reset_templates))
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
        login_failed_attempts = 0,
        login_locked_until = NULL,
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

// ---------- T1: jadwal & status pemilu

const EMPTY_ELECTION: ElectionSettings = {
  opensAt: null,
  closesAt: null,
  closedManuallyAt: null
};

// Jam database ikut dikembalikan: tahap dihitung dengan jam yang sama dengan trigger dan castVote,
// sehingga selisih jam server aplikasi tidak membuat "Buka Sekarang" terlambat terbaca.
export async function getElectionSettings(): Promise<{ settings: ElectionSettings; now: number }> {
  const sql = getSql();
  const rows = await sql`
    SELECT
      to_json(p.dibuka_pada) #>> '{}' AS "opensAt",
      to_json(p.ditutup_pada) #>> '{}' AS "closesAt",
      to_json(p.ditutup_manual_pada) #>> '{}' AS "closedManuallyAt",
      (extract(epoch FROM NOW()) * 1000)::float8 AS "dbNow"
    FROM (SELECT 1) AS jam
    LEFT JOIN pengaturan_pemilu p ON p.id = 1
  `;
  // Tanpa baris pengaturan (LEFT JOIN kosong) semua kolom NULL = jadwal kosong (Persiapan).
  const { dbNow, ...row } = rows[0] as ElectionSettings & { dbNow: number };
  const settings: ElectionSettings = { ...EMPTY_ELECTION, ...row };
  return { settings, now: Number(dbNow) };
}

// Aturan perubahan (final setelah ditutup, hanya waktu tutup selama pemungutan) juga dijaga trigger.
export async function saveElectionSchedule(
  // opensAt "tetap": kolom dibuka_pada tidak ditulis (dipakai selama pemungutan suara).
  data: { opensAt: Date | null | "tetap"; closesAt: Date | null },
  actor: AuditActor
) {
  const sql = getSql();
  const rows = await sql`
    WITH previous AS (
      SELECT dibuka_pada, ditutup_pada FROM pengaturan_pemilu WHERE id = 1
    ), updated AS (
      UPDATE pengaturan_pemilu
      SET
        dibuka_pada = CASE WHEN ${data.opensAt === "tetap"}::boolean THEN dibuka_pada
          ELSE ${data.opensAt === "tetap" ? null : data.opensAt?.toISOString() ?? null}::timestamptz END,
        ditutup_pada = ${data.closesAt?.toISOString() ?? null}::timestamptz
      WHERE id = 1
      RETURNING dibuka_pada, ditutup_pada
    ), logged AS (
      INSERT INTO admin_audit_log (actor_id, actor_user_id, actor_name, action, target_type, target_label, details)
      SELECT ${actor.id}, ${actor.userId}, ${actor.displayName}, 'pemilu.jadwal', 'pemilu', 'Jadwal pemilu',
        jsonb_strip_nulls(jsonb_build_object(
          'dibuka', to_char(u.dibuka_pada AT TIME ZONE 'Asia/Jakarta', 'DD-MM-YYYY HH24:MI') || ' WIB',
          'ditutup', to_char(u.ditutup_pada AT TIME ZONE 'Asia/Jakarta', 'DD-MM-YYYY HH24:MI') || ' WIB',
          'ditutupSebelum', to_char(p.ditutup_pada AT TIME ZONE 'Asia/Jakarta', 'DD-MM-YYYY HH24:MI') || ' WIB'
        ))
      FROM updated u
      CROSS JOIN previous p
      RETURNING id
    )
    SELECT 1 AS ok FROM updated
  `;
  return rows.length === 1;
}

export async function openElectionNow(actor: AuditActor) {
  const sql = getSql();
  const rows = await sql`
    WITH updated AS (
      UPDATE pengaturan_pemilu
      SET dibuka_pada = NOW()
      WHERE id = 1
        AND ditutup_manual_pada IS NULL
        AND (dibuka_pada IS NULL OR dibuka_pada > NOW())
      RETURNING id
    ), logged AS (
      INSERT INTO admin_audit_log (actor_id, actor_user_id, actor_name, action, target_type, target_label, details)
      SELECT ${actor.id}, ${actor.userId}, ${actor.displayName}, 'pemilu.buka', 'pemilu', 'Pemungutan suara', '{}'::jsonb
      FROM updated
      RETURNING id
    )
    SELECT id FROM updated
  `;
  return rows.length === 1;
}

// v10.5: kembali ke Persiapan (jadwal dikosongkan) hanya selama belum ada suara; trigger
// ika_jaga_pengaturan_pemilu menegakkan syarat yang sama di database.
export async function resetElectionToPreparation(actor: AuditActor) {
  const sql = getSql();
  const rows = await sql`
    WITH updated AS (
      UPDATE pengaturan_pemilu
      SET dibuka_pada = NULL, ditutup_pada = NULL, ditutup_manual_pada = NULL
      WHERE id = 1
        AND (dibuka_pada IS NOT NULL OR ditutup_manual_pada IS NOT NULL)
        AND NOT EXISTS (SELECT 1 FROM ballots)
        AND NOT EXISTS (SELECT 1 FROM users WHERE has_voted)
      RETURNING id
    ), logged AS (
      INSERT INTO admin_audit_log (actor_id, actor_user_id, actor_name, action, target_type, target_label, details)
      SELECT ${actor.id}, ${actor.userId}, ${actor.displayName}, 'pemilu.reset', 'pemilu', 'Pemungutan suara',
        jsonb_build_object('suratSuara', 0)
      FROM updated
      RETURNING id
    )
    SELECT id FROM updated
  `;
  return rows.length === 1;
}

export async function countBallots() {
  const sql = getSql();
  const rows = await sql`SELECT COUNT(*)::int AS total FROM ballots`;
  return Number(rows[0]?.total ?? 0);
}

// Penutupan manual bersifat final.
export async function closeElectionNow(actor: AuditActor) {
  const sql = getSql();
  const rows = await sql`
    WITH updated AS (
      UPDATE pengaturan_pemilu
      SET ditutup_manual_pada = NOW()
      WHERE id = 1
        AND ditutup_manual_pada IS NULL
        AND dibuka_pada <= NOW()
        AND (ditutup_pada IS NULL OR ditutup_pada > NOW())
      RETURNING id
    ), logged AS (
      INSERT INTO admin_audit_log (actor_id, actor_user_id, actor_name, action, target_type, target_label, details)
      SELECT ${actor.id}, ${actor.userId}, ${actor.displayName}, 'pemilu.tutup', 'pemilu', 'Pemungutan suara',
        jsonb_build_object('suratSuara', (SELECT COUNT(*) FROM ballots))
      FROM updated
      RETURNING id
    )
    SELECT id FROM updated
  `;
  return rows.length === 1;
}

// ---------- T4: pembatasan percobaan login

// Gagal login per akun (atomik). Pada batas maksimum akun dikunci sementara dan dicatat di
// security_events. Mengembalikan waktu kunci bila akun baru saja dikunci.
export async function recordAccountLoginFailure(userId: number, maxAttempts: number, lockMinutes: number) {
  const sql = getSql();
  const rows = await sql`
    WITH updated AS (
      UPDATE users
      SET
        login_failed_attempts = CASE WHEN login_failed_attempts + 1 >= ${maxAttempts}::int THEN 0 ELSE login_failed_attempts + 1 END,
        login_locked_until = CASE
          WHEN login_failed_attempts + 1 >= ${maxAttempts}::int THEN NOW() + make_interval(mins => ${lockMinutes}::int)
          ELSE login_locked_until
        END
      WHERE id = ${userId}
      RETURNING id, user_id, display_name, login_locked_until
    ), logged AS (
      INSERT INTO security_events (event, user_id, user_label, details)
      SELECT 'login.akun_dikunci', id, user_id || ' - ' || display_name,
        jsonb_build_object('percobaanGagal', ${maxAttempts}::int, 'menit', ${lockMinutes}::int)
      FROM updated
      WHERE login_locked_until > NOW()
      RETURNING id
    )
    SELECT CASE WHEN login_locked_until > NOW() THEN to_json(login_locked_until) #>> '{}' END AS "lockedUntil" FROM updated
  `;
  return (rows[0]?.lockedUntil as string | null | undefined) ?? null;
}

export async function clearAccountLoginFailures(userId: number) {
  const sql = getSql();
  await sql`
    UPDATE users
    SET login_failed_attempts = 0, login_locked_until = NULL
    WHERE id = ${userId}
  `;
}

// Gagal per jaringan (kunci = HMAC alamat IP, bukan IP mentah) dalam satu jendela waktu.
export async function getLoginThrottle(key: string, windowMinutes: number) {
  const sql = getSql();
  const rows = await sql`
    SELECT failures, to_json(window_start + make_interval(mins => ${windowMinutes}::int)) #>> '{}' AS "resetsAt"
    FROM login_throttle
    WHERE key = ${key} AND window_start > NOW() - make_interval(mins => ${windowMinutes}::int)
  `;
  return (rows[0] ?? null) as { failures: number; resetsAt: string } | null;
}

export async function recordLoginThrottleFailure(key: string, scope: string, limit: number, windowMinutes: number) {
  const sql = getSql();
  await sql.transaction([
    sql`DELETE FROM login_throttle WHERE window_start < NOW() - interval '1 day'`,
    sql`
      WITH counted AS (
        INSERT INTO login_throttle (key, failures, window_start)
        VALUES (${key}, 1, NOW())
        ON CONFLICT (key) DO UPDATE SET
          failures = CASE
            WHEN login_throttle.window_start <= NOW() - make_interval(mins => ${windowMinutes}::int) THEN 1
            ELSE login_throttle.failures + 1
          END,
          window_start = CASE
            WHEN login_throttle.window_start <= NOW() - make_interval(mins => ${windowMinutes}::int) THEN NOW()
            ELSE login_throttle.window_start
          END
        RETURNING failures
      )
      INSERT INTO security_events (event, user_label, details)
      SELECT ${`${scope}.jaringan_dibatasi`}, ${`Jaringan ${key.slice(-8)}`},
        jsonb_build_object('percobaanGagal', failures, 'menit', ${windowMinutes}::int)
      FROM counted
      WHERE failures = ${limit}::int
    `
  ]);
}

// ---------- T3: retensi data wajah setelah pemilu

export async function countFaceTemplates() {
  const sql = getSql();
  const rows = await sql`SELECT COUNT(*)::int AS total FROM user_face_templates`;
  return Number(rows[0]?.total ?? 0);
}

// Menghapus seluruh template wajah (hanya dipanggil setelah pemungutan suara ditutup) dan
// mencatatnya di log audit dalam statement yang sama.
export async function deleteAllFaceTemplates(actor: AuditActor) {
  const sql = getSql();
  const rows = await sql`
    WITH removed AS (
      DELETE FROM user_face_templates RETURNING user_id
    ), logged AS (
      INSERT INTO admin_audit_log (actor_id, actor_user_id, actor_name, action, target_type, target_label, details)
      VALUES (
        ${actor.id}, ${actor.userId}, ${actor.displayName}, 'wajah.hapus_semua', 'pemilu', 'Retensi data wajah',
        jsonb_build_object('templateDihapus', (SELECT COUNT(*) FROM removed), 'akun', (SELECT COUNT(DISTINCT user_id) FROM removed))
      )
      RETURNING id
    )
    SELECT COUNT(*)::int AS total FROM removed
  `;
  return Number(rows[0]?.total ?? 0);
}

// ---------- T6: penggantian password admin lemah saat login

export async function replaceWeakAdminPassword(userId: number, passwordHash: string) {
  const sql = getSql();
  const rows = await sql`
    WITH updated AS (
      UPDATE users
      SET password_hash = ${passwordHash}, login_failed_attempts = 0, login_locked_until = NULL, updated_at = NOW()
      WHERE id = ${userId} AND role = 'Admin'
      RETURNING id, user_id, display_name
    ), logged AS (
      INSERT INTO admin_audit_log (actor_id, actor_user_id, actor_name, action, target_type, target_id, target_label, details)
      SELECT id, user_id, display_name, 'admin.ganti_password', 'user', id, user_id || ' - ' || display_name,
        jsonb_build_object('alasan', 'password lama tidak memenuhi aturan')
      FROM updated
      RETURNING id
    )
    SELECT id FROM updated
  `;
  return rows.length === 1;
}

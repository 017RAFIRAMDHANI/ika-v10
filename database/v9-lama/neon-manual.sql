-- ================================================================
-- PORTAL PEMILIHAN KETUA IKA V4 - DATABASE NEON BARU
-- Jalankan seluruh file ini hanya pada project/database V4 yang baru.
-- Jangan jalankan pada database V3 produksi.
-- ================================================================

BEGIN;

-- Digunakan untuk membuat hash bcrypt akun admin langsung di PostgreSQL.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

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

-- Kolom biodata V4. ALTER berikut membuat setup tetap idempotent pada database V4.
ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(320);
ALTER TABLE users ADD COLUMN IF NOT EXISTS whatsapp VARCHAR(32);
ALTER TABLE users ADD COLUMN IF NOT EXISTS study_program VARCHAR(64);
ALTER TABLE users ADD COLUMN IF NOT EXISTS cohort VARCHAR(4);
ALTER TABLE users ADD COLUMN IF NOT EXISTS graduation_year VARCHAR(4);
ALTER TABLE users ADD COLUMN IF NOT EXISTS domicile VARCHAR(160);
ALTER TABLE users ADD COLUMN IF NOT EXISTS face_verified_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS registration_source VARCHAR(32) NOT NULL DEFAULT 'Admin';

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

CREATE UNIQUE INDEX IF NOT EXISTS uq_candidates_name ON candidates(name);
CREATE INDEX IF NOT EXISTS idx_voters_user_id ON voters(user_id);
CREATE INDEX IF NOT EXISTS idx_voters_candidate_id ON voters(candidate_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_email_ci
  ON users (LOWER(email)) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_face_templates_user_id
  ON user_face_templates(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_face_templates_active_role
  ON user_face_templates(user_id, template_role) WHERE revoked_at IS NULL;

-- ================================================================
-- DATA TIGA KANDIDAT DARI SEEDER LARAVEL ASLI
-- ON CONFLICT memperbarui profil tanpa mengubah jumlah suara.
-- ================================================================

INSERT INTO candidates (
  name, vision, mission, featured_program, image, occupation, cohort, votes
)
VALUES
(
  'R. Hery Herdiana, SIP, MM.',
  '/storage/img/visi.png',
  '/storage/img/misi.png',
  '/storage/img/programunggulan.png',
  '/storage/img/calon2.jpg',
  'CEO/President Director PT. Yoksa Digital Indonesia',
  '1989',
  0
),
(
  'Riky Rinaldy Maulana, S.IP., M.AP.',
  $seed$"MEWUJUDKAN IKATAN ALUMNI YANG SOLID, INKLUSIF, DAN BERDAYA SAING MELALUI SILATURAHMI YANG TERJAGA DAN KOLABORASI YANG KONSTRUKTIF, UNTUK MENDUKUNG KEMAJUAN BERSAMA DAN BERKONTRIBUSI BAGI KEMAJUAN ALMAMATER."$seed$,
  $seed$1. SILATURAHMI
Meningkatkan Kualitas Silaturahmi melalui Program Reuni dan Pertemuan Rutin: Menyelenggarakan acara reuni dan pertemuan berkala baik secara offline maupun online, guna mempererat tali persaudaraan dan memperluas jaringan antar alumni dari berbagai angkatan.

2. FASILITATIF
Memfasilitasi Penyebaran Informasi tentang Peluang Karir dan Pengembangan Diri: Menyediakan wadah bagi alumni untuk berbagi peluang karir, informasi mengenai beasiswa, pelatihan profesional, serta kegiatan pengembangan diri lainnya yang dapat meningkatkan kompetensi dan keberhasilan bersama.

3.KOLABORASI
Mengaktifkan Kolaborasi Alumni dengan Pihak Kampus dan Organisasi Terkait:
Mendorong kolaborasi antara alumni, kampus, dan organisasi eksternal untuk menciptakan peluang kerjasama yang saling menguntungkan, baik dalam bidang akademik, riset, maupun pengabdian masyarakat.
$seed$,
  $seed$1. ALUMNI GATHERING Mengadakan acara tahunan atau semi-tahunan berupa gathering alumni, baik dalam bentuk reuni, seminar, atau pertemuan informal, yang bertujuan untuk mempererat silaturahmi, berbagi pengalaman, serta memperluas jaringan profesional di kalangan alumni.

2. NETWORKING EVENT Tujuan utama dari acara ini adalah untuk memperkuat silaturahmi antar alumni dan memperluas jaringan (network) yang dapat saling menguntungkan, baik dalam bidang karir, bisnis, maupun kesempatan kolaborasi lainnya.mcorper aliquam nunc semper aliquet.

3. PLATFORM DIGITAL ALUMNI Membuat dan mengelola platform digital (website atau aplikasi mobile) khusus untuk alumni, di mana mereka dapat berkomunikasi, berbagi informasi mengenai peluang karir, acara, beasiswa, serta program-program pengembangan diri.

4. KOLABORASI IKA, KAMPUS DAN MITRA Program Kolaborasi antara Alumni, Kampus, dan Organisasi Pemerintah maupun Swasta adalah sebuah inisiatif yang bertujuan untuk menjalin kerja sama yang saling menguntungkan antara tiga pihak, fokus program ini mengenai peluang berkarir
$seed$,
  '/storage/img/calon1.jpg',
  'Dosen STIA LAN',
  '2007',
  0
),
(
  'Dr. Poppy Adhianti, S.IP., M.Si.',
  $seed$“Menjadi Wadah Komunikasi Yang Strategis Antar Alumni Dan Almamater, Inovatif, Dan Berkontribusi Aktif Dalam Pengembangan Civitas Akademika Serta Pemberdayaan Masyarakat Dengan Mengedepankan Semangat Nasionalisme Dan Kontribusi Nyata Bagi Kemajuan Bangsa"$seed$,
  $seed$1. Menjadi Mitra Strategis Almamater Dalam Pengembangan Reputasi Serta Kualitas Pendidikan.

2. Membangun Sinergi Lintas Generasi, Membangun Jejaring Alumni Yang Kuat Untuk Berkontribusi Kepada Almamater Melalui Program-program Pengembangan Karier Dan Pengembangan Keilmuan Bagi Kemajuan Bersama.

3. Mengembangkan Potensi Alumni Untuk Meningkatkan Kompetensi Profesional Dan Sosial.

4. Meningkatkan Peran Alumni Dalam Pemberdayaan Masyarakat Dengan Mengimplementasikan Ilmu Administrasi Publik Dalam Memberikan Solusi Nyata Bagi Tantangan Sosial, Ekonomi, Dan Pemerintahan Di Indonesia

5. Menumbuhkan Semangat Nasionalisme Di Kalangan Alumni Dengan Memperkuat Peran Aktif Melalui Kontribusi Positif Dalam Tata Kelola Pemerintahan, Serta Mendorong Terjadinya Transformasi Dalam Administrasi Publik Yang Mendukung Kemajuan Bangsa
$seed$,
  $seed$1. Digitalisasi dan pengelolaan data alumni
a. Database alumni: mengembangkan sistem manajemen data alumni untuk mempermudah komunikasi dan kolaborasi.
b. Platform digital: aplikasi atau portal alumni untuk berbagi informasi / lowongan kerja, serta berinteraksi.
c. Integrasi data: menghubungkan data alumni AN/AP dengan fakultas serta universitas.

2. Dukungan untuk almamater
a. Kolaborasi dengan fakultas dan universitas: mendukung program akademik / penelitian / magang / kegiatan kampus lainnya.
b. Promosi almamater: menggerakkan alumni untuk berperan sebagai duta dalam memperkenalkan jurusan administrasi publik ke masyarakat luas.

3. Dukungan untuk masyarakat
a. Program sosial: melaksanakan kegiatan bakti sosial / bantuan bencana / kegiatan kemanusiaan.
b. Pemberdayaan komunitas: melaksanakan kegiatan pemberdayaan masyarakat berbasis sesuai kebutuhan dan perkembangan lingkungan.

4. Dukungan untuk pengembangan karier dan profesionalisme
a. Job fair dan networking event: memfasilitasi alumni dengan peluang kerja/ pengembangan karier / memperluas jejaring profesional.
b. Pelatihan: program pelatihan soft skills / kewirausahaan / kepemimpinan untuk meningkatkan daya saing alumni di dunia kerja.
c. Program coaching dan mentoring: alumni senior memberikan bimbingan kepada alumni muda dan/atau mahasiswa tentang pengembangan karier dan pilihan profesi.

5. Meningkatkan nasionalisme melalui kegiatan budaya
a. Seminar nasional dan/atau diskusi kebijakan: menyelenggarakan seminar nasional/diskusi kebijakan yang menghadirkan pembicara dari berbagai latar belakang untuk membahas isu-isu kebangsaan dan pengembangan indonesia.
b. Festival budaya dan kewarganegaraan: mengorganisasi acara budaya dan kegiatan yang menumbuhkan semangat kebangsaan
$seed$,
  '/storage/img/calon3.jpg',
  'Deputi Bidang Pengendalian dan Evaluasi Badan Pembinaan Ideologi Pancasila',
  '1991',
  0
)
ON CONFLICT (name) DO UPDATE SET
  vision = EXCLUDED.vision,
  mission = EXCLUDED.mission,
  featured_program = EXCLUDED.featured_program,
  image = EXCLUDED.image,
  occupation = EXCLUDED.occupation,
  cohort = EXCLUDED.cohort,
  updated_at = NOW();

-- ================================================================
-- AKUN ADMIN AWAL
-- Kredensial bawaan sistem lama: User ID 2341030 / Password 2341030.
-- WAJIB ganti password melalui query UPDATE di bawah sebelum produksi.
-- ================================================================

INSERT INTO users (user_id, password_hash, display_name, role, has_voted)
VALUES (
  '2341030',
  crypt('2341030', gen_salt('bf', 12)),
  'Anry Firmansyah',
  'Admin',
  FALSE
)
ON CONFLICT (user_id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  role = 'Admin',
  updated_at = NOW();

COMMIT;

-- Verifikasi hasil. Seharusnya kandidat = 3 dan admin = 1.
SELECT COUNT(*) AS jumlah_kandidat FROM candidates;
SELECT user_id, display_name, role FROM users WHERE user_id = '2341030';

-- ================================================================
-- GANTI PASSWORD ADMIN SEBELUM PRODUKSI
-- Ganti PASSWORD_BARU_YANG_KUAT, lalu jalankan query berikut terpisah.
-- ================================================================
-- UPDATE users
-- SET password_hash = crypt('PASSWORD_BARU_YANG_KUAT', gen_salt('bf', 12)),
--     updated_at = NOW()
-- WHERE user_id = '2341030';

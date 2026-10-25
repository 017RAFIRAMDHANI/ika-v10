-- ================================================================
-- DATA AWAL V10 (HANYA untuk instalasi baru TANPA migrasi dari v9)
-- Jalankan SETELAH neon-manual.sql. Jika data dipindahkan dari v9 dengan
-- scripts/migrasi-dari-v9.mjs, JANGAN jalankan file ini.
--
-- WAJIB: ganti nilai admin_password di bawah dengan password yang kuat
-- (minimal 12 karakter). Skrip menolak berjalan bila masih berisi placeholder.
-- ================================================================

BEGIN;

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

-- T6: tidak ada lagi akun admin bawaan. Isi User ID dan password admin sendiri sebelum menjalankan.
DO $$
DECLARE
  admin_user_id TEXT := 'GANTI_USER_ID_ADMIN';
  admin_name TEXT := 'Administrator IKA';
  admin_password TEXT := 'GANTI_DENGAN_PASSWORD_ADMIN_YANG_KUAT';
BEGIN
  IF admin_user_id LIKE 'GANTI_%' OR length(admin_user_id) < 4 THEN
    RAISE EXCEPTION 'Ganti admin_user_id di data-awal.sql (minimal 4 karakter) sebelum menjalankan file ini.';
  END IF;
  IF admin_password LIKE 'GANTI_%' OR length(admin_password) < 12 THEN
    RAISE EXCEPTION 'Ganti admin_password di data-awal.sql (minimal 12 karakter) sebelum menjalankan file ini.';
  END IF;
  IF position(lower(admin_user_id) IN lower(admin_password)) > 0 THEN
    RAISE EXCEPTION 'admin_password tidak boleh memuat admin_user_id.';
  END IF;
  -- Akun yang sudah ada tidak dinaikkan menjadi admin diam-diam.
  IF EXISTS (SELECT 1 FROM users WHERE user_id = admin_user_id) THEN
    RAISE EXCEPTION 'User ID % sudah dipakai akun lain; pilih User ID admin yang berbeda.', admin_user_id;
  END IF;
  INSERT INTO users (user_id, password_hash, display_name, role, has_voted)
  VALUES (admin_user_id, crypt(admin_password, gen_salt('bf', 12)), admin_name, 'Admin', FALSE);
END
$$;

COMMIT;

-- Verifikasi: kandidat = 3 dan admin = 1.
SELECT COUNT(*) AS jumlah_kandidat FROM candidates;
SELECT user_id, display_name, role FROM users WHERE role = 'Admin';

# Panduan IKA v10 — Suara Rahasia, Log Audit, Hak Suara, dan Pengamanan Verifikasi Wajah

v10 adalah proyek, repositori, dan database **terpisah** dari v9. v9 (folder
`evoting-ika-unpad-claude`, repo `ika-v9`, database Neon lama) tidak diubah sama sekali,
sehingga selalu dapat dipakai kembali.

## 1. Ringkasan perubahan

| Kode | Masalah di v9 | Perbaikan di v10 |
| --- | --- | --- |
| **K1** Suara rahasia | Tabel `voters` menyimpan `user_id` + `candidate_id`; admin dapat melihat, memfilter, dan mengekspor "siapa memilih siapa". | Tabel `voters` diganti `ballots`: hanya `candidate_id`, id UUID acak, tanpa waktu. Kolom/filter "Calon Terpilih" dan kolom "Calon Pilihan" di ekspor dihapus. `candidates.updated_at` tidak lagi diubah saat suara masuk agar waktu tidak dapat dicocokkan dengan pemilih. |
| **K2** Jejak audit | Admin dapat mereset/menghapus suara tanpa jejak; tidak ada log. | Tabel `admin_audit_log` mencatat login admin, tambah/ubah/hapus akun, reset wajah, tambah/ubah/hapus kandidat, impor, dan ekspor — ditulis dalam statement SQL yang sama dengan aksinya. Fitur **reset hak pilih dihapus**; akun yang sudah memilih **tidak dapat dihapus** dan role-nya tidak dapat diubah. `ballots` dan `admin_audit_log` *append-only*. Menu baru **Log Audit** menampilkan riwayat dan rekonsiliasi suara. |
| **K3** Hak suara | Larangan admin memilih hanya di tampilan; API tetap menerima suara admin. | `/api/vote`, `castVote` (SQL), dan seluruh API verifikasi wajah hanya menerima role `Alumni`. Admin tidak dapat mengubah role dirinya sendiri. |
| **K5** Verifikasi wajah (v10.1) | Server mengirim skor kemiripan saat gagal dan percobaan tidak dibatasi, sehingga template dapat ditebak bertahap. | Skor tidak lagi dikirim (pesan hanya "tidak cocok" + sisa percobaan). Setelah **5 kali gagal**, verifikasi wajah akun itu **dikunci 15 menit** dan tercatat di Peringatan Keamanan. Berhasil atau reset wajah oleh admin membuka kunci. |
| **T1** Jadwal pemilu (v10.2) | Pemungutan suara terbuka kapan saja; tidak ada cara membuka/menutup pemilu; hasil per kandidat tampil selama voting. | Admin mengatur jadwal di **Dashboard Admin → Status Pemilu** (waktu buka/tutup WIB, tombol *Buka Sekarang* dan *Tutup Sekarang*). Tiga tahap: **Persiapan** (aktivasi wajah, pendaftaran, kelola data; voting tertutup) → **Pemungutan Suara** (voting dibuka; kandidat, impor, kelola akun, dan reset wajah dikunci) → **Ditutup** (final, tidak dapat dibuka lagi). Dua pengaturan admin: pendaftaran mandiri saat voting (bawaan: ditutup) dan hasil per kandidat untuk pemilih saat voting (bawaan: hanya jumlah pemilih). |
| **Login** kode alumni (v10.2) | User ID = password = tahun angkatan + tanggal lahir + bulan lahir + tahun lahir, tetapi data lama ditulis tanpa angka 0 (mis. `19991261971`) sehingga pemilih yang mengetik 12 digit lengkap ditolak; petunjuk login tidak menjelaskan formatnya. | Login menerima kode **dengan atau tanpa angka 0** (juga spasi/titik/garis miring), mis. `200405031995` = `2004531995`. Pencarian bertingkat: kode persis lebih dulu, lalu penulisan setara; akun dipilih hanya bila password-nya cocok, dan bila kode cocok dengan lebih dari satu akun login ditolak dengan permintaan menulis 12 digit lengkap. Halaman login menampilkan format dan contoh `200419121995`. |
| **T4** Pembatasan percobaan login (v10.2) | Login pemilih, login admin, dan kode pendaftaran dapat dicoba tanpa batas. | **Per akun:** 5 kali salah password = akun dikunci 15 menit (pemilih dan admin). **Per jaringan** (alamat IP disimpan sebagai HMAC, bukan IP mentah): login pemilih 40, login admin 10, kode pendaftaran 10 kali gagal per 15 menit. Penguncian tercatat di Peringatan Keamanan (`login.akun_dikunci`, `*.jaringan_dibatasi`). Admin yang mengubah akun di Kelola Akun sekaligus membuka kunci login akun itu. |
| **K6** DPT terverifikasi (v10.1) | Pendaftaran mandiri menerima NIM apa pun dan satu wajah dapat mendaftarkan banyak akun. | **Wajah ganda:** wajah baru dibandingkan dengan seluruh wajah terdaftar saat pendaftaran dan aktivasi; bila sama mirip dengan akun lain, proses ditahan dan tercatat. **DPT resmi:** setelah panitia mengunggah daftar alumni (menu Import), pendaftaran mandiri hanya diterima untuk NIM di daftar dengan nama yang sesuai (gelar dan huruf besar/kecil diabaikan). |

Yang **tidak** berubah: model wajah (ArcFace, ambang 0.42, satu kali pindai), tampilan pemilih,
dan halaman hasil. Password awal tetap sama dengan User ID (lihat Batasan no. 7).

## 2. Instalasi

### 2.1 Database Neon baru

1. Buka [console.neon.tech](https://console.neon.tech) → **New Project** (misalnya `ika-v10`).
2. Salin *connection string* (format `postgresql://...?sslmode=require`).
3. Buka **SQL Editor** project tersebut, salin seluruh isi `database/neon-manual.sql`, lalu **Run**.
   Hasil akhir harus menampilkan 9 tabel.

### 2.2 File `.env.local`

Salin `.env.example` menjadi `.env.local`, lalu isi:

| Variabel | Isi |
| --- | --- |
| `DATABASE_URL` | Connection string database v10 (bukan database v9). |
| `SESSION_SECRET`, `FACE_DATA_SECRET` | Secret acak baru, minimal 32 karakter. |
| `REGISTRATION_PRIMARY_CODE` | Kode pendaftaran baru (minimal 8 karakter). |
| `V9_DATABASE_URL`, `V9_FACE_DATA_SECRET` | Hanya untuk migrasi dari v9; hapus setelah migrasi selesai. |

Membuat secret acak:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

> Secret v9 sempat tersimpan di repo publik `ika-v9`. Jangan pakai ulang secret v9 untuk v10,
> dan ganti password database v9 di Neon (**Roles → Reset password**).

### 2.3 Isi data — pilih salah satu

**A. Pindahkan data dari v9 (disarankan)**

```bash
npm install
node --env-file=.env.local scripts/backup-v9.mjs            # backup penuh v9 ke database/backup/
node --env-file=.env.local scripts/migrasi-dari-v9.mjs --dry-run   # simulasi, tidak menulis
node --env-file=.env.local scripts/migrasi-dari-v9.mjs             # migrasi sungguhan
```

Skrip migrasi:

- hanya **membaca** database v9;
- menolak berjalan bila database v10 belum kosong;
- memindahkan kandidat, akun (beserta hash password), dan template wajah aktif;
- mengenkripsi ulang template wajah dengan `FACE_DATA_SECRET` v10 (template yang sudah dicabut tidak dipindahkan);
- mengubah setiap baris `voters` v9 menjadi surat suara anonim dalam urutan acak;
- menulis semuanya dalam satu transaksi dan mencatat `sistem.migrasi_v9` di log audit.

**B. Instalasi baru tanpa data v9**

Buka `database/data-awal.sql`, ganti `admin_password` (minimal 12 karakter), lalu jalankan di SQL
Editor setelah `neon-manual.sql`.

### 2.4 Upgrade database v10.0 ke v10.1 (K5 & K6)

Hanya untuk database v10 yang dibuat sebelum v10.1 (instalasi baru dengan `neon-manual.sql`
terbaru sudah otomatis v10.1).

```bash
node --env-file=.env.local scripts/backup-v10.mjs   # backup penuh ke database/backup/
```

Lalu jalankan seluruh isi `database/migrasi-v10.1-k5-k6.sql` di Neon SQL Editor. Migrasi hanya
menambah 2 kolom (`users.face_failed_attempts`, `users.face_locked_until`) dan 2 tabel
(`security_events`, `dpt_resmi`); tidak ada data yang diubah. Pembatalan:
`database/rollback-v10.1-ke-v10.0.sql`.

### 2.5 Upgrade database v10.1 ke v10.2 (T1 & T4)

```bash
node --env-file=.env.local scripts/backup-v10.mjs
```

Lalu jalankan `database/migrasi-v10.2-t1-t4.sql` di Neon SQL Editor. Migrasi hanya menambah tabel
`pengaturan_pemilu` (satu baris) beserta trigger penjaganya, 2 kolom `users.login_failed_attempts`
/ `users.login_locked_until`, dan tabel `login_throttle`; data lain tidak berubah. Pembatalan:
`database/rollback-v10.2-ke-v10.1.sql`.

> **Penting:** setelah migrasi, status pemilu = **Persiapan** sehingga pemungutan suara **tertutup**
> sampai admin mengatur jadwal atau menekan *Buka Sekarang*.

### 2.5b Mengatur jadwal pemilu

1. Buka **Dashboard Admin** → kartu **Status Pemilu**.
2. Isi **Waktu dibuka** dan **Waktu ditutup** (WIB), atur dua pilihan pengaturan, lalu **Simpan Jadwal**.
   Kosongkan waktu ditutup bila pemungutan suara akan ditutup manual.
3. Saat waktu dibuka tiba, pemungutan suara terbuka otomatis (atau tekan **Buka Sekarang**).
4. Selama pemungutan suara hanya waktu tutup yang dapat diubah (misalnya diperpanjang).
5. Pemungutan suara tertutup otomatis saat waktu tutup tiba, atau dengan **Tutup Sekarang**.
   **Penutupan bersifat final.**

Aturan ini ditegakkan di server dan di database (trigger `ika_jaga_pengaturan_pemilu`, syarat
jadwal di `castVote`), bukan hanya di tampilan. Setiap perubahan tercatat di Log Audit.

### 2.5c DPT resmi (opsional, disarankan)

Menu **Import → DPT Resmi**: unggah .xlsx/.csv dengan NIM di kolom A dan Nama di kolom B (seperti
`databook.xlsx`), atau baris pertama berjudul `NIM` dan `Nama`. Unggahan baru **mengganti** seluruh
daftar. Atur kolom NIM sebagai Teks agar angka 0 di depan tidak hilang. Selama DPT resmi belum
diunggah, halaman Import menampilkan peringatan dan pendaftaran mandiri tidak dicocokkan.

### 2.6 Menjalankan dan deploy

```bash
npm run dev      # lokal: http://localhost:3000
npm run build    # memastikan build produksi lolos
```

Deploy ke Vercel sebagai **project baru** dari repo `ika-v10`, lalu isi Environment Variables
yang sama dengan `.env.local` (tanpa variabel `V9_*`).

## 3. Backup dan kembali ke v9

- **Database v9 tidak disentuh** oleh v10. Untuk kembali ke v9 cukup gunakan lagi deployment/folder v9.
- `scripts/backup-v9.mjs` menghasilkan `database/backup/backup-v9-<waktu>.sql` — skema + seluruh
  data v9. Untuk memulihkan: buat database Neon kosong → SQL Editor → jalankan file tersebut.
  File ini **rahasia** (memuat data pribadi dan relasi pemilih-kandidat v9) dan tidak ikut ke Git.
- Skema v9 diarsipkan di `database/v9-lama/`.
- Data yang dibuat di v10 (pendaftar baru, suara) tidak dapat dikembalikan ke v9 dalam bentuk
  "siapa memilih siapa", karena v10 memang tidak menyimpannya. Jumlah suara per kandidat tetap
  tersedia.

## 4. Daftar uji (black-box)

| No | Skenario | Hasil yang diharapkan |
| --- | --- | --- |
| 1 | Pemilih memilih kandidat | Status "Suara Tercatat"; `ballots` bertambah 1 tanpa `user_id`; penghitung kandidat +1. |
| 2 | Admin membuka Data Pemilih / detail pemilih | Hanya status sudah/belum memilih; tidak ada nama kandidat pilihan. |
| 3 | Admin mengekspor Excel | Tidak ada kolom "Calon Pilihan"; log audit mencatat `pemilih.ekspor`. |
| 4 | Admin menghapus akun yang sudah memilih | Ditolak (409). |
| 5 | Admin mengubah role akun yang sudah memilih / role dirinya sendiri | Ditolak (409). |
| 6 | `POST /api/vote` dengan sesi admin | Ditolak (403) "Akun administrator tidak memiliki hak suara". |
| 7 | Tambah/ubah/hapus akun atau kandidat, reset wajah, impor | Muncul di menu **Log Audit** dengan nama admin dan waktu. |
| 8 | `UPDATE`/`DELETE` langsung pada `ballots` atau `admin_audit_log` | Ditolak oleh trigger database. |
| 9 | Menu Log Audit → Rekonsiliasi | Status "Konsisten" (surat suara = penghitung = akun yang memilih). |
| 10 | Verifikasi wajah gagal | Pesan tanpa skor, menampilkan sisa percobaan. |
| 11 | Verifikasi wajah gagal 5 kali | Dikunci 15 menit (429); muncul di Peringatan Keamanan; reset wajah oleh admin membuka kunci. |
| 12 | Aktivasi/pendaftaran dengan wajah yang sudah dimiliki akun lain | Ditolak (409) "Wajah ini sangat mirip dengan akun lain"; tercatat di Peringatan Keamanan. |
| 13 | Unggah DPT resmi, lalu daftar dengan NIM di luar daftar / nama berbeda | Ditolak (409). NIM di daftar + nama sesuai diterima. |
| 14 | Unggah file DPT berisi baris tidak valid | Ditolak dengan nomor baris; DPT lama tetap utuh. |
| 15 | Memilih saat Persiapan / setelah Ditutup | Ditolak (403) "belum dibuka" / "telah ditutup". |
| 16 | Simpan jadwal dengan waktu tutup sebelum waktu buka / di masa lalu | Ditolak. |
| 17 | Selama pemungutan: tambah/ubah/hapus kandidat, impor, kelola akun, reset wajah | Ditolak (409) "Dikunci selama pemungutan suara". |
| 18 | Selama pemungutan: ubah waktu buka atau pengaturan | Ditolak; memperpanjang waktu tutup diizinkan. |
| 19 | Siaran Live oleh pemilih selama pemungutan | Hanya jumlah pemilih yang sudah memilih (kecuali diizinkan admin). |
| 20 | Tutup Sekarang lalu coba buka lagi / ubah jadwal | Ditolak; tahap Ditutup bersifat final. |
| 21 | Login dengan kode tanpa angka 0 / dengan angka 0 / dengan spasi | Ketiganya masuk ke akun yang sama. |
| 22 | Login dengan kode yang cocok dengan dua akun berbeda | Ditolak (409), diminta mengetik 12 digit lengkap. |
| 23 | Salah password 5 kali pada satu akun | Akun dikunci 15 menit (429), tercatat di Peringatan Keamanan; password benar pun ditolak selama terkunci. |
| 24 | Gagal login berulang dari satu jaringan (40 pemilih / 10 admin) | Jaringan dibatasi sampai jendela 15 menit berakhir (429). |
| 25 | Kode pendaftaran salah 10 kali | Dibatasi (429) sampai jendela 15 menit berakhir. |

Hasil uji otomatis terhadap aplikasi berjalan (database uji terpisah): K1–K3 57/57, K5/K6 32/32,
T1 53/53, login kode alumni + T4 41/41 lulus. Uji login lewat HTTP pada salinan data asli: 715/715
akun alumni masuk dengan kode lama, dan 773/773 ketikan 12 digit masuk ke akun yang tanggalnya sesuai
(0 salah akun). Gladi migrasi v10.2 → ulang → rollback → migrasi pada salinan data asli: data lama
identik di setiap langkah.

## 5. Batasan yang perlu dicatat di skripsi

1. **Administrator database** (pemilik project Neon) masih dapat menonaktifkan trigger, dan
   secara teori dapat mengaitkan surat suara dengan pemilih melalui metadata transaksi PostgreSQL
   (misalnya kolom sistem `xmin` atau urutan fisik baris). v10 melindungi kerahasiaan terhadap
   administrator **aplikasi**, bukan terhadap administrator infrastruktur. Perlindungan penuh
   membutuhkan skema kriptografis (mis. *blind signature* atau *homomorphic tally*).
2. Sejak v10.2 (T1), reset password dan reset wajah oleh admin **dikunci selama pemungutan
   suara**. Pada tahap Persiapan admin masih dapat melakukannya (untuk membantu pemilih); setiap
   reset tercatat di Log Audit sehingga dapat diperiksa sebelum voting dibuka. Waktu yang
   dipakai untuk membuka/menutup adalah jam database (sama untuk aplikasi, trigger, dan
   `castVote`), sehingga selisih jam server aplikasi tidak berpengaruh.
3. Log audit hanya mencatat tindakan administrator, bukan tindakan pemilih, dan tidak pernah
   mencatat pilihan kandidat. Peringatan keamanan (wajah dikunci/ganda) dicatat terpisah.
4. **Liveness diperiksa di perangkat pemilih (K5c).** Kedip/tengok dan skor anti-spoof dihitung di
   browser; server hanya menerima laporannya. Penyerang yang menguasai password dan foto korban,
   serta mampu memodifikasi klien, secara teori dapat mengirim embedding dari foto disertai laporan
   liveness palsu. K5a/K5b dan log keamanan mempersulit serta mencatat upaya ini, tetapi pencegahan
   penuh memerlukan pemeriksaan liveness di server (video dikirim ke server) yang lebih lambat dan
   menambah risiko privasi.
5. Cek wajah ganda hanya membandingkan template ArcFace. Template model lama (faceres) tidak
   dapat dibandingkan; reset wajah akun lama agar ikut terlindungi. Kembar identik dapat tertahan
   dan memerlukan penanganan manual oleh panitia.
6. Pencocokan nama DPT bersifat longgar (cukup satu kata nama sama); perlindungan utamanya adalah
   NIM yang hanya dapat diklaim sekali dan cek wajah ganda.
7. **Password awal = User ID = angkatan + tanggal lahir.** Siapa pun yang mengetahui angkatan dan
   tanggal lahir seorang alumni dapat login sebagai alumni itu; T4 hanya membatasi tebakan massal,
   bukan tebakan terarah. Perlindungan hak suara bertumpu pada verifikasi wajah: wajah yang
   didaftarkan lebih dulu yang berlaku, dan wajah ganda ditahan (K6). Kode yang secara alami ambigu
   (mis. `20041111995` = 1 November atau 11 Januari) tetap mengikuti data lama: bila tepat sama
   dengan User ID sebuah akun, akun itulah yang dipakai.
8. Pembatasan per jaringan memakai alamat IP dari header `x-real-ip`/`x-forwarded-for` yang diisi
   Vercel. Bila dipasang di server lain tanpa proxy tepercaya, header ini dapat dipalsukan. Banyak
   alumni di satu Wi-Fi acara berbagi satu alamat IP, sehingga batas login pemilih dibuat longgar
   (40 gagal per 15 menit).

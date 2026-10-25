# Panduan pemasangan sampai berjalan

> **Catatan v10:** dokumen ini berasal dari versi sebelumnya. Untuk instalasi, struktur
> database (tabel `ballots` dan `admin_audit_log`), migrasi dari v9, dan backup, ikuti
> [`PANDUAN-V10.md`](../PANDUAN-V10.md).

## 1. Persiapan

Siapkan:

- Node.js 20.9 atau lebih baru; Node.js 22 LTS direkomendasikan.
- Akun [Neon](https://console.neon.tech/).
- Akun [Vercel](https://vercel.com/).
- GitHub bersifat opsional, tetapi paling mudah untuk deployment berulang.

Ekstrak ZIP, buka terminal di folder `voting-ika-nextjs`, kemudian cek:

```bash
node --version
npm --version
```

## 2. Membuat database Neon V4 baru

1. Masuk ke Neon dan pilih **New project**. Jangan memakai project/database V3 produksi.
2. Pilih region yang dekat dengan mayoritas pengguna.
3. Setelah project dibuat, buka **Connect**.
4. Pilih connection string yang pooled/serverless bila pilihan tersebut tersedia.
5. Salin URL PostgreSQL lengkap yang diawali `postgresql://`.
6. Pada Neon Console, buka **SQL Editor**.
7. Buka file `database/neon-manual.sql` dari proyek ini, salin seluruh isinya,
   tempel ke SQL Editor, kemudian tekan **Run**.
8. Pastikan hasil verifikasi menampilkan tiga kandidat dan satu akun admin.

V4 wajib diarahkan ke database baru agar database V3 tidak berisiko berubah.
`database/migrate-face-verification.sql` hanya untuk salinan/staging, bukan
database lama yang sedang produksi. Akun awal V4:

```text
User ID : 2341030
Password: 2341030
```

Jika database Neon V4 Anda sudah dibuat dengan proyek V4.0.0/V4.0.1, jangan
buat ulang dan jangan reset data. Jalankan satu kali isi
`database/migrate-v4.0.2-mobile-primary.sql` melalui SQL Editor sebelum deploy
kode V4.0.2. Migrasi ini mempertahankan user, template lama, kandidat, dan suara.

Sebelum produksi, jalankan query ganti password yang sudah tersedia di bagian
paling bawah `database/neon-manual.sql`.

Panduan resmi tersedia pada
[Connect a Next.js application to Neon](https://neon.com/docs/guides/nextjs).

## 3. Mengatur variabel lokal

Duplikasi `.env.example` menjadi `.env.local`.

Windows PowerShell:

```powershell
Copy-Item .env.example .env.local
```

macOS/Linux:

```bash
cp .env.example .env.local
```

Isi `.env.local`:

```dotenv
DATABASE_URL=postgresql://USER:PASSWORD@HOST/DBNAME?sslmode=require
SESSION_SECRET=RAHASIA_ACAK_MINIMAL_32_KARAKTER
FACE_DATA_SECRET=KUNCI_BIOMETRIK_ACAK_MINIMAL_32_KARAKTER
REGISTRATION_PRIMARY_CODE=KODE_PRIMARY_DPT_MINIMAL_8_KARAKTER
FACE_MATCH_THRESHOLD=0.68
FACE_CROSS_DEVICE_ENABLED=true
```

Buat dua nilai acak yang berbeda untuk `SESSION_SECRET` dan `FACE_DATA_SECRET`
dengan Node.js:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Jangan memasukkan `.env.local` ke Git atau ZIP publik.
Simpan `FACE_DATA_SECRET` di pengelola rahasia yang aman. Jika nilainya hilang
atau berubah, template wajah dan backup Excel lama tidak dapat dibuka.
Simpan `REGISTRATION_PRIMARY_CODE` hanya untuk administrator dan calon pemilih
yang berhak. Ganti kode tersebut bila sudah tersebar kepada pihak lain.

## 4. Memasang dependensi

```bash
npm install
```

## 5. Menjalankan di komputer

```bash
npm run dev
```

Buka aplikasi sesuai jenis pengguna:

- Login pemilih: `http://localhost:3000/login`
- Pendaftaran DPT tanpa login dengan Kode Primary: `http://localhost:3000/daftar`
- Login administrator: `http://localhost:3000/admin/login`
- Dashboard administrator setelah berhasil masuk: `http://localhost:3000/admin`

Gunakan halaman **Login Administrator** untuk akun admin yang dibuat oleh query
manual pada langkah 2. Halaman `/login` hanya menerima akun pemilih.

Administrator juga dapat mengikuti pemilihan. Akun lama yang belum memiliki
template wajah akan menjalani aktivasi liveness satu kali saat membuka
`/pemilihan`. Logout administrator kembali ke `/admin/login`, sedangkan logout
pemilih kembali ke `/login`.

Uji koneksi database melalui `http://localhost:3000/api/health`. Respons yang
benar berisi `"ok": true` dan `"database": "connected"`.

## 6. Memasukkan akun pemilih

1. Login sebagai admin melalui `/admin/login`.
2. Buka `http://localhost:3000/excel`.
3. Unggah `sample-data/databook.xlsx`, file `.xlsx`/`.csv` lama, atau file hasil
   **Export Excel** dari aplikasi ini.
4. Format lama membaca nama dari kolom E dan User ID dari kolom K.
5. Format backup dikenali dari header `User ID` dan `Nama Lengkap`, kemudian
   memulihkan biodata serta template V4 beserta metadata engine.
6. Password awal akun baru hasil impor sama dengan User ID.

Impor ulang format lama memperbarui nama dan password seperti perilaku sistem
sebelumnya. Impor ulang format backup mempertahankan password akun yang sudah ada.

## 7. Memeriksa build produksi

Sebelum deployment:

```bash
npm run typecheck
npm run lint
npm run build
```

Pastikan Next.js selalu diperbarui ke patch keamanan terbaru sebelum produksi:

```bash
npm install next@latest eslint-config-next@latest
```

Ulangi pemeriksaan build setelah pembaruan.

## 8. Deployment ke Vercel melalui GitHub

1. Buat repository GitHub kosong.
2. Unggah semua isi folder proyek, kecuali `.env.local`, `.next`, dan
   `node_modules`.
3. Di Vercel pilih **Add New → Project**.
4. Impor repository tersebut. Vercel akan mendeteksi Next.js otomatis.
5. Buka **Environment Variables** dan tambahkan:

   - `DATABASE_URL`
   - `SESSION_SECRET`
   - `FACE_DATA_SECRET`
   - `REGISTRATION_PRIMARY_CODE`
   - `FACE_MATCH_THRESHOLD` (opsional; default `0.68`, hanya untuk template lama)
   - `FACE_ARCFACE_MATCH_THRESHOLD` (opsional; default `0.42`, minimum `0.40`)
   - `FACE_CROSS_DEVICE_ENABLED` (`true` untuk V4)

   Pilih Production, Preview, dan Development sesuai kebutuhan. Dokumentasi
   resminya ada di [Vercel Environment Variables](https://vercel.com/docs/environment-variables).

6. Tidak perlu mengubah Build Command, Output Directory, atau Install Command.
7. Pilih **Deploy**.
8. Setelah selesai, buka `https://DOMAIN-ANDA/api/health`.

Skema dan data awal tidak perlu dijalankan lagi oleh Vercel karena sudah dibuat
langsung melalui Neon SQL Editor.

## 9. Deployment tanpa GitHub

Pasang Vercel CLI lalu jalankan dari folder proyek:

```bash
npm install -g vercel
vercel
vercel env add DATABASE_URL
vercel env add SESSION_SECRET
vercel env add FACE_DATA_SECRET
vercel env add REGISTRATION_PRIMARY_CODE
vercel env add FACE_MATCH_THRESHOLD
vercel env add FACE_CROSS_DEVICE_ENABLED
vercel --prod
```

Ikuti pertanyaan di terminal. Pilih framework **Next.js** dan pertahankan root
directory pada folder proyek ini.

## 10. Alur pemeriksaan akhir

1. Buka dashboard publik.
2. Daftarkan satu akun uji melalui `/daftar`; masukkan Kode Primary DPT, lengkapi
   biodata, lalu selesaikan satu pemindaian wajah. Baik di PC maupun HP hanya
   ada satu pemindaian.
3. Buka `/admin/login`, login sebagai admin, lalu cek **Hasil Suara** serta
   **Data Pemilih**.
4. Logout, lalu login sebagai akun uji melalui `/login`.
5. Buka bilik suara dan selesaikan satu kali verifikasi menggunakan wajah yang
   didaftarkan. Login/verifikasi tidak boleh meminta pemindaian kedua.
6. Muat ulang `/pemilihan`; selama verifikasi sesi masih berlaku (15 menit),
   pemeriksaan wajah tidak muncul kembali.
7. Pilih satu kandidat dan pastikan halaman terima kasih muncul.
8. Login lagi melalui `/admin/login`; hasil suara dan data pemilih harus bertambah.
9. Klik **Export Excel** pada halaman Data Pemilih, lalu uji impor file backup
   pada database staging dengan `FACE_DATA_SECRET` yang sama.
10. Logout lalu login dari perangkat lain. Wajah pendaftar harus diterima,
    sedangkan wajah orang lain harus ditolak.

## Pemecahan masalah

### `DATABASE_URL belum dikonfigurasi`

Pastikan `.env.local` berada di root proyek. Di Vercel, pastikan variabel telah
disimpan pada environment yang benar lalu lakukan redeploy.

### `SESSION_SECRET minimal 32 karakter`

Buat nilai baru dengan perintah generator pada langkah 3. Nilai lokal dan
Vercel boleh berbeda, tetapi pengguna akan perlu login ulang saat nilainya
berubah.

### `FACE_DATA_SECRET minimal 32 karakter` atau data wajah tidak dapat dibuka

Tambahkan `FACE_DATA_SECRET` di `.env.local` dan Vercel. Nilai tersebut harus
tetap sama untuk seluruh deployment yang memakai database dan backup yang sama.

### `Kode pendaftaran belum dikonfigurasi`

Tambahkan `REGISTRATION_PRIMARY_CODE` minimal 8 karakter di `.env.local`, lalu
restart `npm run dev`. Untuk Vercel, tambahkan variabel yang sama dan lakukan
redeploy. Jangan memasukkan kode ini ke source code atau variabel `NEXT_PUBLIC_*`.

### Kamera tidak terbuka

Pastikan halaman produksi menggunakan HTTPS, izin kamera tidak diblokir, dan
tidak ada aplikasi lain yang sedang mengunci kamera. Pada perangkat mobile,
gunakan Chrome, Edge, atau Safari versi terbaru dan muat ulang halaman setelah
izin diubah.

### Login benar tetapi kembali ke halaman login

Pastikan Anda memakai versi proyek `1.1.0` atau lebih baru. Versi ini sudah
menormalkan ID `BIGSERIAL` dari Neon sebelum membuat sesi dan menyesuaikan
atribut keamanan cookie dengan protokol HTTP/HTTPS. Setelah mengganti berkas
proyek, hentikan server lama, hapus folder `.next`, lalu jalankan kembali:

```bash
npm install
npm run dev
```

Jika login tetap gagal, pesan pada formulir akan menunjukkan apakah
`DATABASE_URL` atau `SESSION_SECRET` belum benar.

### Database tidak terhubung

Pastikan connection string Neon masih aktif, berisi `sslmode=require`, dan tidak
memiliki spasi tersembunyi. Gunakan driver HTTP yang sudah ada di proyek ini;
jangan menggantinya dengan koneksi TCP biasa untuk fungsi serverless.

### Build gagal setelah pembaruan paket

Hapus hasil build lokal lalu pasang ulang:

```bash
rm -rf .next node_modules
npm install
npm run build
```

Pada Windows, hapus folder `.next` dan `node_modules` melalui File Explorer atau
PowerShell sebelum menjalankan ulang `npm install`.

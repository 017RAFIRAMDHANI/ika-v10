# Panduan IKA V4 — database baru dan verifikasi lintas perangkat

> **Catatan v10:** dokumen ini berasal dari versi sebelumnya. Untuk instalasi, struktur
> database (tabel `ballots` dan `admin_audit_log`), migrasi dari v9, dan backup, ikuti
> [`PANDUAN-V10.md`](../PANDUAN-V10.md).

## Tujuan V4

V4 mempertahankan jalur desktop V3 yang ketat dan menambah jalur descriptor
canonical untuk HP serta lintas perangkat. Sistem tidak menurunkan ambang agar
mudah lolos, tidak mencoba banyak algoritma, dan tidak menerima template milik
akun lain.

| Skenario | Template yang dipakai | Engine | Ambang |
| --- | --- | --- | --- |
| Daftar desktop → login desktop | `desktop-primary` | WebGL | `0.68` |
| Daftar desktop → login HP | `canonical-cross-device` | WASM | `0.68` |
| Daftar HP → login HP | `mobile-primary` | WASM | `0.68` |
| Daftar HP → login desktop | `canonical-cross-device` | WASM | `0.68` |

Setiap percobaan hanya membandingkan **satu** template sesuai profil. Tidak ada
fallback cosine/correlation dan tidak ada penggabungan skor yang dapat membuat
wajah orang lain lolos.

## 1. Buat database Neon yang benar-benar baru

1. Jangan ubah `DATABASE_URL` aplikasi V3 yang sedang produksi.
2. Di Neon pilih **New project**. Gunakan nama berbeda, misalnya `ika-v4`.
3. Salin pooled connection string dari project baru.
4. Buka **SQL Editor** pada project baru tersebut.
5. Salin seluruh isi `database/neon-manual.sql`, tempel, lalu tekan **Run**.
6. Pastikan query terakhir menampilkan tiga kandidat dan satu akun admin.
7. Ganti password admin awal memakai contoh query di bagian bawah file SQL.

Jangan menjalankan `database/migrate-face-verification.sql` pada database V3
produksi. File tersebut hanya disediakan untuk salinan/staging yang memang
sengaja diuji sebagai migrasi.

Jika database baru tersebut sudah dibuat memakai IKA V4.0.0/V4.0.1, tidak perlu
membuat ulang database. Jalankan sekali
`database/migrate-v4.0.2-mobile-primary.sql` di SQL Editor sebelum menjalankan
kode V4.0.2. Migrasi itu hanya memperluas constraint untuk `mobile-primary` dan
tidak menghapus akun, template lama, kandidat, atau suara.

## 2. Buat konfigurasi baru

Salin `.env.example` menjadi `.env.local`, lalu isi dengan koneksi database V4.

```dotenv
DATABASE_URL=postgresql://USER:PASSWORD@HOST/DB_NAME?sslmode=require
SESSION_SECRET=RANDOM_BARU_MINIMAL_32_KARAKTER
FACE_DATA_SECRET=RANDOM_BARU_LAIN_MINIMAL_32_KARAKTER
REGISTRATION_PRIMARY_CODE=KODE_PRIMARY_DPT_BARU
FACE_MATCH_THRESHOLD=0.68
FACE_CROSS_DEVICE_ENABLED=true
```

Buat secret dengan perintah berikut dua kali:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Karena database V4 baru dan kosong, gunakan `SESSION_SECRET` dan
`FACE_DATA_SECRET` baru. Jangan menaruh `.env.local` di Git atau membagikannya.
Credential yang pernah masuk repository publik harus dianggap bocor dan wajib
diganti.

## 3. Jalankan dan periksa proyek

```bash
npm install
npm run typecheck
npm run lint
npm run build
npm run dev
```

Pastikan folder `public/wasm` ikut terunggah saat deploy. Isinya diperlukan agar
profil canonical berjalan lokal tanpa mengambil binary TensorFlow dari CDN.

## 4. Pengujian wajib sebelum produksi

Gunakan dua orang berbeda: A sebagai pemilik akun dan B sebagai penguji
penolakan. Gunakan akun yang belum memilih.

1. Daftar A di desktop. Aplikasi hanya meminta satu pemindaian.
2. Login akun A di desktop dengan wajah A: harus lolos.
3. Login akun A di desktop dengan wajah B: harus ditolak.
4. Login akun A di HP dengan wajah A: harus lolos.
5. Login akun A di HP dengan wajah B: harus ditolak.
6. Buat akun baru dengan pendaftaran melalui HP. Aplikasi hanya meminta satu
   pemindaian (canonical lintas perangkat).
7. Login akun tersebut di HP: harus meminta satu verifikasi dan hanya wajah
   pendaftar yang boleh lolos.
8. Login akun tersebut di desktop: harus meminta satu verifikasi canonical,
   tanpa pemindaian kedua dan tanpa pembuatan desktop primary.
9. Logout/login ulang di desktop: tetap hanya satu verifikasi canonical.
10. Pastikan suara tetap hanya dapat dikirim satu kali.

Jangan menurunkan `FACE_MATCH_THRESHOLD` di bawah `0.65`. Nilai V4 bawaan tetap
`0.68`. Jika hasil pengujian fisik belum baik, perbaiki cahaya depan, posisi
wajah, browser, dan kualitas kamera sebelum menyentuh ambang.

## 5. Reset verifikasi wajah oleh developer/admin

Cara yang disarankan:

1. Login ke `/admin/login`.
2. Buka **Data Pemilih** dan masuk ke detail pemilih.
3. Pada bagian Verifikasi Wajah klik **Reset Data Wajah**.
4. Konfirmasi. Semua template aktif ditandai `revoked`, `face_verified_at`
   dikosongkan, dan data suara tidak berubah.
5. Saat pemilih membuka bilik suara lagi, statusnya belum verifikasi dan ia
   wajib aktivasi wajah ulang.

Riwayat template tidak dihapus permanen oleh tombol reset; template lama dibuat
tidak aktif untuk audit. Untuk reset manual melalui Neon, lihat
`database/reset-wajah-v4.sql`.

## 6. Backup dan pemulihan

Export Excel V4 menyimpan tiga status profil dan satu kolom JSON tersembunyi
bernama **Data Template Wajah V4 (JSON)**. File itu bersifat rahasia.

- Impor backup V4 memulihkan kedua template aktif milik pendaftar beserta
  metadata engine (primary sesuai perangkat daftar dan canonical).
- Impor backup V3 masih dikenali sebagai template `desktop-primary` saja.
  Pemilik wajib login desktop dan lolos verifikasi sebelum profil canonical
  dapat ditambahkan.
- `FACE_DATA_SECRET` tujuan harus sama dengan sumber backup. Untuk database V4
  baru tanpa impor biometrik lama, gunakan secret baru.

## 7. Deployment Vercel

Tambahkan keenam variabel environment pada project Vercel V4 dan pastikan
`DATABASE_URL` menunjuk ke Neon V4, bukan V3. Lakukan deploy, lalu cek
`/api/health`. Ulangi seluruh matriks pengujian di domain HTTPS produksi sebelum
membuka pendaftaran umum.

`FACE_CROSS_DEVICE_ENABLED=false` adalah kill switch darurat. Saat dimatikan,
profil canonical dan pendaftaran lintas perangkat tidak tersedia; jalur desktop
primary yang sudah ada tetap dapat diverifikasi.

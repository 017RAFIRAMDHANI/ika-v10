# Portal Pemilihan Ketua IKA v10 — Suara Rahasia, Log Audit, Verifikasi Wajah Lintas Perangkat

> **v10** menambahkan surat suara anonim (pilihan kandidat tidak disimpan bersama identitas
> pemilih), log audit seluruh tindakan administrator, dan larangan memilih bagi akun administrator
> yang ditegakkan di server. Instalasi, migrasi dari v9, backup, dan daftar uji ada di
> [`PANDUAN-V10.md`](PANDUAN-V10.md).

Verifikasi wajah memakai database Neon terpisah per versi. Pendaftaran baru, baik melalui PC maupun HP,
cukup satu pemindaian wajah yang menghasilkan template `canonical-cross-device`
yang memakai model ArcFace (InsightFace EfficientNet-B0) pada wajah yang diluruskan
5 titik. Template ini dipakai untuk login PC→PC, HP→HP, PC→HP, dan HP→PC.
Setiap login hanya melakukan satu verifikasi dan membandingkan satu template
dengan ambang cosine `0.42` hasil kalibrasi (lihat `VERIFIKASI-WAJAH.md`). Akun
lama yang masih memakai model `faceres` tetap diverifikasi dengan jalur lamanya.

Versi ini adalah migrasi full-stack dari proyek Laravel/MySQL ke Next.js App
Router dan Neon PostgreSQL. Backend, database, autentikasi, kandidat, dan alur pemilihan dipertahankan dari proyek sumber. Antarmuka telah didesain ulang penuh berdasarkan paket `new_design` dan dioptimalkan untuk desktop serta mobile.

## Teknologi

- Next.js App Router (frontend dan backend dalam satu proyek)
- React + TypeScript
- Next.js Route Handlers untuk login, biodata, voting, impor, dan ekspor
- Neon PostgreSQL melalui `@neondatabase/serverless`
- Cookie sesi bertanda tangan, `httpOnly`, dan `sameSite=lax`
- `bcrypt` untuk password
- ExcelJS untuk impor `.xlsx`/`.csv` dan ekspor `.xlsx`
- Chart.js untuk rekapitulasi suara
- Human/TensorFlow.js untuk face descriptor, anti-spoofing, liveness, dan gestur wajah di browser
- AES-256-GCM untuk enkripsi template biometrik sebelum disimpan di Neon
- Binary TensorFlow WASM lokal di `public/wasm` agar engine canonical konsisten

## Fitur yang telah dipindahkan

- Landing/onboarding baru untuk pengguna yang belum login
- Dashboard pemilih responsive dengan status hak suara
- Login pemilih (`/login`) dan administrator (`/admin/login`) yang terpisah
- Administrator tetap dapat membuka bilik suara seperti perilaku proyek Next.js lama
- Pemilihan kandidat satu kali per akun
- Transaksi voting atomik di PostgreSQL
- Halaman ucapan terima kasih setelah memilih
- Rekapitulasi suara khusus admin
- Dashboard administrator dengan ringkasan seluruh data
- CRUD kandidat: tambah, edit, dan hapus
- Kelola akun, peran, dan password (akun yang sudah memilih tidak dapat dihapus)
- Daftar dan detail lengkap pemilih (biodata, sumber pendaftaran, biometrik,
  waktu sistem, dan status sudah/belum memilih — tanpa pilihan kandidat)
- Log audit seluruh tindakan administrator dan rekonsiliasi jumlah suara
- Pencarian pemilih di tabel
- Impor akun dari Excel/CSV
- Form pendaftaran DPT tanpa login dengan Kode Primary DPT di `/daftar`
- Wizard pendaftaran tiga langkah: kode primary, biodata/akun, dan verifikasi wajah
- Liveness acak (kedip, tengok kiri/kanan, dan kembali ke tengah)
- Verifikasi wajah pendaftar pada setiap sesi login sebelum bilik suara dibuka
- Template biometrik versi/engine terpisah tersimpan di `user_face_templates`
- Jalur desktop primary, mobile primary, dan canonical lintas perangkat tanpa fallback skor
- Reset data wajah dari detail pemilih tanpa mereset suara
- Aktivasi wajah satu kali untuk akun lama yang belum memiliki template
- Ekspor data pemilih dan backup template wajah terenkripsi ke Excel
- Impor ulang backup Excel tanpa mereset password akun yang masih ada
- Daftar calon ketua
- Redesign penuh mengikuti `new_design`, termasuk navigasi desktop dan bottom navigation mobile
- Logout berbasis POST dengan penghapusan cookie dan redirect penuh sesuai jenis akun

## Mulai cepat

1. Baca [PANDUAN-V10.md](./PANDUAN-V10.md) (instalasi, migrasi dari v9, backup).
2. Buat database Neon baru khusus v10 dan salin connection string.
3. Buka Neon SQL Editor, tempel seluruh isi `database/neon-manual.sql`, lalu
   tekan **Run**. Isi data dengan `scripts/migrasi-dari-v9.mjs` atau `database/data-awal.sql`.
   Jangan jalankan SQL v10 pada database v9.
4. Salin `.env.example` menjadi `.env.local`, lalu isi semua nilainya termasuk
   `REGISTRATION_PRIMARY_CODE` yang akan dibagikan administrator kepada calon pemilih.
   `FACE_MATCH_THRESHOLD=0.68` dapat dipertahankan sebagai nilai bawaan aman.
5. Jalankan:

   ```bash
   npm install
   npm run dev
   ```

6. Buka `http://localhost:3000`; pendaftaran DPT publik tersedia di `http://localhost:3000/daftar`.
7. Gunakan `http://localhost:3000/login` untuk pemilih atau
   `http://localhost:3000/admin/login` untuk administrator.

## Perintah

```bash
npm run dev        # Server pengembangan
npm run typecheck  # Pemeriksaan TypeScript
npm run lint       # Pemeriksaan kode
npm run build      # Build produksi
npm start          # Menjalankan hasil build
```

## Struktur utama

```text
app/                 Halaman dan backend Route Handlers
components/          Komponen UI interaktif
database/neon-manual.sql Skema v10 untuk Neon SQL Editor
database/data-awal.sql   Kandidat + admin awal (instalasi baru tanpa migrasi)
database/v9-lama/        Arsip SQL v9
lib/                 Database, sesi, keamanan, tipe data
public/assets/       Logo, foto, dan aset lokal proyek
public/storage/img/  Foto dan materi kandidat asli
sample-data/         Contoh data akun dari proyek sumber
INTEGRASI-DESAIN-BARU.md Catatan pemetaan dan validasi redesign
```

Referensi resmi: [Next.js App Router](https://nextjs.org/docs/app),
[Neon untuk Next.js](https://neon.com/docs/guides/nextjs), dan
[Next.js di Vercel](https://vercel.com/docs/frameworks/full-stack/nextjs).

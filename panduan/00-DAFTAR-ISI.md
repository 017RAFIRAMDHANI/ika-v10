# Daftar Isi Panduan — E-Voting IKA v10

Semua panduan dan catatan aplikasi ada di folder ini. Mulai dari nomor 1.

## Berlaku untuk v10

| No | File | Isi |
| --- | --- | --- |
| 1 | [TENTANG-APLIKASI.md](TENTANG-APLIKASI.md) | Ringkasan aplikasi: fitur, teknologi, verifikasi wajah lintas perangkat, struktur proyek. |
| 2 | [PANDUAN-V10.md](PANDUAN-V10.md) | **Panduan utama**: daftar perbaikan (K1–K6, T1–T6, login, daftar tanpa password), instalasi, migrasi database, jadwal pemilu, DPT resmi, rekonsiliasi suara, Reset Uji Coba, daftar uji, dan batasan untuk skripsi. |
| 3 | [PANDUAN-SIMULASI.md](PANDUAN-SIMULASI.md) | Tutorial simulasi banyak pemilih (mengisi grafik hasil untuk presentasi) dan cara membersihkannya. |
| 4 | [DATABASE.md](DATABASE.md) | Daftar file SQL di folder `database/` (skema, migrasi, rollback, perawatan) dan penjelasan tiap tabel. |
| 5 | [VERIFIKASI-WAJAH.md](VERIFIKASI-WAJAH.md) | Detail teknis verifikasi wajah (ArcFace, ambang 0.42, alur pemindaian). |
| 6 | [ASET-MODEL-WAJAH-HUMAN.md](ASET-MODEL-WAJAH-HUMAN.md) | Asal dan lisensi model wajah di `public/models/human/`. |
| 7 | [ASET-WASM-TFJS.md](ASET-WASM-TFJS.md) | Asal runtime TensorFlow.js WASM di `public/wasm/`. |

## Arsip versi lama (tidak berlaku untuk v10)

Folder [arsip-versi-lama/](arsip-versi-lama/) berisi catatan dari versi sebelumnya (V4 dan v9), disimpan
hanya sebagai riwayat. Untuk v10 selalu ikuti dokumen di atas.

| File | Isi |
| --- | --- |
| `PANDUAN-INSTALASI.md` | Panduan pemasangan versi lama. |
| `PANDUAN-V4-DATABASE-BARU.md` | Database dan verifikasi wajah V4. |
| `PANDUAN-PATCH-VERIFIKASI-WAJAH.md` | Patch verifikasi wajah V4. |
| `REVISI-V4.0.2.md` | Revisi V4.0.2 (2x daftar, 1x login). |
| `INTEGRASI-DESAIN-BARU.md` | Integrasi desain baru versi lama. |
| `MIGRASI-DATA.md` | Migrasi data Laravel/MySQL ke Neon. |
| `DATABASE-V9.md` | Struktur database v9 (file SQL-nya di `database/v9-lama/`). |

## Yang tidak ada di folder ini (sengaja)

- File rahasia: `.env.local`, backup database (`database/backup/`), dan `sample-data/` (databook, DPT
  asli) hanya ada di komputer, tidak ikut ke GitHub.

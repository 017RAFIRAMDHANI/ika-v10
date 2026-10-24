# Revisi IKA V4.0.2 — 2x daftar, 1x login

> **Catatan v10:** dokumen ini berasal dari versi sebelumnya. Untuk instalasi, struktur
> database (tabel `ballots` dan `admin_audit_log`), migrasi dari v9, dan backup, ikuti
> [`PANDUAN-V10.md`](PANDUAN-V10.md).

## Hasil akhir

| Alur | Template yang dibuat/diperiksa | Jumlah pemindaian |
| --- | --- | ---: |
| Daftar melalui PC | `desktop-primary`, lalu `canonical-cross-device` | 2 |
| Daftar melalui HP | `mobile-primary`, lalu `canonical-cross-device` | 2 |
| Login PC → PC | `desktop-primary` | 1 |
| Login HP → HP | `mobile-primary` | 1 |
| Login PC → HP | `canonical-cross-device` | 1 |
| Login HP → PC | `canonical-cross-device` | 1 |

Satu pemindaian tetap berisi rangkaian liveness kedip, tengok kiri/kanan, dan
kembali menghadap kamera. Yang dihilangkan adalah pemindaian/enrollment kedua
setelah verifikasi login berhasil.

## Jika memakai database Neon V4.0.0/V4.0.1 yang sudah ada

1. Backup database terlebih dahulu.
2. Buka Neon **SQL Editor** pada database V4 yang dipakai aplikasi.
3. Jalankan seluruh isi `database/migrate-v4.0.2-mobile-primary.sql` satu kali.
4. Ganti source code/deploy dengan V4.0.2, lalu jalankan `npm install`.
5. Restart aplikasi atau lakukan redeploy Vercel.

Migrasi hanya menambahkan izin role `mobile-primary` pada constraint database.
User, template lama, kandidat, hak pilih, dan suara tidak dihapus.

Untuk database Neon V4 yang benar-benar baru, jalankan
`database/neon-manual.sql`; migrasi tambahan tidak diperlukan.

## Pengujian

Gunakan akun baru untuk memeriksa alur pendaftaran dua kali. Akun HP lama dari
V4.0.1 tetap mempunyai canonical dan dapat login satu kali di HP/PC, tetapi
belum memiliki `mobile-primary` karena template tersebut memang belum dibuat
pada saat pendaftaran lama.

Jika ingin mengulang akun uji yang sama, admin dapat membuka **Data Pemilih →
detail pemilih → Reset Data Wajah**. Reset wajah tidak mereset suara. Untuk
menguji pendaftaran dari awal memakai NPM yang sama, gunakan akun uji khusus dan
hapus akun tersebut hanya pada database pengujian.

Uji minimal:

1. Pendaftaran PC meminta dua pemindaian.
2. Pendaftaran HP meminta dua pemindaian.
3. Setiap login hanya meminta satu pemindaian.
4. Empat kombinasi PC→PC, HP→HP, PC→HP, dan HP→PC menerima pemilik wajah.
5. Wajah orang lain ditolak pada keempat kombinasi.

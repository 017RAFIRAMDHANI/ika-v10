# Database IKA v10

| File | Kegunaan |
| --- | --- |
| `neon-manual.sql` | Skema v10.7. Jalankan sekali pada database Neon baru yang kosong. |
| `migrasi-v10.1-k5-k6.sql` | Upgrade database v10.0 yang sudah berisi data ke v10.1 (K5 & K6). |
| `rollback-v10.1-ke-v10.0.sql` | Membatalkan migrasi v10.1. |
| `migrasi-v10.2-t1-t4.sql` | Upgrade v10.1 ke v10.2 (T1: jadwal pemilu, T4: pembatasan percobaan login). |
| `rollback-v10.2-ke-v10.1.sql` | Membatalkan migrasi v10.2. |
| `migrasi-v10.3-daftar-tanpa-password.sql` | Upgrade v10.2 ke v10.3 (kolom `users.nim` untuk pendaftaran mandiri tanpa password). |
| `rollback-v10.3-ke-v10.2.sql` | Membatalkan migrasi v10.3. |
| `migrasi-v10.5-reset-pemilu.sql` | Upgrade ke v10.5: pemilu dapat dikembalikan ke Persiapan selama belum ada suara (hanya mengganti fungsi trigger). |
| `rollback-v10.5-ke-v10.4.sql` | Membatalkan migrasi v10.5 (penutupan kembali final tanpa pengecualian). |
| `migrasi-v10.7-reset-uji-coba.sql` | Upgrade ke v10.7: surat suara hanya dapat dihapus oleh transaksi Reset Uji Coba (menu Pemilu). |
| `rollback-v10.7-ke-v10.6.sql` | Membatalkan migrasi v10.7 (surat suara kembali append-only tanpa pengecualian). |
| `data-awal.sql` | Tiga kandidat + akun admin. **Hanya** untuk instalasi baru tanpa migrasi dari v9. Ganti `admin_user_id` dan `admin_password` terlebih dahulu (tidak ada admin bawaan). |
| `hapus-template-dicabut.sql` | Opsional (v10.4): menghapus template wajah yang dicabut oleh versi sebelumnya. Tanpa perubahan skema. |
| `reset-wajah-v4.sql` | Reset data wajah satu pemilih (manual). |
| `reset-wajah-model-lama.sql` | Opsional: cabut seluruh template wajah model lama (faceres). |
| `v9-lama/` | Arsip SQL v9 (skema lama dengan tabel `voters`). Hanya untuk referensi/pemulihan v9. |
| `backup/` | Hasil `scripts/backup-v9.mjs` dan `scripts/backup-v10.mjs`. Tidak ikut ke Git karena memuat data pribadi. |

## Tabel

- `candidates`: profil kandidat dan penghitung suara (`votes`).
- `users`: akun, biodata alumni, status `has_voted`.
- `user_face_templates`: template wajah terenkripsi AES-256-GCM.
- `ballots` **(baru)**: surat suara anonim — hanya `candidate_id`, id UUID acak, tanpa waktu
  dan tanpa identitas pemilih. Menggantikan tabel `voters` v9.
- `admin_audit_log` **(baru)**: catatan setiap tindakan administrator.
- `security_events` **(v10.1)**: peringatan keamanan — verifikasi wajah dikunci, wajah ganda ditahan.
- `dpt_resmi` **(v10.1)**: daftar alumni resmi (NIM + nama) untuk mencocokkan pendaftaran mandiri.
- `users.face_failed_attempts` / `users.face_locked_until` **(v10.1)**: penghitung gagal dan kunci
  sementara verifikasi wajah.
- `pengaturan_pemilu` **(v10.2)**: satu baris jadwal & status pemilu. Trigger
  `ika_jaga_pengaturan_pemilu` menolak perubahan setelah ditutup dan hanya mengizinkan perubahan
  waktu tutup selama pemungutan suara; baris tidak dapat dihapus.
- `users.login_failed_attempts` / `users.login_locked_until` **(v10.2)**: penghitung salah password
  dan kunci login sementara per akun.
- `users.nim` **(v10.3)**: NPM/NIM pendaftar mandiri (unik). User ID pendaftar baru adalah kode
  angkatan + tanggal lahir, sehingga NIM disimpan terpisah untuk pencocokan DPT.
- `login_throttle` **(v10.2)**: jumlah gagal login/kode pendaftaran per jaringan dalam jendela 15
  menit. Kunci = HMAC alamat IP; IP mentah tidak disimpan. Data sementara, tidak ikut backup.

`ballots`, `admin_audit_log`, dan `security_events` bersifat *append-only*: trigger menolak `UPDATE`, `DELETE`, dan
`TRUNCATE`. Pemilik database masih dapat menonaktifkan trigger secara manual; itu batasan yang
didokumentasikan di `PANDUAN-V10.md`.

Rekonsiliasi yang ditampilkan di menu **Log Audit**:

- jumlah `ballots` per kandidat = `candidates.votes`;
- jumlah akun `has_voted = TRUE` = jumlah `ballots`.

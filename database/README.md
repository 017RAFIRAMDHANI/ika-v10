# Database IKA v10

| File | Kegunaan |
| --- | --- |
| `neon-manual.sql` | Skema v10.1. Jalankan sekali pada database Neon baru yang kosong. |
| `migrasi-v10.1-k5-k6.sql` | Upgrade database v10.0 yang sudah berisi data ke v10.1 (K5 & K6). |
| `rollback-v10.1-ke-v10.0.sql` | Membatalkan migrasi v10.1. |
| `data-awal.sql` | Tiga kandidat + akun admin. **Hanya** untuk instalasi baru tanpa migrasi dari v9. Ganti `admin_password` terlebih dahulu. |
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

`ballots`, `admin_audit_log`, dan `security_events` bersifat *append-only*: trigger menolak `UPDATE`, `DELETE`, dan
`TRUNCATE`. Pemilik database masih dapat menonaktifkan trigger secara manual; itu batasan yang
didokumentasikan di `PANDUAN-V10.md`.

Rekonsiliasi yang ditampilkan di menu **Log Audit**:

- jumlah `ballots` per kandidat = `candidates.votes`;
- jumlah akun `has_voted = TRUE` = jumlah `ballots`.

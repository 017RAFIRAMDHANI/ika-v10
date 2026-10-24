# Struktur database Neon

- `users`: akun login, biodata alumni, status voting, template wajah terenkripsi,
  serta waktu pendaftaran/verifikasi wajah.
- `voters`: relasi akun dengan kandidat yang dipilih.
- `candidates`: profil kandidat dan total suara.

Skema ini mempertahankan relasi dari tabel Laravel `users`, `mahasiswas`, dan
`paslons`, tetapi menggunakan tipe serta batasan PostgreSQL.

Untuk pemasangan manual, buka **Neon Console → SQL Editor**, salin seluruh isi
`neon-manual.sql`, kemudian tekan **Run**. File tersebut sudah mencakup skema,
indeks, tiga kandidat, dan akun admin awal.

Untuk salinan database lama sebelum V4, gunakan `migrate-face-verification.sql`.
Untuk database yang sudah memakai V4.0.0/V4.0.1, jalankan
`migrate-v4.0.2-mobile-primary.sql` sekali sebelum memakai kode V4.0.2. Migrasi
V4.0.2 hanya memperluas constraint role; akun, template, kandidat, dan suara
tidak dihapus.

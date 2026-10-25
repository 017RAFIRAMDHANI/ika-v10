# Catatan migrasi data Laravel/MySQL ke Neon

> **Catatan v10:** dokumen ini berasal dari versi sebelumnya. Untuk instalasi, struktur
> database (tabel `ballots` dan `admin_audit_log`), migrasi dari v9, dan backup, ikuti
> [`PANDUAN-V10.md`](../PANDUAN-V10.md).

Arsip sumber tidak memuat dump MySQL (`.sql`). Karena itu, proyek ini sudah
memindahkan skema, relasi, kandidat dari seeder, aset, dan logika aplikasi,
sedangkan baris data produksi MySQL tidak dapat disalin otomatis dari arsip.

## Pemetaan tabel

| Laravel/MySQL | Next.js/Neon | Catatan |
| --- | --- | --- |
| `users.id` | `users.id` | Primary key |
| `users.user_id` | `users.user_id` | Unik |
| `users.password` | `users.password_hash` | Disimpan sebagai bcrypt |
| `users.nama_pengguna` | `users.display_name` | Nama tampilan |
| `users.jabatan` | `users.role` | Mahasiswa/Admin/Super Administrator |
| `users.mhs_id` | `users.voter_id` | Foreign key |
| `users.is_voting` | `users.has_voted` | Boolean |
| `mahasiswas` | `voters` | Biodata dan pilihan |
| `paslons` | `candidates` | Kandidat dan total suara |

## Migrasi akun dan backup verifikasi wajah

Gunakan halaman `/excel` setelah login admin. Dua format tetap didukung:

| Kolom | Isi |
| --- | --- |
| E | Nama Pengguna (format Google Form lama) |
| K | User ID (format Google Form lama) |

File `sample-data/databook.xlsx` dari proyek sumber sudah disertakan sebagai
sumber impor awal. Password akan di-hash ketika data masuk ke Neon.

File baru dari tombol **Export Excel** merupakan backup yang dapat diimpor
kembali. File tersebut memuat biodata, waktu pendaftaran/verifikasi wajah, dan
template wajah terenkripsi pada kolom tersembunyi `Data Wajah Terenkripsi`.
Jangan mengubah ciphertext. Sistem tujuan wajib menggunakan nilai
`FACE_DATA_SECRET` yang sama. Password tidak pernah diekspor; akun yang dibuat
ulang memakai password awal sama dengan User ID, sedangkan password akun yang
masih ada dipertahankan.

## Migrasi data produksi bila dump tersedia

Jika Anda memiliki database MySQL aktif atau file dump terpisah:

1. Ekspor tabel `users`, `mahasiswas`, dan `paslons` dari phpMyAdmin/Adminer.
2. Jangan mengunggah dump yang mengandung password ke layanan publik.
3. Ekspor akun ke `.xlsx` atau `.csv` dua kolom untuk halaman `/excel`.
4. Migrasi biodata, pilihan, dan total suara memerlukan transformasi khusus agar
   foreign key tetap konsisten. Lakukan pada salinan/branch Neon terlebih dahulu.
5. Cocokkan jumlah pemilih yang telah memilih dengan total suara kandidat sebelum
   mengganti database produksi.

Sistem login juga dapat memverifikasi password teks lama sekali dan langsung
mengubahnya menjadi bcrypt, tetapi impor melalui `/excel` tetap merupakan jalur
yang direkomendasikan.

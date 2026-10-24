# Panduan IKA v10 — Suara Rahasia, Log Audit, dan Hak Suara Khusus Pemilih

v10 adalah proyek, repositori, dan database **terpisah** dari v9. v9 (folder
`evoting-ika-unpad-claude`, repo `ika-v9`, database Neon lama) tidak diubah sama sekali,
sehingga selalu dapat dipakai kembali.

## 1. Ringkasan perubahan

| Kode | Masalah di v9 | Perbaikan di v10 |
| --- | --- | --- |
| **K1** Suara rahasia | Tabel `voters` menyimpan `user_id` + `candidate_id`; admin dapat melihat, memfilter, dan mengekspor "siapa memilih siapa". | Tabel `voters` diganti `ballots`: hanya `candidate_id`, id UUID acak, tanpa waktu. Kolom/filter "Calon Terpilih" dan kolom "Calon Pilihan" di ekspor dihapus. `candidates.updated_at` tidak lagi diubah saat suara masuk agar waktu tidak dapat dicocokkan dengan pemilih. |
| **K2** Jejak audit | Admin dapat mereset/menghapus suara tanpa jejak; tidak ada log. | Tabel `admin_audit_log` mencatat login admin, tambah/ubah/hapus akun, reset wajah, tambah/ubah/hapus kandidat, impor, dan ekspor — ditulis dalam statement SQL yang sama dengan aksinya. Fitur **reset hak pilih dihapus**; akun yang sudah memilih **tidak dapat dihapus** dan role-nya tidak dapat diubah. `ballots` dan `admin_audit_log` *append-only*. Menu baru **Log Audit** menampilkan riwayat dan rekonsiliasi suara. |
| **K3** Hak suara | Larangan admin memilih hanya di tampilan; API tetap menerima suara admin. | `/api/vote`, `castVote` (SQL), dan seluruh API verifikasi wajah hanya menerima role `Alumni`. Admin tidak dapat mengubah role dirinya sendiri. |

Yang **tidak** berubah: verifikasi wajah (model ArcFace, ambang 0.42, satu kali pindai),
tampilan pemilih, pendaftaran, login, dan halaman hasil.

## 2. Instalasi

### 2.1 Database Neon baru

1. Buka [console.neon.tech](https://console.neon.tech) → **New Project** (misalnya `ika-v10`).
2. Salin *connection string* (format `postgresql://...?sslmode=require`).
3. Buka **SQL Editor** project tersebut, salin seluruh isi `database/neon-manual.sql`, lalu **Run**.
   Hasil akhir harus menampilkan 5 tabel.

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

### 2.4 Menjalankan dan deploy

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

## 5. Batasan yang perlu dicatat di skripsi

1. **Administrator database** (pemilik project Neon) masih dapat menonaktifkan trigger, dan
   secara teori dapat mengaitkan surat suara dengan pemilih melalui metadata transaksi PostgreSQL
   (misalnya kolom sistem `xmin` atau urutan fisik baris). v10 melindungi kerahasiaan terhadap
   administrator **aplikasi**, bukan terhadap administrator infrastruktur. Perlindungan penuh
   membutuhkan skema kriptografis (mis. *blind signature* atau *homomorphic tally*).
2. Admin masih dapat mereset password dan wajah seorang pemilih lalu masuk sebagai pemilih itu.
   v10 **mencatat** setiap reset tersebut di log audit sehingga dapat dideteksi, tetapi belum
   **mencegahnya**. Pencegahan penuh memerlukan status pemilu (dibuka/ditutup) yang mengunci
   reset selama pemungutan suara (rekomendasi T1).
3. Log audit hanya mencatat tindakan administrator, bukan tindakan pemilih, dan tidak pernah
   mencatat pilihan kandidat.

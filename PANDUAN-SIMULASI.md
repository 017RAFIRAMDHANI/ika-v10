# Panduan Simulasi Pemilih (IKA v10)

Untuk mengisi grafik dan persentase hasil dengan banyak pemilih, misalnya untuk presentasi atau
sidang, tanpa membuat akun dengan wajah sendiri (aturan **1 akun = 1 wajah**). Setiap pemilih
simulasi memakai wajah sintetis yang berbeda-beda, sehingga aturan itu tetap dipatuhi. Seluruh
pemeriksaan server (token tantangan, liveness, pencocokan ArcFace, larangan memilih dua kali)
tetap berlaku.

Dibutuhkan dua jendela: **browser** (panel admin `ika-v10.vercel.app`) dan **terminal** (untuk
menjalankan skrip).

---

## Persiapan (sekali saja)

1. Buka **VS Code** → **File → Open Folder** → pilih folder `ika-v10`.
2. Buka terminal: **Terminal → New Terminal** (pastikan posisinya di folder `ika-v10`).
3. Pastikan file `.env.local` ada di folder itu. Skrip mengambil alamat database dan Kode Primary
   dari file tersebut.

---

## Langkah simulasi

### Langkah 1 — Pastikan status Persiapan (browser)

Panel admin → menu **Pemilu**. Status harus **Persiapan & Aktivasi**. Bila belum:

- tekan **Kembali ke Persiapan** (bila belum ada suara), atau
- tekan **Reset Uji Coba** (bila sudah ada suara).

### Langkah 2 — Daftarkan pemilih simulasi (terminal)

```bash
node --env-file=.env.local scripts/simulasi/daftar-pemilih.mjs 100
```

Angka `100` adalah jumlah pemilih (boleh diganti, misalnya `50`). Waktu sekitar 4–6 menit. Tampil:

```
terdaftar 10 pemilih
terdaftar 20 pemilih
...
SELESAI: 100 pemilih simulasi siap.
```

> ⚠️ **Jangan tekan Buka Sekarang sebelum muncul `SELESAI`.** Begitu pemilu dibuka, pendaftaran
> langsung tertutup. Bila terlanjur dibuka: tekan **Kembali ke Persiapan**, lalu jalankan perintah
> yang sama lagi (skrip melanjutkan dari pemilih yang sudah ada).

### Langkah 3 — Siapkan pemungutan suara (terminal)

```bash
node --env-file=.env.local scripts/simulasi/pilih-acak.mjs
```

Tampil `menunggu Buka Sekarang ...`. Biarkan terminal tetap terbuka.

### Langkah 4 — Buka pemilu (browser)

Menu **Pemilu** → tekan **Buka Sekarang**. Dalam 5 detik terminal mulai menampilkan:

```
pemungutan suara DIBUKA, mulai memilih
10 suara masuk
20 suara masuk
...
```

Untuk 100 pemilih sekitar 8–10 menit.

### Langkah 5 — Lihat hasilnya

Buka menu **Hasil** dan refresh sesekali; suara dan grafik persentase bertambah. Di akhir terminal
menampilkan rekap, misalnya:

```
Kandidat 01 ...: 35 | 35 | 35
Kandidat 02 ...: 38 | 38 | 38
akun sudah memilih: 100; gagal: 0
```

Tiga angka sama = pilihan skrip, penghitung, dan surat suara di database cocok. Menu **Audit**
menunjukkan **Konsisten**.

---

## Bersih-bersih setelah selesai

### Langkah 6 — Hapus semua suara (browser)

Menu **Pemilu** → **Reset Uji Coba** → ketik `RESET UJI COBA` → OK.

### Langkah 7 — Hapus akun simulasi (Neon)

1. Buka **console.neon.tech** → project **v10** → **SQL Editor**.
2. Di VS Code buka `database/hapus-akun-simulasi.sql`, salin **seluruh isinya**, tempel ke SQL Editor.
3. Tekan **Run** → hasil `akun_dihapus` sesuai jumlah pemilih simulasi.

Database kembali bersih (akun alumni asli tidak tersentuh; hanya akun ber-NIM `SIMULASI-` yang
belum memilih yang dihapus, dan penghapusannya tercatat di log audit).

---

## Bila ada pesan

| Pesan | Artinya |
| --- | --- |
| `Status pemilu bukan Persiapan` | Lakukan Langkah 1 dulu. |
| `Kode Primary DPT ditolak` | Kode Primary di `.env.local` berbeda dengan di Vercel; samakan. |
| `pemilu dibuka sebelum pendaftaran selesai` | Tekan Kembali ke Persiapan, ulangi Langkah 2. |
| Ingin menghentikan skrip | Tekan **Ctrl + C** di terminal. |

---

## Catatan

- **Tips presentasi:** jalankan Langkah 1–4 sebelum sesi dimulai, sehingga grafik sudah terisi saat
  ditampilkan.
- **Hari H:** setelah pemilu **sungguhan** dibuka, jangan menekan Reset Uji Coba dan jangan
  menjalankan skrip simulasi.
- Untuk mencoba di aplikasi lokal, tambahkan URL di akhir perintah, misalnya
  `... daftar-pemilih.mjs 20 http://localhost:3000` dan `... pilih-acak.mjs http://localhost:3000`.
- Kode login dan wajah sintetis hasil skrip disimpan di `scripts/simulasi/.hasil/` (tidak ikut ke
  GitHub).
- Hasil uji sebelumnya: 100 pemilih di `ika-v10.vercel.app`, 100/100 berhasil, sekitar 5 detik per
  pemilih, rekonsiliasi konsisten.

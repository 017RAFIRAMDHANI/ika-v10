# Arsitektur verifikasi wajah V4

## Profil descriptor

V4 tidak menganggap perangkat sebagai identitas. Identitas tetap wajah yang
didaftarkan pada akun, sedangkan profil hanya menentukan pipeline descriptor
yang konsisten.

| Role | Engine | Model | Kegunaan |
| --- | --- | --- | --- |
| `canonical-cross-device` | `human-wasm-v1` | ArcFace v2 | Semua pendaftar baru, PC dan HP |
| `canonical-cross-device` | `human-wasm-v1` | faceres v1 | Akun lama (hanya verifikasi) |
| `desktop-primary` | `human-webgl-v1` | faceres v1 | Akun lama (hanya verifikasi) |
| `mobile-primary` | `human-wasm-v1` | faceres v1 | Akun lama (hanya verifikasi) |

Pada satu percobaan, server mengambil tepat satu record berdasarkan `user_id +
template_role + engine`, memastikan versi modelnya sama dengan pemindaian, lalu
memakai rumus dan ambang milik versi tersebut. Server tidak mencoba template
atau algoritma lain bila hasil gagal.

## Model ArcFace v2 (`human-3.3.6-insightface-efficientnet-b0-aligned-v2`)

1. Human (WASM) mendeteksi wajah, face mesh, iris, anti-spoof, dan liveness
   pada frame persegi 480×480.
2. Lima titik (tengah kedua mata, ujung hidung, kedua sudut bibir) dari face
   mesh diluruskan ke posisi baku ArcFace 112×112 (similarity transform,
   supersampling 2×). Latar belakang dan kemiringan kepala tidak lagi
   memengaruhi descriptor.
3. Model `insightface-efficientnet-b0` (input [-1, 1]) menghasilkan embedding
   512 angka. Embedding beberapa frame "hadap lurus" dirata-rata dan
   dinormalisasi L2.
4. Embedding disimpan di slot descriptor 1024 (sisanya nol), sehingga skema
   database tidak berubah. Server membandingkan dengan cosine similarity.

Model `faceres` tidak lagi dimuat untuk pendaftar baru, sehingga setiap frame
lebih ringan.

### Hasil uji dan ambang

Diuji dengan pipeline yang sama (Human WASM + perataan) pada 896 foto dari 350
orang di LFW. Setiap foto disimulasikan sebagai kamera "PC" dan kamera "HP"
(white balance, eksposur, beauty/blur, resolusi rendah, noise, kompresi JPEG,
distorsi lensa jarak dekat, sedikit kemiringan). Penipu "mirip" diuji dengan
CALFW (pasangan orang berbeda dengan ras dan jenis kelamin sama). Modul browser
juga diuji di Chrome (WASM): hasilnya identik dengan uji Node (cosine 0,999),
tanpa kebocoran tensor.

| Ambang cosine | Wajah sama, foto sama, PC→HP | Wajah sama, foto berbeda, PC→HP | Orang lain lolos (LFW, 798.650 pasang) | Ras+gender sama lolos (CALFW, 3.000) |
| ---: | ---: | ---: | ---: | ---: |
| 0,38 | 100% | 96,1% | 3 | 0 |
| 0,40 | 100% | 95,7% | 0 | 0 |
| **0,42 (bawaan)** | **100%** | **94,8%** | **0** | **0** |
| 0,45 | 100% | 93,0% | 0 | 0 |
| 0,50 | 99,8% | 87,6% | 0 | 0 |

Sebagai pembanding, `faceres` lama dengan ambang 0,68 hanya meloloskan 6% pasangan
"wajah sama, foto berbeda" lintas perangkat (rata-rata skor 0,51). Itulah
penyebab login lintas perangkat sering gagal pada versi sebelumnya.

Skor tertinggi orang lain: 0,384 (LFW) dan 0,335 (CALFW). Ambang bawaan `0.42`
dapat diubah melalui `FACE_ARCFACE_MATCH_THRESHOLD`, tetapi server menolak nilai
di bawah `0.40`. Kegagalan yang jarang terjadi pada pemilik wajah biasanya
teratasi dengan memindai ulang di cahaya depan yang cukup.

## Pendaftaran

- PC maupun HP hanya melakukan satu pemindaian liveness dan menyimpan satu
  template `canonical-cross-device` ArcFace v2 (WASM, preprocessing 480×480).
- Sebelum di-resize, frame dipotong persegi di tengah (sama dengan pratinjau
  kamera) sehingga wajah tidak gepeng pada kamera dengan rasio berbeda
  (webcam 16:9, HP potret). Kamera yang sudah persegi menghasilkan frame identik.
- `desktop-primary` dan `mobile-primary` tidak dibuat lagi untuk pendaftar baru,
  tetapi tetap dipakai untuk akun lama yang sudah memilikinya.
- Foto/video tidak diunggah. Descriptor dikompresi dan dienkripsi AES-256-GCM.
- Challenge bertanda tangan mengikat mode, user, urutan gestur, role, engine,
  versi model, dan kelas perangkat.

## Pengamanan verifikasi (v10.1)

- **Tanpa skor (K5a):** saat wajah tidak cocok, server hanya membalas "tidak cocok" dan sisa
  percobaan. Skor tidak dikirim agar tidak dapat dipakai sebagai petunjuk menebak template.
- **Batas percobaan (K5b):** 5 kali gagal berturut-turut mengunci verifikasi wajah akun tersebut
  selama 15 menit (`FACE_MAX_FAILED_ATTEMPTS`, `FACE_LOCK_MINUTES` di `lib/face.ts`). Verifikasi
  berhasil atau reset wajah oleh admin mengembalikan penghitung ke 0.
- **Wajah ganda (K6b):** saat pendaftaran dan aktivasi, embedding baru dibandingkan dengan seluruh
  template ArcFace aktif milik akun lain dengan ambang yang sama (0.42). Bila cocok, proses ditahan
  dan dicatat di `security_events`; pendaftar tidak diberi tahu akun mana yang mirip.
- **Batasan (K5c):** pemeriksaan liveness berjalan di perangkat pemilih. Lihat bagian Batasan di
  `PANDUAN-V10.md`.

## Login dan bilik suara

- Pendaftar baru selalu diverifikasi dengan `canonical-cross-device` ArcFace v2
  di PC maupun HP.
- Akun lama: desktop memakai `desktop-primary` dan HP memakai `mobile-primary`
  bila tersedia; selain itu memakai `canonical-cross-device` dengan model
  faceres yang tersimpan.
- Akun yang wajahnya direset admin (atau seluruh template lama yang dicabut
  dengan `database/reset-wajah-model-lama.sql`) cukup satu kali pemindaian saat
  membuka bilik suara untuk membuat template ArcFace v2.
- Model wajah dimuat di latar belakang sejak halaman verifikasi dibuka (pada
  pendaftaran sejak langkah biodata) dan disimpan di cache browser, sehingga
  tombol pemindaian langsung siap.
- Login/verifikasi selalu selesai dalam satu pemindaian. Sistem tidak lagi
  membuat template primary perangkat kedua setelah verifikasi berhasil.
- Akun lama yang hanya memiliki satu template primary tidak bisa dipakai lintas
  perangkat sampai mempunyai template canonical.
- Verifikasi sesi berlaku 15 menit dan `POST /api/vote` tetap memeriksa cookie
  sesi bertanda tangan. Status database lama tidak membuka bilik suara.

## Database

Template aktif disimpan pada `user_face_templates`. Partial unique index
memastikan maksimal satu template aktif per user dan role. Reset admin mengisi
`revoked_at`, bukan menghapus riwayat, kemudian mengosongkan
`users.face_verified_at`.

Gunakan database Neon V4 baru dan jalankan `database/neon-manual.sql`. Detail
instalasi, matriks pengujian, backup, dan reset tersedia di
`arsip-versi-lama/PANDUAN-V4-DATABASE-BARU.md`.

## Batasan operasional

Kamera browser memerlukan HTTPS (kecuali `localhost`). Pengujian fisik tetap
wajib pada Android/iPhone dan desktop yang benar-benar digunakan. Sistem ini
adalah kontrol akses biometrik aplikasi, bukan layanan KYC tersertifikasi.

# Integrasi Desain Baru — E-Voting IKA

> **Catatan v10:** dokumen ini berasal dari versi sebelumnya. Untuk instalasi, struktur
> database (tabel `ballots` dan `admin_audit_log`), migrasi dari v9, dan backup, ikuti
> [`PANDUAN-V10.md`](../PANDUAN-V10.md).

Proyek ini menggunakan **sistem/backend dari `voting-ika-nextjs` lama** dan **UI/UX dari paket `new_design`**.

## Prinsip integrasi

- Database Neon/PostgreSQL, query, session cookie, autentikasi, security helper, dan seluruh API Route Handler lama dipertahankan.
- Tidak ada endpoint backend yang dihapus atau diganti.
- Seluruh halaman utama dibuat ulang dengan bahasa visual desain baru: Plus Jakarta Sans, navy `#0B132B`, gold `#F5A623`, card rounded, responsive desktop/mobile, dan bottom navigation mobile.
- Fitur lama yang tidak memiliki mockup di `new_design` tetap dibuatkan UI baru yang konsisten.
- Klaim mockup yang tidak didukung backend (contoh: blockchain/Receipt ID) tidak dimasukkan sebagai data palsu.

## Pemetaan fitur

| Sistem | Route | Status UI baru |
|---|---|---|
| Landing / onboarding | `/` (belum login) | Mengikuti onboarding baru |
| Dashboard pemilih | `/` (sudah login) | Mengikuti user dashboard baru |
| Login pemilih | `/login` | Mengikuti login baru |
| Login admin | `/admin/login` | Adaptasi desain login baru |
| Bilik suara | `/pemilihan` | Mengikuti voting baru + seluruh visi/misi/program lama |
| Status sesudah memilih | `/pemilihan` | Mengikuti success screen baru tanpa receipt palsu |
| Dashboard admin | `/admin` | Mengikuti admin dashboard baru |
| Data Pemilih / DPT | `/datapemilih` | Mengikuti admin voters baru + export lama |
| Detail & reset hak pilih | `/datapemilih/[id]` | UI baru tambahan |
| Kelola kandidat | `/calonketua` | Mengikuti admin candidates baru + form CRUD lengkap |
| Kelola akun | `/admin/users` | UI baru tambahan |
| Import Excel/CSV | `/excel` | UI baru tambahan |
| Hasil suara | `/hasil` | UI baru tambahan, konsisten dengan quick count |

## Backend yang dipertahankan

Folder/file berikut tidak diubah dari proyek lama:

- `app/api/**`
- `lib/db.ts`
- `lib/auth.ts`
- `lib/session.ts`
- `lib/security.ts`
- `database/**`

## Validasi

- `npm run typecheck`: lulus.
- ESLint untuk `app` dan `components`: lulus tanpa warning/error.
- Build produksi pada environment pemeriksaan tidak dapat diselesaikan karena `node_modules` yang dikirim berasal dari Windows dan hanya memiliki `@next/swc-win32-x64-msvc`. Pada Linux, Next.js mencoba mengunduh SWC Linux sementara akses npm tidak tersedia.
- Paket ZIP hasil akhir sengaja tidak menyertakan `node_modules`; jalankan `npm install` pada mesin target agar binary dependency sesuai OS terpasang otomatis.

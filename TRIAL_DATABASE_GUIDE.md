# Panduan Uji Coba ERP Marka Logistik & Database Dummy

Dokumen ini menjelaskan pembaruan desain visual Marka Logistik serta database uji coba awal yang telah disiapkan.

---

## 1. Pembaruan Desain Visual Marka Logistik

Seluruh tampilan pada `frontend-next` telah diselaraskan 100% dengan identitas visual **Marka Logistik** (`bsp_tracking_web`):

1. **Tipografi & Font**:
   - Font resmi diganti dari Fira Sans menjadi **Inter** (`Inter:wght@300;400;500;600;700;800`).
   - Dimuat melalui `app/inter.css` dan dikonfigurasi pada `tailwind.config.ts` serta `globals.css`.

2. **Bentuk & Perilaku Sidebar (`Sidebar.tsx`)**:
   - **Tema Warna**: Dark Slate (`bg-slate-800`), active item `bg-slate-900` dengan aksen garis kiri Marka Blue (`#4F8CF6`).
   - **Fitur Collapsible**: Mendukung mode Expand (`w-60` / 240px) dan Collapse (`w-[72px]`), dikontrol dengan tombol hamburger khas Marka (`VHamburgerHalf` & `VHamburgerFull`) dan tersimpan otomatis di `localStorage ("sidebar-expanded")`.
   - **Branding Header**: Logo resmi Marka (white logomark dengan rounded background biru) + teks "MARKA Logistik & ERP".
   - **Menu Interaktif**: Navigasi modul terintegrasi RBAC, riwayat Recently Opened, tombol asisten Marbot, chip profil user aktif, serta tombol logout.

3. **Topbar Header (`Topbar.tsx`)**:
   - Ketinggian 64px (`h-16`), latar putih bersih dengan bayangan halus (`shadow-[0_0px_2px_2px_rgba(0,0,0,0.04)]`) dan border bawah `border-slate-200/80`.
   - Breadcrumbs dengan font Inter, shortcut pencarian cepat / Command Palette (`Ctrl+K`), indikator notifikasi (danger pill `#F43F5E`), pemilih context perusahaan, dan dropdown profil pengguna.

4. **Warna Brand & Canvas Aplikasi**:
   - **Primary**: `#4F8CF6` (Hover: `#72A3F8`, Active: `#3F70C5`)
   - **Danger**: `#F43F5E`
   - **Success**: `#10B981`
   - **Canvas Body**: `bg-slate-100` (`#F1F5F9`) untuk kenyamanan mata dan kontras visual yang optimal.

---

## 2. Database Uji Coba & Data Dummy Awal

Untuk memudahkan pengujian fungsional dan UI secara langsung, telah disediakan database uji coba mandiri:

- **File SQLite Siap Pakai**: `trial_erp.db`
- **File Dump SQL**: `trial_dummy_seed.sql`
- **Script Generator/Reset**: `python generate_trial_database.py`

### Entitas Data Dummy yang Tersedia:
- **1 Tenant**: `MARKA_LOGISTIK` (Marka Logistik Multi-Tenant System)
- **1 Company**: `PT Marka Logistik Indonesia` (Code: `MARKA-LOGISTIK`, Tax: `03.881.992.1-512.000`)
- **8 Peran (Roles)**: Super Admin, Company Admin, Director, OM, PM, Finance, CRM Lead, Staff.
- **7 Akun Pengguna Dummy**:
  - Semua akun menggunakan password: **`DummyPass123!`**

| Email | Username | Nama | Role Aktif |
|---|---|---|---|
| `admin@markalogistik.com` | `admin` | System Super Administrator | Super Admin |
| `director@markalogistik.com` | `director` | Hendra Wijaya | Executive Director |
| `om@markalogistik.com` | `melika.om` | Melika Citra Tania | Operational Manager |
| `pm@markalogistik.com` | `arof.pm` | Arof Fudding | Project Manager |
| `finance@markalogistik.com` | `sarah.fin` | Sarah Amanda | Finance Controller |
| `sales@markalogistik.com` | `rian.crm` | Rian Destianto | CRM & Commercial Lead |
| `staff@markalogistik.com` | `budi.ops` | Budi Pratama | Operational Field Staff |

- **4 Proyek Logistik Dummy**:
  - Distribusi Logistik Semen Curah Jalur Pantura (Rp 450.000.000)
  - Pengadaan & Integrasi Fleet GPS Tracker Marka (Rp 180.000.000)
  - Audit Cold Storage & Gudang Logistik Surabaya (Rp 95.000.000)
  - Charter Kargo Kapal Roro Surabaya - Makassar (Rp 320.000.000)
- **5 Tasks Operasional Dummy** dengan status `TODO`, `IN_PROGRESS`, dan `DONE`.
- **3 Requests Dummy** (Permintaan BBM Solar, Maintenance Armada Hino 500, Uang Jalan Pengemudi).
- **3 CRM Leads Dummy** (PT Indofood Sukses Makmur, PT Mayora Indah Tbk, CV Berkah Logistik Nusantara).
- **3 Invoice Dummy** dengan status pembayaran `PAID` dan `UNPAID`.
- **3 Notifikasi Sistem Dummy** untuk uji coba bel notifikasi.

---

## 3. Cara Menjalankan & Menguji Coba

1. **Jalankan Frontend Next.js**:
   ```bash
   cd "D:\projectku\Arsalynt\erp\brain strorming\ERP_NO_NAME_YET\frontend-next"
   npm run dev
   ```
   Buka peramban pada `http://localhost:3000`.

2. **Login ke Sistem**:
   Gunakan salah satu kredensial dummy di atas, misalnya:
   - Email: `admin@markalogistik.com` atau `pm@markalogistik.com`
   - Password: `DummyPass123!`


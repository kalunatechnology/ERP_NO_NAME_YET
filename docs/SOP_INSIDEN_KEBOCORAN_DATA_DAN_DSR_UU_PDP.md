# SOP Operasional: Respons Insiden Kebocoran Data & Penanganan Tiket DSR (SLA 3×24 Jam)

**Dokumen ID:** SOP-GOV-PDP-01  
**Berlaku Untuk:** MarkaSuite / PT Arsalynk Teknologi Indonesia  
**Dasar Hukum:** UU No. 27 Tahun 2022 tentang Pelindungan Data Pribadi (UU PDP) Pasal 46 & PP No. 33 Tahun 2026 Pasal 114  
**Target SLA:** **3×24 jam (72 continuous hours)** termasuk akhir pekan dan hari libur nasional  

---

## 1. Struktur PIC & DPO Siaga (24/7 Continuous SLA)

| Peran | Penanggung Jawab | Tugas Utama | Kontak / Jalur Eskalasi |
| :--- | :--- | :--- | :--- |
| **Data Protection Officer (DPO)** | DPO / Privacy Officer | Validasi dampak UU PDP, persetujuan akhir notifikasi ke Subjek Data & Komdigi, pengawasan SLA 72 jam | `privacy@arsalynk.com` / Hotline DPO |
| **Incident Commander (IC)** | Engineering / CTO Lead | Memimpin triase teknis, isolasi sistem, pencabutan sesi/token, dan koordinasi lintas tim | On-Call Pager / Slack `#sec-incident` |
| **Infrastructure & Security PIC** | DevOps / Backend Lead | Audit log akses, rotasi secret/JWT/API key, forensik database, pemulihan backup | On-Call DevOps |
| **Legal & Compliance PIC** | Legal / Company Admin | Penyusunan & pengiriman laporan resmi ke Komdigi, dokumentasi bukti kepatuhan | Tim Legal PT Arsalynk Teknologi Indonesia |
| **Tenant / Customer Liaison** | Account / Support Lead | Komunikasi kepada Company Admin tenant terdampak & tindak lanjut tiket DSR | Portal `/administration/governance` |

---

## 2. Prosedur Respons Insiden Kebocoran Data (SLA 3×24 Jam)

Seluruh jam dihitung **secara kontinu (72 jam kalender)** sejak insiden pertama kali terdeteksi atau dilaporkan (`T0`).

### Tahap 1: Deteksi, Triase & Isolasi (`T0` s/d `T+2 Jam`)
1. Catat waktu deteksi (`T0`) dan buka tiket insiden prioritas **SEV-1**.
2. Eskalasikan segera ke **Incident Commander** dan **DPO Siaga**.
3. Lakukan containment teknis:
   - Cabut sesi aktif / refresh token terdampak dan blokir IP/kredensial mencurigakan.
   - Rotasi secret terkait (`JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, API key integrasi, atau password database) jika terdapat indikasi kompromi.
   - Aktifkan `maintenance` mode melalui `PUT /api/v1/governance/website-state` bila kebocoran masih berlangsung aktif.

### Tahap 2: Investigasi Forensik & Penilaian Dampak (`T+2 Jam` s/d `T+24 Jam`)
1. Identifikasi ruang lingkup data pribadi yang terdampak:
   - Kategori subjek data (karyawan, admin perusahaan, kontak klien/vendor).
   - Jenis data pribadi (umum vs. spesifik, kredensial, transaksi keuangan).
   - Perkiraan waktu kejadian dan vektor kebocoran (`how & when`).
2. Dokumentasikan kronologi teknis dan langkah mitigasi yang telah diambil.
3. DPO menetapkan apakah insiden wajib dinotifikasikan berdasarkan UU PDP Pasal 46 dan PP 33/2026 Pasal 114.

### Tahap 3: Penyusunan & Pengiriman Notifikasi Tertulis (`T+24 Jam` s/d `T+60 Jam`, Batas Maksimal `T+72 Jam`)
1. Siapkan draf notifikasi resmi menggunakan templat pada **Bagian 4** dan **Bagian 5**.
2. DPO dan Legal melakukan verifikasi kelengkapan 3 unsur wajib Pasal 46 ayat (2) UU PDP:
   - Data pribadi yang terungkap;
   - Kapan dan bagaimana data pribadi terungkap; dan
   - Upaya penanganan dan pemulihan atas terungkapnya data pribadi oleh Pengendali Data Pribadi.
3. Kirim notifikasi tertulis kepada **Subjek Data terdampak** dan **Komdigi** sebelum batas `T+72 jam` (`3×24 jam`).

### Tahap 4: Pemulihan, Audit Pasca-Insiden & Arsip (`T+72 Jam` s/d `T+14 Hari`)
1. Pastikan seluruh celah telah ditutup dan lakukan verifikasi ulang kontrol keamanan (`/administration/governance`).
2. Simpan seluruh bukti pengiriman notifikasi, log forensik, dan laporan *Post-Incident Review (PIR)* minimal 5 tahun.

---

## 3. Prosedur Penanganan Tiket DSR (SLA 3×24 Jam)

Permintaan Hak Subjek Data (**DSR — Data Subject Rights**) mencakup permintaan **Akses (`ACCESS`)**, **Salinan/Portabilitas (`COPY`)**, **Koreksi (`CORRECTION`)**, dan **Penghapusan (`DELETION`)** yang masuk melalui formulir publik `/dsr` (`POST /api/v1/governance/public/dsr`) maupun email `privacy@arsalynk.com`.

1. **Pemantauan Antrean (`T+0` s/d `T+4 Jam`)**
   - DPO / Company Admin memeriksa tab **Antrean DSR (3×24 Jam)** pada `/administration/governance` (`GET /api/v1/governance/dsr`).
   - Sistem menghitung `hours_remaining` terhadap `due_at = created_at + 72 jam` dan menandai `sla_breached` jika melewati batas.
2. **Verifikasi Identitas Pemohon (`T+4 Jam` s/d `T+12 Jam`)**
   - Pastikan email pemohon cocok dengan akun/subjek data di sistem (`iam_user` / catatan tenant).
   - Ubah status tiket menjadi `IN_PROGRESS` melalui `PATCH /api/v1/governance/dsr/:id`.
3. **Eksekusi Permintaan (`T+12 Jam` s/d `T+60 Jam`)**
   - **`ACCESS` / `COPY`:** Ekspor data pribadi terkait dalam format terstruktur yang dapat dibaca (JSON/CSV) dan kirim melalui kanal terenkripsi ke email pemohon terverifikasi.
   - **`CORRECTION`:** Perbarui data yang tidak akurat dan catat perubahan pada `resolution_note`.
   - **`DELETION`:** Hapus atau anonimkan data pribadi apabila tidak bertentangan dengan kewajiban retensi hukum (misal faktur/pajak 10 tahun sesuai UU KUP; jika ditahan karena kewajiban hukum, jelaskan dasar hukumnya di `resolution_note`).
4. **Penutupan Tiket (`<= T+72 Jam`)**
   - Kirim konfirmasi hasil tindak lanjut ke pemohon.
   - Ubah status tiket menjadi `COMPLETED` (atau `REJECTED` beserta dasar hukum yang sah) dan isi `resolution_note` via `PATCH /api/v1/governance/dsr/:id`.

---

## 4. Templat Notifikasi Tertulis ke Subjek Data (Pasal 46 UU PDP)

```text
Subjek: [PENTING] Pemberitahuan Insiden Keamanan Data Pribadi — MarkaSuite / PT Arsalynk Teknologi Indonesia

Yth. Bapak/Ibu [Nama Subjek Data / Pengguna],

Melalui surat elektronik ini, PT Arsalynk Teknologi Indonesia selaku Pengendali/Pengelola Platform MarkaSuite menyampaikan pemberitahuan tertulis sesuai Pasal 46 Undang-Undang Nomor 27 Tahun 2022 tentang Pelindungan Data Pribadi (UU PDP) dan PP No. 33 Tahun 2026 Pasal 114 terkait insiden keamanan data pribadi yang memengaruhi akun Anda.

1. Data Pribadi yang Terungkap:
   [Rincikan jenis data secara spesifik, misalnya: nama lengkap, alamat email kerja, nomor telepon, atau metadata profil. Tegaskan apakah kata sandi/kredensial terenkripsi atau tidak terdampak.]

2. Waktu dan Cara Terungkapnya Data Pribadi:
   Insiden terdeteksi pada [Tanggal, Jam WIB] dan diperkirakan terjadi pada [Rentang Waktu Kejadian]. Berdasarkan investigasi awal kami, akses tidak sah terjadi melalui [jelaskan mekanisme secara faktual, misal: penyalahgunaan kredensial / celah konfigurasi pada komponen X].

3. Upaya Penanganan dan Pemulihan yang Telah Dilakukan:
   - Mengisolasi sistem terdampak dan memutus seluruh sesi akses aktif pada [Tanggal, Jam WIB].
   - Melakukan rotasi kunci keamanan/token dan menambal celah yang ditemukan.
   - Melakukan audit forensik berkelanjutan serta melaporkan insiden ini kepada Kementerian Komunikasi dan Digital (Komdigi).

4. Langkah Pencegahan yang Disarankan bagi Anda:
   - Segera perbarui kata sandi akun Anda dan pastikan MFA (Multi-Factor Authentication) aktif.
   - Waspadai pesan phishing atau permintaan informasi rahasia yang mengatasnamakan MarkaSuite.

Apabila Anda memerlukan informasi lebih lanjut atau ingin mengajukan hak subjek data, silakan hubungi Data Protection Officer (DPO) kami melalui:
- Email: privacy@arsalynk.com
- Formulir DSR Resmi: https://app.markasuite.com/dsr

Hormat kami,
[Nama DPO]
Data Protection Officer
PT Arsalynk Teknologi Indonesia
```

---

## 5. Templat Laporan Notifikasi Tertulis ke Komdigi (UU PDP Pasal 46 & PP 33/2026 Pasal 114)

```text
Kepada Yth.
Direktorat Jenderal Pengawasan Ruang Digital / Otoritas Pelindungan Data Pribadi
Kementerian Komunikasi dan Digital Republik Indonesia (Komdigi)
Di Jakarta

Perihal: Laporan Pemberitahuan Kegagalan Pelindungan Data Pribadi (<= 3×24 Jam)

Dengan hormat,
Sehubungan dengan ketentuan Pasal 46 Undang-Undang Nomor 27 Tahun 2022 tentang Pelindungan Data Pribadi dan Pasal 114 Peraturan Pemerintah Nomor 33 Tahun 2026, kami menyampaikan laporan tertulis atas insiden kegagalan pelindungan data pribadi berikut:

A. IDENTITAS PENGENDALI DATA PRIBADI
- Nama Badan Hukum   : PT Arsalynk Teknologi Indonesia
- Nama Platform/PSE  : MarkaSuite
- Nomor TDPSE        : [Nomor TDPSE Aktif]
- Alamat & Kontak DPO: privacy@arsalynk.com / [Nomor Telepon DPO]

B. RINCIAN INSIDEN (UNSUR WAJIB PASAL 46 AYAT (2) UU PDP)
1. Data Pribadi yang Terungkap:
   - Kategori Subjek Data : [Jumlah perkiraan & kategori subjek data terdampak]
   - Jenis Data Pribadi   : [Daftar field data pribadi yang terdampak]
   - Sifat Data           : [Data Pribadi Umum / Data Pribadi Spesifik]

2. Kapan dan Bagaimana Data Pribadi Terungkap:
   - Waktu Kejadian (Perkiraan) : [YYYY-MM-DD HH:MM WIB]
   - Waktu Terdeteksi (T0)      : [YYYY-MM-DD HH:MM WIB]
   - Kronologi & Vektor         : [Penjelasan teknis ringkas mengenai bagaimana kebocoran terjadi]

3. Upaya Penanganan dan Pemulihan:
   - Tindakan Containment       : [Isolasi layanan, pencabutan sesi/token, rotasi kunci enkripsi]
   - Tindakan Pemulihan         : [Patching, verifikasi restore/integritas data, audit log]
   - Notifikasi ke Subjek Data  : [Status & waktu pengiriman pemberitahuan ke subjek data terdampak]

Demikian laporan ini kami sampaikan dalam tenggat waktu maksimal 3×24 jam. Pembaruan hasil investigasi forensik lanjutan akan kami sampaikan secara berkala apabila diperlukan.

Hormat kami,
[Nama Direktur / DPO]
PT Arsalynk Teknologi Indonesia
```

# Matriks Pemetaan Kontrol Keamanan: Indeks KAMI (Perban BSSN No. 8/2020) & SNI ISO/IEC 27001:2022

**Dokumen ID:** GOV-MAP-KAMI-ISO-01  
**Berlaku Untuk:** MarkaSuite / PT Arsalynk Teknologi Indonesia  
**Standar Acuan:**  
- **Peraturan BSSN No. 8 Tahun 2020** tentang Sistem Pengamanan dalam Penyelenggaraan Sistem Elektronik (**Indeks KAMI**)  
- **SNI ISO/IEC 27001:2022** (Information Security, Cybersecurity and Privacy Protection — Annex A Controls)  

---

## 1. Penentuan Kategori Sistem Elektronik (Indeks KAMI BSSN)

Berdasarkan penilaian mandiri bobot karakteristik Sistem Elektronik pada **Indeks KAMI**:

| Parameter Penilaian Indeks KAMI | Kondisi Aktual MarkaSuite | Penilaian / Indikasi |
| :--- | :--- | :--- |
| **Jumlah Pengguna & Cakupan Layanan** | Platform ERP SaaS multi-tenant B2B (klien perusahaan, karyawan, PIC vendor/pelanggan) | Sedang – Tinggi (bergantung jumlah tenant aktif produksi) |
| **Jenis & Sensitivitas Data** | Mengelola Data Pribadi (IAM, DSR, kontak CRM), data proyek, faktur keuangan, & perpajakan (NPWP) | **Tinggi** |
| **Dampak Kegagalan / Kebocoran Layanan** | Mengganggu operasional bisnis tenant, berisiko pelanggaran UU PDP Pasal 46 & kewajiban denda administratif | **Tinggi** |
| **Keterhubungan Jaringan & Pihak Ketiga** | Terhubung ke internet publik (`app.markasuite.com`), Supabase, OpenRouter LLM, Meta WhatsApp Cloud API | **Tinggi** |

**Kesimpulan Kategori Sistem Elektronik:**  
MarkaSuite direkomendasikan diklasifikasikan sebagai **Sistem Elektronik Kategori TINGGI** (bukan Strategis selama tidak mengelola infrastruktur kritis nasional/perbankan inti, dan di atas Rendah karena memproses data pribadi & keuangan multi-tenant secara daring). Untuk kategori **Tinggi**, target tingkat kematangan minimal Indeks KAMI adalah **Tingkat Kematangan III+ (Terdokumentasi, Diterapkan Konsisten, dan Terukur)**.

---

## 2. Matriks Pemetaan Area Indeks KAMI (Perban BSSN No. 8/2020)

| Area Evaluasi Indeks KAMI | Kontrol & Bukti Implementasi Saat Ini di MarkaSuite | Status | Gap / Aksi Lanjutan untuk Audit |
| :--- | :--- | :---: | :--- |
| **1. Tata Kelola Keamanan Informasi** | - Penetapan peran DPO, Company Admin, Super Admin.<br>- Pemisahan tugas (*Segregation of Duties* / Maker–Checker) di `sod.middleware.ts` & `rbac.middleware.ts`.<br>- Halaman kendali tata kelola `/administration/governance`. | **Terpenuhi Sebagian** | Lengkapi SK formal penunjukan DPO & Komite Keamanan Informasi serta notulen tinjauan manajemen tahunan. |
| **2. Pengelolaan Risiko Keamanan Informasi** | - DPIA formal untuk AI/Marbot & analitik otomatis (`docs/DPIA_MODUL_AI_MARBOT_DAN_ANALITIK_OTOMATIS.md`).<br>- Launch Gate blocker dinamis di `evaluateLaunchReadiness()` (`governance.routes.ts`). | **Terpenuhi Sebagian** | Susun *Risk Register* korporat menyeluruh lintas seluruh aset (bukan hanya modul AI) & lakukan evaluasi risiko 6 bulanan. |
| **3. Kerangka Kerja Keamanan Informasi** | - SOP Respons Insiden & DSR 3×24 jam (`docs/SOP_INSIDEN_KEBOCORAN_DATA_DAN_DSR_UU_PDP.md`).<br>- Kebijakan Masa Retensi PP 33/2026 (`docs/KEBIJAKAN_MASA_RETENSI_DATA_PP_33_2026.md`).<br>- SOP Restore Drill (`docs/SOP_DATABASE_RESTORE_DRILL_PRE_LAUNCH.md`). | **Terpenuhi Sebagian** | Tetapkan dokumen induk Kebijakan Keamanan Informasi (*ISMS Policy*) & prosedur klasifikasi informasi yang ditandatangani Direksi. |
| **4. Pengelolaan Aset Informasi** | - Inventaris ROPA 7 aktivitas (`ROPA-01` s/d `ROPA-07` di `governance.routes.ts`).<br>- Inventaris vendor & aliran data (`docs/AUDIT_VENDOR_TRANSFER_LINTAS_NEGARA_DAN_DPA.md`).<br>- Modul Inventory & Asset Custodian (`ROPA-06`). | **Terpenuhi** | Pertahankan pemutakhiran inventaris aset & lisensi perangkat lunak secara berkala tiap kuartal. |
| **5. Teknologi & Keamanan Informasi** | - Autentikasi cookie `HttpOnly` + `SameSite=Lax` + `Secure` (`session-cookie.ts`), tanpa token di `localStorage`.<br>- MFA TOTP & recovery codes dengan enkripsi `AES-256-GCM` + `ERP_ENFORCE_ADMIN_MFA=true`.<br>- Rate limiting per-IP/per-email & lockout (`auth-rate-limit.middleware.ts`).<br>- Header `Cache-Control: no-store`, `helmet`, CORS whitelist, `iam_field_permission` masking, `secret-scrubber.ts`. | **Terpenuhi Sebagian** | Tambahkan *vulnerability scanning* / pentest independen berkala, SIEM/alerting terpusat untuk anomali log, dan otomasi *purge* retensi. |
| **Suplemen: Pihak Ketiga / Cloud** | - Daftar periksa klausul DPA (lapor insiden < 72 jam, *no-training* AI) di `docs/AUDIT_VENDOR_TRANSFER_LINTAS_NEGARA_DAN_DPA.md`. | **Perlu Dilengkapi** | Kumpulkan salinan DPA tertandatangani & sertifikat SOC 2 / ISO 27001 dari Hostinger, Supabase, Vercel, OpenRouter, dan Meta. |

---

## 3. Matriks Pemetaan Kontrol SNI ISO/IEC 27001:2022 (Annex A)

### A.5 Organizational Controls (Kontrol Organisasional)
| Kode Annex A | Nama Kontrol | Implementasi Aktual MarkaSuite | Status | Gap Sertifikasi |
| :--- | :--- | :--- | :---: | :--- |
| **A.5.1** | *Policies for information security* | SOP Insiden/DSR, Kebijakan Retensi, DPIA, dan Privacy/Terms/Cookie pages. | **Sebagian** | Buat dokumen induk *ISMS Policy* yang disahkan manajemen puncak. |
| **A.5.2 / A.5.3** | *Information security roles & segregation of duties* | `rbac.middleware.ts`, `sod.middleware.ts`, `entitlement.middleware.ts`, isolasi project SPV vs PM/Admin. | **Terpenuhi** | Dokumentasikan matriks RACI keamanan pada SOP internal. |
| **A.5.15 / A.5.18** | *Access control & access rights* | `requireModuleAccess`, `ASSIGNMENT` mode, `permission_overrides`, penugasan project-scoped. | **Terpenuhi** | Jadwalkan *Access Review* berkala setiap kuartal oleh Company Admin. |
| **A.5.19 – A.5.22** | *Supplier relationships & cloud services* | Inventaris vendor & checklist DPA (`docs/AUDIT_VENDOR_TRANSFER_LINTAS_NEGARA_DAN_DPA.md`). | **Sebagian** | Arsipkan DPA & laporan kepatuhan pihak ketiga (SOC 2 / ISO 27001). |
| **A.5.24 – A.5.28** | *Information security incident management* | `docs/SOP_INSIDEN_KEBOCORAN_DATA_DAN_DSR_UU_PDP.md` (SLA 3×24 jam, templat notifikasi, PIC siaga). | **Terpenuhi** | Lakukan simulasi *tabletop exercise* insiden minimal 1 kali per tahun. |
| **A.5.31 / A.5.34** | *Legal compliance & protection of PII* | `governance.routes.ts`, Consent Ledger + SHA-256 hash, Re-consent modal, `/dsr`, `/retention-policy`, DPIA. | **Terpenuhi** | Simpan bukti hasil *restore drill* & tanda tangan DPO secara periodik. |

### A.6 People Controls (Kontrol Sumber Daya Manusia)
| Kode Annex A | Nama Kontrol | Implementasi Aktual MarkaSuite | Status | Gap Sertifikasi |
| :--- | :--- | :--- | :---: | :--- |
| **A.6.1 – A.6.2** | *Screening & Terms and conditions of employment* | Belum terdokumentasi di repositori teknis. | **Perlu Dilengkapi** | Siapkan klausul NDA/kerahasiaan data & *background check* pada kontrak HR. |
| **A.6.3** | *Information security awareness, education and training* | Prosedur tertulis tersedia untuk developer/admin di `docs/`. | **Perlu Dilengkapi** | Adakan pelatihan keamanan & UU PDP tahunan beserta daftar hadir sebagai bukti audit. |

### A.7 Physical Controls (Kontrol Fisik)
| Kode Annex A | Nama Kontrol | Implementasi Aktual MarkaSuite | Status | Gap Sertifikasi |
| :--- | :--- | :--- | :---: | :--- |
| **A.7.1 – A.7.4** | *Physical security perimeters & monitoring* | Infrastruktur produksi dikelola oleh penyedia cloud (Hostinger / Supabase / Vercel). | **Tergantung Vendor** | Lampirkan sertifikasi keamanan fisik/ISO 27001/SOC 2 dari penyedia hosting. |
| **A.7.7 – A.7.9** | *Clear desk, clear screen & security of assets off-premises* | Aturan pembersihan file dump lokal di `SOP_DATABASE_RESTORE_DRILL_PRE_LAUNCH.md`. | **Perlu Dilengkapi** | Terbitkan kebijakan perangkat kerja (*endpoint encryption*, auto-lock screen, anti-malware). |

### A.8 Technological Controls (Kontrol Teknologi)
| Kode Annex A | Nama Kontrol | Implementasi Aktual MarkaSuite | Status | Gap Sertifikasi |
| :--- | :--- | :--- | :---: | :--- |
| **A.8.5** | *Secure authentication* | Cookie `HttpOnly`/`Secure`/`SameSite=Lax`, MFA TOTP + recovery codes (`ERP_ENFORCE_ADMIN_MFA=true`), lockout 5× gagal & rate limiting per-IP/email (`auth-rate-limit.middleware.ts`). | **Terpenuhi** | Aktifkan `NODE_ENV=production` / `COOKIE_SECURE=true` saat deploy live. |
| **A.8.8** | *Management of technical vulnerabilities* | Validasi Zod, `helmet`, `tsc --noEmit`, unit tests (`auth-security.unit.ts`, `governance-readiness.unit.ts`). | **Sebagian** | Tambahkan `npm audit` di CI/CD serta *penetration testing* pihak ketiga tahunan. |
| **A.8.11** | *Data masking* | `iam_field_permission` masking (`policy.service.ts`), `secret-scrubber.ts` (`[REDACTED_SECRET]`), masking secret integrasi. | **Terpenuhi** | Perluas uji otomatis masking PII pada payload prompt LLM. |
| **A.8.13** | *Information backup* | `docs/SOP_DATABASE_RESTORE_DRILL_PRE_LAUNCH.md` (prosedur `pg_dump`, `pg_restore`, verifikasi checksum & `prisma migrate status`). | **Sebagian** | Dokumentasikan eksekusi *restore drill* aktual & bukti log backup otomatis terjadwal. |
| **A.8.15** | *Logging* | `core_audit_event`, `gov_consent_ledger`, `writeSupervisorAudit`, log keamanan auth. | **Terpenuhi Sebagian** | Integrasikan agregasi log terpusat (SIEM) & retensi log *tamper-evident*. |
| **A.8.24** | *Use of cryptography* | TLS in-transit, `bcrypt`/hashing password, `AES-256-GCM` untuk secret MFA & integrasi CRM, `SHA-256` hash dokumen legal. | **Terpenuhi** | Tetapkan jadwal rotasi kunci (`JWT_*_SECRET`, `CRM_INTEGRATION_ENCRYPTION_KEY`) tahunan. |
| **A.8.25 – A.8.28** | *Secure development lifecycle & coding* | Isolasi `tenant_id`/`company_id`, parameterized queries / Prisma ORM, pemisahan environment `.env`. | **Terpenuhi Sebagian** | Dokumentasikan checklist *Secure SDLC & Code Review* sebelum rilis produksi. |

---

## 4. Ringkasan Prioritas Pemenuhan Sebelum Audit Sertifikasi
1. **Dokumen Organisasional & SDM (A.5.1, A.6.1–A.6.3):** Pengesahan *ISMS Policy*, NDA karyawan, dan bukti pelatihan kesadaran keamanan/UU PDP.
2. **Kontrak Sub-Prosesor (A.5.19–A.5.22):** Pengumpulan DPA & sertifikat SOC 2/ISO 27001 dari Supabase, Hostinger, Vercel, OpenRouter, dan Meta.
3. **Bukti Operasional Berkelanjutan (A.8.8, A.8.13, A.8.15):** Hasil *Restore Drill* tertandatangani, laporan *Vulnerability Assessment / Penetration Testing* (VAPT), dan pemantauan log/alerting terpusat.

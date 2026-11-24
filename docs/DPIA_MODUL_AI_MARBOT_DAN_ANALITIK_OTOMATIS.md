# DPIA (Data Protection Impact Assessment): Modul AI / Marbot & Fitur Analitik / Scoring Otomatis

**Dokumen ID:** GOV-DPIA-AI-01  
**Berlaku Untuk:** MarkaSuite / PT Arsalynk Teknologi Indonesia  
**Dasar Hukum:** UU No. 27 Tahun 2022 tentang Pelindungan Data Pribadi (UU PDP) Pasal 10 (Keputusan Otomatis), Pasal 34 (Penilaian Dampak Pelindungan Data Pribadi / DPIA), Pasal 56 (Transfer Lintas Negara) & PP No. 33 Tahun 2026  

---

## BAGIAN I — TEMPLATE PENILAIAN DAMPAK PELINDUNGAN DATA PRIBADI (DPIA)

> Gunakan templat ini setiap kali mengembangkan atau mengubah fitur berisiko tinggi (pemrosesan otomatis, AI/LLM, analitik/profiling, atau transfer lintas negara).

1. **Identitas Proyek / Fitur:** Nama modul, penanggung jawab (*Product/Engineering Owner*), dan tanggal penilaian.
2. **Deskripsi Pemrosesan & Tujuan:** Apa data yang diproses, siapa subjek datanya, dan apa dasar hukumnya (UU PDP Pasal 20).
3. **Aliran Data (*Data Flow*):** Sumber data, prosesor internal, API eksternal/LLM pihak ketiga, serta lokasi negara server.
4. **Evaluasi Kebutuhan & Proporsionalitas:** Apakah data pribadi benar-benar dibutuhkan atau dapat diminimalkan/dimasking.
5. **Penilaian Risiko & Mitigasi:** Nilai *Likelihood* × *Impact* (Rendah/Sedang/Tinggi) sebelum dan sesudah mitigasi.
6. **Kontrol Keputusan Otomatis (*Human-in-the-Loop*):** Hak subjek data untuk tidak tunduk pada keputusan otomatis penuh dan mekanisme tinjauan manusia (UU PDP Pasal 10).
7. **Keputusan & Tanda Tangan DPO:** Persetujuan peluncuran (`Approved` / `Approved with Conditions` / `Rejected`).

---

## BAGIAN II — HASIL PENILAIAN DPIA AKTUAL: MODUL AI / MARBOT & ANALITIK OTOMATIS

### 1. Identitas & Ruang Lingkup
- **Modul Dinilai:** `backend-express/src/modules/marbot/` (Marbot Native/External Runtime, Knowledge Engine, Retrieval Gateway, MiniLLM) serta fitur analitik/scoring operasional proyek & CRM.
- **Kategori Subjek Data:** Karyawan, Staff, Supervisor, Project Manager, Admin Perusahaan, serta PIC Klien/Vendor yang tercantum pada catatan operasional.
- **Dasar Hukum:** Pelaksanaan perjanjian layanan & kepentingan yang sah dengan pembatasan akses RBAC (UU PDP Pasal 20), serta persetujuan eksplisit & DPA Pasal 56 untuk pemrosesan via API LLM eksternal.

---

### 2. Aliran Data ke API AI (`Data Flow`)

```text
[Pengguna Terautentikasi (HttpOnly JWT)]
        │
        ▼
[Express RBAC & Company Scope Guard]
  - Verifikasi tenant_id, company_id, dan role aktif
        │
        ▼
[Policy & Minimization Layer]
  - `brain/security/policy.service.ts`: cek `iam_field_permission` (`can_view`, `masking_type`)
    dan blokir modul/kolom bertanda masked (`blockedReadModules`)
  - `knowledge-engine/crawler/secret-scrubber.ts`: redaksi token/password -> `[REDACTED_SECRET]`
        │
        ├──► (Jika MARBOT_AI_API_KEY kosong / mode deterministik)
        │       └─► Sintesis lokal deterministik di server ERP (tanpa keluar jaringan)
        │
        └──► (Jika API LLM aktif)
                └─► HTTPS/TLS ke OpenRouter (`https://openrouter.ai/api/v1/chat/completions`)
                    Model: `google/gemini-2.0-flash-001` / `openai/gpt-4o-mini` (Server AS/Global)
                    *Prompt + konteks terfilter dikirim untuk inferensi, respons dikembalikan ke UI*
```

---

### 3. Matriks Risiko Privasi & Mitigasi

| No | Risiko Privasi | Tingkat Awal | Mitigasi Teknis & Organisasional | Risiko Residu |
| :---: | :--- | :---: | :--- | :---: |
| 1 | **Pengiriman PII / Data Sensitif Mentah ke LLM Eksternal (OpenRouter/AS)** | **Tinggi** | 1. Penerapan `iam_field_permission` melalui `policy.service.ts` agar field sensitif/masked tidak diekspos ke konteks AI.<br>2. Pembersihan kredensial oleh `secret-scrubber.ts` (`[REDACTED_SECRET]`).<br>3. Minimisasi prompt: kirim ID/agregat/ringkasan alih-alih NIK, NPWP, atau nomor rekening mentah.<br>4. Kontrak DPA dengan klausul *zero-retention / no-training* sehingga prompt tidak dipakai melatih model publik. | **Rendah** |
| 2 | **Kebocoran Data Lintas Tenant / Bypass RBAC via Prompt Injection** | **Tinggi** | 1. Penegakan isolasi `tenant_id` & `company_id` pada level query database dan middleware sebelum prompt disusun.<br>2. Jika menggunakan koneksi eksternal, akses dibatasi ke `CHATBOT_ERP_READONLY_DATABASE_URL` (hanya `SELECT` pada view `ai_*`) dan diverifikasi dengan HMAC signature (`inboundContextSecret` / `outboundToolSecret`). | **Rendah** |
| 3 | **Transfer Data Lintas Negara Tanpa Pelindungan Memadai (Pasal 56 UU PDP)** | **Tinggi** | 1. Pengungkapan eksplisit transfer lintas negara ke OpenRouter (AS) di `/privacy-policy`.<br>2. Perjanjian DPA/SCC dengan vendor LLM, enkripsi TLS in-transit, dan opsi fallback deterministik lokal bila tenant menonaktifkan AI eksternal. | **Rendah** |
| 4 | **Keputusan Otomatis / Scoring yang Merugikan Tanpa Tinjauan Manusia (Pasal 10 UU PDP)** | **Sedang–Tinggi** | Mekanisme *Human-in-the-Loop* wajib (lihat Bagian 4 di bawah). Tidak ada keputusan otomatis final yang mengikat secara hukum atau kepegawaian. | **Rendah** |
| 5 | **Retensi Berlebihan pada Riwayat Prompt & Log AI** | **Sedang** | Pembatasan masa retensi riwayat percakapan AI maksimal **1 tahun** dan anonimisasi `user_id` pada log analitik sesuai [KEBIJAKAN_MASA_RETENSI_DATA_PP_33_2026.md](file:///d:/projectku/Arsalynt/erp/brain%20strorming/ERP_NO_NAME_YET/docs/KEBIJAKAN_MASA_RETENSI_DATA_PP_33_2026.md). | **Rendah** |

---

### 4. Mekanisme Tinjauan Manusia atas Keputusan Otomatis (UU PDP Pasal 10)
Untuk mematuhi hak subjek data agar tidak tunduk pada keputusan yang sepenuhnya didasarkan pada pemrosesan otomatis (*profiling/scoring*):
1. **Sifat Advisory (Pendukung Keputusan):** Seluruh keluaran Marbot AI, ringkasan progres, maupun indikator/scoring analitik proyek & CRM **hanya berfungsi sebagai rekomendasi informasi**, bukan eksekutor final.
2. **Persetujuan Eksplisit Manusia (*Human-in-the-Loop*):**
   - Perubahan status persetujuan (mis. *Approve/Reject Weekly Target*, pencairan dana, persetujuan pengadaan, penutupan tiket DSR) wajib dieksekusi langsung oleh pejabat berwenang (PM, SPV, OM, Finance, atau DPO) melalui aksi UI yang tercatat di audit log.
   - Evaluasi kinerja karyawan atau penilaian kelayakan kredit/prospek klien **tidak boleh** diputuskan semata-mata dari skor otomatis tanpa verifikasi manajer/tim terkait.
3. **Hak Keberatan & Penjelasan:** Subjek data berhak meminta penjelasan logika ringkas atas hasil analitik/scoring dan mengajukan peninjauan ulang manusia melalui DPO (`privacy@arsalynk.com`) atau formulir `/dsr`.

---

### 5. Keputusan & Sign-Off DPO

| Parameter | Nilai |
| :--- | :--- |
| **Status Penilaian** | `APPROVED WITH CONDITIONS` (Disetujui dengan syarat masking PII & DPA *no-training* aktif sebelum fitur AI eksternal diaktifkan di produksi) |
| **Tinjauan Berkala Berikutnya** | Setiap 6 bulan atau saat penambahan penyedia LLM / fitur scoring otomatis baru |
| **Penilai (Engineering / Security PIC)** | `[Nama & Tanggal]` |
| **Penyetuju (Data Protection Officer)** | `[Nama DPO & Tanggal]` |

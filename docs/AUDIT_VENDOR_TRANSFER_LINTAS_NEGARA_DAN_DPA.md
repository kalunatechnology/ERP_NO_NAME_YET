# Audit Vendor Pihak Ketiga, Transfer Data Lintas Negara (Pasal 56 UU PDP) & Daftar Periksa DPA

**Dokumen ID:** AUD-GOV-3P-01  
**Berlaku Untuk:** MarkaSuite / PT Arsalynk Teknologi Indonesia  
**Dasar Hukum:** UU No. 27 Tahun 2022 tentang Pelindungan Data Pribadi (UU PDP) Pasal 55–56 & PP No. 33 Tahun 2026  

---

## 1. Inventaris Vendor & Integrasi Pihak Ketiga (`backend-express`)

| No | Vendor / Layanan | Modul & Referensi Kode | Tujuan Pemrosesan & Data Dikirim | Negara / Region Lokasi Server | Status Transfer Lintas Negara |
| :---: | :--- | :--- | :--- | :--- | :--- |
| 1 | **Hostinger (VPS / Node.js Hosting)** | `backend-express/src/config/env.ts`, `server.ts`, `ecosystem.config.js` | Hosting runtime backend Express ERP (`DEPLOYMENT_TARGET=hostinger`). Memproses seluruh request API & sesi terautentikasi. | Indonesia / Singapura (Asia-Pacific) atau sesuai region VPS yang dipilih | Dalam negeri / Lintas batas terbatas (Asia-Pacific) |
| 2 | **Vercel** | `backend-express/src/config/env.ts`, `vercel.json` | Hosting opsional serverless/frontend (`DEPLOYMENT_TARGET=vercel`). | Global Edge Network / Amerika Serikat (AWS `us-east-1` default) | **Ya** (apabila diaktifkan) |
| 3 | **Supabase (PostgreSQL & Supavisor)** | `backend-express/src/config/env.ts`, `postgres.ts` | Penyimpanan database utama (`SUPABASE_DIRECT_URL`, `SUPABASE_POOLER_URL`) seluruh data IAM, Governance, Proyek, CRM, Finance, Inventory. | Singapura (`ap-southeast-1`) atau region proyek Supabase terkait | **Ya** (Singapura / luar Indonesia bila region non-ID) |
| 4 | **OpenRouter AI Gateway** *(Model hulu: Google Gemini / OpenAI)* | `backend-express/src/modules/marbot/brain/models/provider.service.ts`, `planner.service.ts`, `understanding.service.ts`, `knowledge/resource.service.ts`, `knowledge-engine/gateway/retrieval-gateway.service.ts`, `minillm/model-client.ts` | Inferensi AI Marbot & Knowledge Engine (`https://openrouter.ai/api/v1/chat/completions`, default `google/gemini-2.0-flash-001` & `openai/gpt-4o-mini`). Mengirim prompt pengguna & konteks operasional bila `MARBOT_AI_API_KEY` / `OPENROUTER_API_KEY` aktif. | **Amerika Serikat (AS)** & node inferensi global | **Ya** (ke AS / Global) |
| 5 | **Meta Platforms, Inc. (WhatsApp Cloud API)** | `backend-express/src/modules/crm/crm-whatsapp.routes.ts` (`https://graph.facebook.com/...`) | Verifikasi nomor bisnis & sinkronisasi pesan CRM WhatsApp (`phone_number_id`, nomor telepon pelanggan, isi pesan). | **Amerika Serikat (AS)** & Global CDN Meta | **Ya** (ke AS / Global) |
| 6 | **DiceBear API** | `backend-express/src/modules/core/request.service.ts` (`https://api.dicebear.com/7.x/avataaars/svg`) | Generasi URL avatar SVG berbasis seed (`id`/`username`/`email`). | Jerman / Uni Eropa & Global CDN | **Ya** (minimisasi: gunakan `user.id` sebagai seed, hindari email mentah) |

---

## 2. Mekanisme Pelindungan Transfer Lintas Negara (Pasal 56 UU PDP)

Sesuai **Pasal 56 UU PDP**, transfer Data Pribadi ke luar wilayah hukum Republik Indonesia hanya dilakukan apabila salah satu mekanisme berikut terpenuhi:
1. **Kesetaraan Tingkat Pelindungan (Pasal 56 ayat (2)):** Memastikan negara tujuan/region hosting memiliki tingkat pelindungan data pribadi yang setara atau lebih tinggi.
2. **Pelindungan Mengikat secara Hukum / DPA & SCC (Pasal 56 ayat (3)):** Mengikat seluruh sub-prosesor (Supabase, OpenRouter/penyedia LLM, Meta, Hostinger/Vercel) dengan **Data Processing Agreement (DPA)** dan *Standard Contractual Clauses (SCC)* yang menjamin kerahasiaan, keamanan teknis (TLS 1.2+, enkripsi at-rest, AES-256-GCM untuk secret integrasi), dan pembatasan tujuan.
3. **Persetujuan Subjek Data (Pasal 56 ayat (4)):** Apabila mekanisme ayat (2) dan (3) belum terpenuhi, transfer dilakukan hanya setelah memperoleh persetujuan eksplisit dari subjek data melalui Kebijakan Privasi & Consent Ledger (`/login`).

---

## 3. Daftar Periksa Klausul DPA (Data Processing Agreement)

Setiap kontrak dengan vendor/sub-prosesor pihak ketiga wajib memenuhi seluruh butir periksa di bawah ini sebelum diaktifkan di produksi:

| No | Klausul Wajib DPA | Kriteria Verifikasi | Status |
| :---: | :--- | :--- | :---: |
| 1 | **Ruang Lingkup & Instruksi Terbatas** | Prosesor hanya memproses data berdasarkan instruksi tertulis Pengendali (PT Arsalynk Teknologi Indonesia / Tenant), dilarang menjual atau memakai ulang data. | [ ] |
| 2 | **Kewajiban Lapor Insiden Awal < 72 Jam** | Prosesor wajib mengirimkan notifikasi insiden awal kepada DPO (`privacy@arsalynk.com`) **paling lambat 24–48 jam** sejak terdeteksi (di bawah batas 72 jam UU PDP Pasal 46 & PP 33/2026 Pasal 114) agar Pengendali dapat melapor tepat waktu ke Komdigi & Subjek Data. | [ ] |
| 3 | **Larangan Pelatihan Model AI (*No-Training / Zero Retention*)** | Khusus vendor LLM/AI (OpenRouter / OpenAI / Google): payload prompt dan data perusahaan tidak boleh digunakan untuk melatih model publik pihak ketiga. | [ ] |
| 4 | **Keamanan Teknis & Organisasional (TOMs)** | Enkripsi in-transit (TLS 1.2+), enkripsi at-rest (AES-256), kontrol akses *least privilege*, dan isolasi multi-tenant. | [ ] |
| 5 | **Pengendalian Sub-Prosesor** | Daftar sub-prosesor transparan dan kewajiban pemberitahuan sebelumnya sebelum penambahan/penggantian sub-prosesor baru. | [ ] |
| 6 | **Bantuan Pemenuhan Hak Subjek Data (DSR)** | Prosesor wajib membantu Pengendali memenuhi permintaan akses, koreksi, salinan, dan penghapusan data dalam SLA **3×24 jam**. | [ ] |
| 7 | **Penghapusan / Pengembalian Data Pasca-Kontrak** | Kewajiban mengembalikan atau memusnahkan seluruh salinan data pribadi secara aman saat perjanjian berakhir. | [ ] |
| 8 | **Hak Audit & Kepatuhan** | Hak Pengendali untuk meminta laporan audit keamanan (SOC 2 / ISO 27001) atau melakukan audit kepatuhan. | [ ] |

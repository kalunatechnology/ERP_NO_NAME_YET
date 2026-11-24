# SOP Uji Pemulihan Cadangan Database (Restore Drill) Pra-Publikasi

**Dokumen ID:** SOP-OPS-DRILL-01  
**Berlaku Untuk:** MarkaSuite / PT Arsalynk Teknologi Indonesia  
**Prasyarat Gate:** Wajib diselesaikan sebelum mengubah `gov_website_state.status` menjadi `published` pada `/administration/governance`.  

---

## 1. Tujuan & Kriteria Keberhasilan
Memastikan cadangan (backup) database PostgreSQL produksi dapat dipulihkan secara utuh ke environment staging terisolasi tanpa kehilangan data kritis, dengan target:
- **RPO (Recovery Point Objective):** Maksimal 24 jam (atau sesuai jadwal snapshot harian terakhir).
- **RTO (Recovery Time Objective):** Maksimal 60 menit dari mulai unduh backup hingga verifikasi aplikasi selesai.
- **Zero Data Corruption:** Seluruh tabel IAM, Governance (UU PDP), Proyek, dan Keuangan lulus pemeriksaan jumlah baris dan status migrasi Prisma.

---

## 2. Checklist Pra-Publikasi Restore Drill

| No | Item Pemeriksaan | Target / Kriteria Lulus | Status |
| :---: | :--- | :--- | :---: |
| 1 | Backup snapshot terbaru tersedia & terenkripsi | File dump `.dump` / snapshot Supabase tersedia (< 24 jam) | [ ] |
| 2 | Database target uji terisolasi (bukan produksi) | Variabel `DRILL_DATABASE_URL` mengarah ke DB staging/drill kosong | [ ] |
| 3 | Eksekusi `pg_restore` / `psql` selesai tanpa error fatal | Exit code `0` atau hanya warning non-fatal yang terdokumentasi | [ ] |
| 4 | Verifikasi skema migrasi Prisma | `npx prisma migrate status` menunjukkan seluruh migrasi *applied* | [ ] |
| 5 | Verifikasi integritas data tabel inti | `iam_user`, `gov_website_state`, `gov_consent_ledger`, `gov_dsr_request`, `project_project` terbaca normal | [ ] |
| 6 | Uji smoke endpoint backend terhadap DB hasil restore | `GET /health` dan `GET /api/v1/governance/public/status` merespons `200 OK` | [ ] |
| 7 | Pencatatan RPO/RTO & Sign-Off | Waktu mulai, waktu selesai, dan penanggung jawab tercatat | [ ] |

---

## 3. Prosedur & Skrip Uji Pemulihan (PostgreSQL / Supabase)

> **PERINGATAN:** Jangan pernah menjalankan perintah `pg_restore --clean` atau `DROP` terhadap `DATABASE_URL` / `DIRECT_URL` produksi. Gunakan **database staging/drill terpisah**.

### Langkah A: Buat & Verifikasi Backup dari Sumber (Direct URL Port 5432)
```bash
# 1. Set URL sumber (read-only/direct session) dan target drill terisolasi
export SOURCE_DIRECT_URL="postgresql://postgres:<PASSWORD>@<SOURCE_HOST>:5432/postgres?sslmode=require"
export DRILL_DATABASE_URL="postgresql://postgres:<PASSWORD>@<DRILL_HOST>:5432/postgres_drill?sslmode=require"
export BACKUP_FILE="backup_markasuite_$(date +%Y%m%d_%H%M%S).dump"

# 2. Ambil backup format custom terkompresi
pg_dump "$SOURCE_DIRECT_URL" --format=custom --no-owner --no-privileges --file="$BACKUP_FILE"

# 3. Catat checksum SHA-256 artefak backup
sha256sum "$BACKUP_FILE" > "${BACKUP_FILE}.sha256"
```

### Langkah B: Pulihkan ke Database Drill Terisolasi
```bash
# 4. Catat waktu mulai (RTO start)
START_TS=$(date +%s)

# 5. Restore ke database drill
pg_restore \
  --dbname="$DRILL_DATABASE_URL" \
  --clean \
  --if-exists \
  --no-owner \
  --no-privileges \
  --exit-on-error \
  "$BACKUP_FILE"

END_TS=$(date +%s)
echo "RTO Restore Duration: $((END_TS - START_TS)) detik"
```

### Langkah C: Verifikasi Integritas Skema & Data Kritis
```bash
# 6. Verifikasi status migrasi Prisma pada DB hasil restore
cd backend-express
DATABASE_URL="$DRILL_DATABASE_URL" DIRECT_URL="$DRILL_DATABASE_URL" npx prisma migrate status

# 7. Verifikasi jumlah baris tabel kritis (IAM, Governance UU PDP, Proyek)
psql "$DRILL_DATABASE_URL" -c "
SELECT 'iam_user' AS table_name, COUNT(*) AS row_count FROM iam_user
UNION ALL
SELECT 'gov_website_state', COUNT(*) FROM gov_website_state
UNION ALL
SELECT 'gov_legal_document_version', COUNT(*) FROM gov_legal_document_version
UNION ALL
SELECT 'gov_consent_ledger', COUNT(*) FROM gov_consent_ledger
UNION ALL
SELECT 'gov_dsr_request', COUNT(*) FROM gov_dsr_request
UNION ALL
SELECT 'project_project', COUNT(*) FROM project_project;
"
```

### Langkah D: Smoke Test Aplikasi & Pembersihan
1. Jalankan backend secara lokal/staging mengarah ke `DRILL_DATABASE_URL` dan pastikan:
   - `GET /health` mengembalikan status `healthy`.
   - `GET /api/v1/governance/public/status` mengembalikan `website_status`, `legal_entity_name`, `tdpse_number`, dan `active_documents`.
2. Hapus file dump lokal sementara (`rm -f "$BACKUP_FILE" "${BACKUP_FILE}.sha256"`) setelah verifikasi selesai agar data pribadi tidak tertinggal di workstation operator.

---

## 4. Lembar Sign-Off Pra-Publikasi (`published`)

| Parameter | Nilai Tercatat |
| :--- | :--- |
| Tanggal & Waktu Drill | `YYYY-MM-DD HH:MM WIB` |
| Pelaksana (DevOps / Backend PIC) | `[Nama]` |
| Pemeriksa (DPO / Super Admin) | `[Nama]` |
| RTO Tercapai | `[Menit / Detik]` |
| Hasil `prisma migrate status` | `[Up to date / Pass]` |
| Keputusan Launch Gate | `[ ] LAYAK PUBLISH` / `[ ] DITUNDA` |

Setelah status **LAYAK PUBLISH** disetujui dan seluruh blocker pada Launch Gate terpenuhi (TDPSE terisi, dokumen legal aktif, `ERP_ENFORCE_ADMIN_MFA=true`, `NODE_ENV=production`), Super Admin dapat mengubah status website menjadi `published` melalui `/administration/governance`.

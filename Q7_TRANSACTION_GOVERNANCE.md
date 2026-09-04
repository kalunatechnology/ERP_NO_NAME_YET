# Q7 — Transaction Governance & Financial Closing

## Aturan yang diterapkan

- Semua mutation transaksi ERP (`POST`, `PUT`, `PATCH`, `DELETE`) pada modul bisnis wajib membawa `Idempotency-Key` sepanjang 16–128 karakter.
- Kunci, hash payload, status, dan respons disimpan di `core_idempotency_key`. Pengulangan kunci dengan payload sama mengembalikan respons asli; payload berbeda ditolak `409`.
- Record finance berstatus `POSTED`, `PAID`, `CLOSED`, `LOCKED`, `EXECUTED`, atau `REVERSED` tidak dapat diubah/dihapus melalui CRUD. Koreksi wajib memakai reversal/storno resmi.
- Closing memakai tiga tahap: `request` → `approve` oleh Finance → `execute` oleh Finance/direktur yang mempunyai akses modul Finance.
- Requester tidak boleh menjadi approver. Jika company mempunyai minimal dua user Finance, requester, approver, dan executor wajib berbeda. Jika hanya ada satu Finance, approver dan executor boleh sama.
- Role custom mempunyai `company_id`, `custom_code`, dan `is_system=false`. Company Admin tidak boleh membuat role administratif, mengubah role sistem, atau menaikkan permission role yang dipakainya sendiri.
- Permission custom hanya dapat diberikan untuk modul yang telah diaktifkan Super Admin bagi company tersebut.

## Endpoint closing

- `POST /api/v1/finance/period-closings/request`
- `POST /api/v1/finance/period-closings/:id/approve`
- `POST /api/v1/finance/period-closings/:id/execute`

Endpoint closing langsung lama dipertahankan sebagai kontrak kompatibilitas, tetapi menolak eksekusi dan mengarahkan client ke workflow baru.

## Data pengujian

Pengujian otomatis memakai prefix `Q7-TEST` dan wajib menghapus record bisnis sementara di blok cleanup. Record `core_idempotency_key` dipertahankan maksimal 24 jam sebagai bukti teknis replay dan dapat dibersihkan terjadwal setelah `expires_at`.

## Deployment

Migrasi database `20260903080000_q7_transaction_governance` sudah diterapkan. Deployment Vercel tidak dilakukan sesuai instruksi pemilik sistem.

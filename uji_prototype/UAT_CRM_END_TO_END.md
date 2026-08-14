# UAT CRM End-to-End

## Akun

- CRM: membuat inquiry, spesifikasi, estimate, quotation, dan mencatat keputusan customer.
- Executive: memutuskan approval quotation/contract.
- Finance: menghitung atau memeriksa credit status customer.
- Executive/Super User: dapat melihat seluruh company scope.

Pastikan `X-Company-ID` di kanan atas berisi company yang sama untuk seluruh akun.

## Skenario utama

1. Login sebagai CRM, buka **CRM & Sales → Incoming Inquiry**, lalu klik **Tambah inquiry**.
2. Isi subject, customer, email, dan deskripsi. Hasil: inquiry berstatus `NEW` dengan nomor otomatis.
3. Klik **Spesifikasi**, masukkan deskripsi produk, quantity, dan target harga.
4. Klik **Qualify**. Hasil: opportunity dibuat dan inquiry menjadi `QUALIFIED`.
5. Buka **Estimating & Quoting**, klik **Buat estimate**, pilih inquiry, isi markup dan contingency.
6. Klik **Tambah biaya** satu atau beberapa kali, lalu **Hitung**. Hasil: `total_cost`, `offered_amount`, dan `margin_percent` dihitung backend.
7. Klik **Buat quotation**. Ulangi sekali untuk memastikan quotation tidak terduplikasi.
8. Klik **Minta approval**. Hasil: quotation `PENDING_APPROVAL` dan masuk queue Executive.
9. Login sebagai Executive. Buka **Data Explorer → Executive Approvals**, pilih record dan jalankan action `decide` dengan `decision=APPROVED`.
10. Login kembali sebagai CRM, klik **Kirim**, isi email customer. Hasil: delivery audit tercatat dan quotation `SENT`.
11. Klik **Accept**. Hasil: quotation `ACCEPTED`, opportunity `WON`, dan sales cycle berhenti.
12. Buka **Data Explorer → Quotations**, jalankan command konversi quotation ke order. Hasil: Sales Order terbentuk dan siap masuk flow Project Management.

## Skenario negatif wajib

- Qualify tanpa spesifikasi harus ditolak.
- Membuat quotation sebelum estimate dihitung harus ditolak.
- Mengirim quotation sebelum approval harus ditolak.
- User non-Executive tidak boleh memutuskan approval.
- Customer decision sebelum quotation dikirim harus ditolak.
- Menjalankan pembuatan quotation dua kali dari estimate yang sama harus mengembalikan quotation yang sama.

## Bukti kelulusan

Simpan ID/nomor berikut dari setiap tahap: inquiry, opportunity, estimate, quotation, approval, quotation delivery, dan sales order. Periksa **Request Log** untuk response HTTP dan **CRM Workflow Events** untuk audit trail.

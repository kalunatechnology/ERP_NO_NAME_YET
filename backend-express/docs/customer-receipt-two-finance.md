# Penerimaan pelanggan dengan dua pengguna Finance

Finance pertama mencatat penerimaan sebagai DRAFT lalu mengajukannya. Finance kedua memeriksa transaksi dan menekan **Setujui & Posting**. Penyetuju boleh sekaligus membukukan penerimaan, sehingga Finance ketiga tidak diperlukan.

- `POST /payments/{id}/submit` untuk penerimaan pelanggan dijalankan pembuat transaksi.
- `POST /customer-receipts/{id}/approve-and-post` mengubah SUBMITTED menjadi APPROVED lalu POSTED dalam satu transaksi Serializable. `approved_by_id` dan `executed_by_id` mencatat Finance kedua, dengan timestamp masing-masing.
- Jika posting gagal, approval dan semua perubahan jurnal/alokasi/piutang dibatalkan; transaksi tetap SUBMITTED dan dapat dicoba kembali.
- Pembuat penerimaan tidak dapat menyetujui atau memposting transaksinya sendiri, termasuk lewat endpoint lama. Data lama yang tidak memiliki pembuat menggunakan pengaju sebagai identitas pembuat untuk pemeriksaan ini.
- Endpoint approve dan post terpisah tetap tersedia untuk transaksi APPROVED lama serta kewenangan Director yang sudah ada. Finance penyetuju dapat memposting tanpa orang ketiga. Pembatasan khusus ini berlaku pada penerimaan pelanggan; alur pembayaran vendor tetap mengikuti aturan sebelumnya.
- Posting ulang terhadap penerimaan POSTED mengembalikan hasil yang sama tanpa jurnal atau pembayaran piutang ganda. Company scope, periode fiskal, rekening penerima, invoice, valuta, dan batas sisa piutang tetap divalidasi.

Verifikasi memakai fixture, tanpa koneksi atau perubahan database ERP:

```powershell
node node_modules/ts-node/dist/bin.js --files tests/customer-receipt.workflow.http.unit.ts
node node_modules/ts-node/dist/bin.js --files tests/customer-receipt.http.unit.ts
```

Pengujian browser `tests/minor-forms.browser.js` memakai runtime Playwright melalui `MARBOT_TEST_RUNTIME_PACKAGES` dan memverifikasi Finance pertama mengajukan, Finance kedua menyetujui/membukukan, error posting yang dapat dicoba ulang, serta KPI dan mutasi kas setelah POSTED.

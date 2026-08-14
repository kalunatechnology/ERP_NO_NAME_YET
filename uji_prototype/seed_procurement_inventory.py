import json
import logging
import requests
from typing import Dict, Any, Optional

# Setup Logging
logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S"
)
logger = logging.getLogger("ERPSeederStage5")

class ERPSeederStage5Runner:
    def __init__(self, base_url: str, username: str, password: str, state_file: str = "seeding_state.json"):
        self.base_url = base_url.rstrip('/')
        self.username = username
        self.password = password
        self.state_file = state_file
        self.access_token: Optional[str] = None
        self.state: Dict[str, Any] = self._load_state()

    def _load_state(self) -> Dict[str, Any]:
        """Membaca state UUID dari Tahap 1 hingga 4"""
        try:
            with open(self.state_file, "r") as f:
                data = json.load(f)
                logger.info(f"State file '{self.state_file}' berhasil dimuat.")
                return data
        except FileNotFoundError:
            logger.error(f"File '{self.state_file}' tidak ditemukan! Jalankan Tahap 1 s/d 4 terlebih dahulu.")
            raise

    def _save_state(self):
        """Menyimpan pembaruan state UUID ke file JSON"""
        with open(self.state_file, "w") as f:
            json.dump(self.state, f, indent=2)
        logger.info(f"State terbaru berhasil diperbarui di '{self.state_file}'.")

    def _get_headers(self, company_id: Optional[str] = None) -> Dict[str, str]:
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.access_token}"
        }
        if company_id:
            headers["X-Company-ID"] = company_id
        return headers

    def authenticate(self) -> bool:
        url = f"{self.base_url}/api/v1/auth/token/"
        payload = {"email": self.username, "password": self.password}
        try:
            res = requests.post(url, json=payload, headers={"Content-Type": "application/json"})
            if res.status_code == 200:
                self.access_token = res.json().get("access")
                logger.info("Autentikasi BERHASIL.")
                return True
            logger.error(f"Autentikasi GAGAL ({res.status_code}): {res.text}")
            return False
        except Exception as e:
            logger.error(f"Koneksi gagal: {str(e)}")
            return False

    def _run_resource_lifecycle(self, endpoint: str, items: list, search_key: str, delete_code: str, company_id: Optional[str] = None) -> Dict[str, Any]:
        """Helper generik Lifecycle: Create, List, Retrieve, Patch, Delete"""
        full_endpoint = f"{self.base_url}{endpoint}"
        created_uuids = {}
        results_report = {"create": "FAIL", "list": "FAIL", "retrieve": "FAIL", "patch": "FAIL", "delete": "FAIL"}

        # 1. Create
        create_success = True
        for item in items:
            payload = {key: value for key, value in item.items() if key not in {"_key", "title", "code", "tenant"}}
            res = requests.post(full_endpoint, json=payload, headers=self._get_headers(company_id))
            if res.status_code == 201:
                res_data = res.json()
                identifier = item.get("_key") or item.get("code") or item.get("title") or item.get("name")
                created_uuids[identifier] = res_data.get("id")
            else:
                create_success = False
                logger.error(f"  [FAIL] Create {endpoint} ({item}): {res.text}")
        
        results_report["create"] = "PASS" if create_success and len(created_uuids) == len(items) else "FAIL"

        first_key = list(created_uuids.keys())[0] if created_uuids else None
        target_uuid = created_uuids.get(first_key)
        target_delete_uuid = created_uuids.get(delete_code)

        # 2. List & Search
        res_search = requests.get(f"{full_endpoint}?search={search_key}", headers=self._get_headers(company_id))
        if res_search.status_code == 200:
            results_report["list"] = "PASS"

        # 3. Retrieve
        if target_uuid:
            res_get = requests.get(f"{full_endpoint}{target_uuid}/", headers=self._get_headers(company_id))
            if res_get.status_code == 200:
                results_report["retrieve"] = "PASS"

        # 4. Patch
        if target_uuid:
            patch_payload = {"notes": "Updated via Procurement/Inventory Seeder"} if "procurement" in endpoint else {"status": "DRAFT"}
            res_patch = requests.patch(f"{full_endpoint}{target_uuid}/", json=patch_payload, headers=self._get_headers(company_id))
            if res_patch.status_code == 200:
                results_report["patch"] = "PASS"

        # 5. Delete khusus
        if target_delete_uuid:
            res_del = requests.delete(f"{full_endpoint}{target_delete_uuid}/", headers=self._get_headers(company_id))
            if res_del.status_code == 204:
                results_report["delete"] = "PASS"

        return {"records": created_uuids, "tests": results_report}

    @staticmethod
    def _rows(response: requests.Response) -> list:
        data = response.json()
        return data if isinstance(data, list) else data.get("results", [])

    def _ensure_three_way_match_receipts(self, company_id: str) -> bool:
        """Lengkapi receipt demo untuk setiap supplier billing yang masih menunggu match."""
        headers = self._get_headers(company_id)
        billing_res = requests.get(f"{self.base_url}/api/v1/finance/billing-documents/?page_size=200", headers=headers)
        receipt_res = requests.get(f"{self.base_url}/api/v1/procurement/goods-receipts/?page_size=200", headers=headers)
        if billing_res.status_code != 200 or receipt_res.status_code != 200:
            logger.error("  [FAIL] Tidak dapat membaca billing atau Goods Receipt untuk three-way match.")
            return False
        receipts = self._rows(receipt_res)
        success = True
        for billing in self._rows(billing_res):
            po_id = billing.get("purchase_order")
            if not po_id or billing.get("billing_type") not in {"SUPPLIER_BILL", "VENDOR_INVOICE"}:
                continue
            if any(str(row.get("purchase_order")) == str(po_id) for row in receipts):
                continue
            po_lines_res = requests.get(f"{self.base_url}/api/v1/procurement/purchase-order-lines/?purchase_order={po_id}&page_size=200", headers=headers)
            invoice_lines_res = requests.get(f"{self.base_url}/api/v1/finance/billing-document-lines/?billing_document={billing['id']}&page_size=200", headers=headers)
            po_lines = self._rows(po_lines_res) if po_lines_res.status_code == 200 else []
            invoice_lines = self._rows(invoice_lines_res) if invoice_lines_res.status_code == 200 else []
            if not po_lines and invoice_lines:
                for index, line in enumerate(invoice_lines, 1):
                    payload = {
                        "purchase_order": po_id,
                        "product": line.get("product"),
                        "ordered_quantity": line.get("quantity") or "0",
                        "received_quantity": line.get("quantity") or "0",
                        "invoiced_quantity": line.get("quantity") or "0",
                        "uom": line.get("uom"),
                        "unit_price": line.get("unit_price") or "0",
                    }
                    payload = {key: value for key, value in payload.items() if value not in (None, "")}
                    created = requests.post(f"{self.base_url}/api/v1/procurement/purchase-order-lines/", json=payload, headers=headers)
                    if created.status_code != 201:
                        logger.error(f"  [FAIL] Membuat PO line {index} untuk {po_id}: {created.text}")
                        success = False
                    else:
                        po_lines.append(created.json())
            receipt = requests.post(
                f"{self.base_url}/api/v1/procurement/goods-receipts/",
                json={"purchase_order": po_id, "supplier_party": billing.get("party"), "receipt_date": "2026-09-20", "inspection_status": "ACCEPTED", "status": "COMPLETED"},
                headers=headers,
            )
            if receipt.status_code != 201:
                logger.error(f"  [FAIL] Membuat Goods Receipt untuk {po_id}: {receipt.text}")
                success = False
                continue
            receipt_id = receipt.json().get("id")
            for index, line in enumerate(po_lines, 1):
                payload = {
                    "goods_receipt": receipt_id,
                    "purchase_order_line": line.get("id"),
                    "product": line.get("product"),
                    "received_quantity": line.get("ordered_quantity") or "0",
                    "accepted_quantity": line.get("ordered_quantity") or "0",
                    "rejected_quantity": "0",
                    "uom": line.get("uom"),
                }
                payload = {key: value for key, value in payload.items() if value not in (None, "")}
                created = requests.post(f"{self.base_url}/api/v1/procurement/goods-receipt-lines/", json=payload, headers=headers)
                if created.status_code != 201:
                    logger.error(f"  [FAIL] Membuat Goods Receipt line {index} untuk {po_id}: {created.text}")
                    success = False
            logger.info(f"  [PASS] Goods Receipt lengkap dibuat untuk PO {po_id}.")
        return success

    def execute_stage_5(self) -> bool:
        if not self.authenticate():
            return False

        tenant_uuid = self.state.get("created_records", {}).get("DUMMY-HOLDING")
        company_uuid = self.state.get("stage_2", {}).get("companies", {}).get("COMP-HOLDING")
        supplier_uuid = self.state.get("stage_3", {}).get("parties", {}).get("PARTY-SUPP-01")
        product_uuid = self.state.get("stage_3", {}).get("products", {}).get("PROD-ITEM-A")
        uom_uuid = self.state.get("stage_3", {}).get("uoms", {}).get("PCS")
        currency_uuid = self.state.get("stage_3", {}).get("currencies", {}).get("IDR")

        if not all([tenant_uuid, company_uuid, supplier_uuid, product_uuid]):
            logger.error("Relasi dependency (Tenant, Company, Supplier, Product) belum lengkap! Jalankan Tahap 1-4 terlebih dahulu.")
            return False

        logger.info(f"\n=========================================")
        logger.info(f"MENJALANKAN SEEDING TAHAP 5 (Procurement & Inventory)")
        logger.info(f"Tenant UUID: {tenant_uuid}")
        logger.info(f"Company UUID: {company_uuid}")
        logger.info(f"Supplier UUID: {supplier_uuid}")
        logger.info(f"=========================================")

        self.state.setdefault("stage_5", {})

        # ----------------------------------------------------
        # 1. PURCHASE REQUISITIONS (Permintaan Pembelian)
        # ----------------------------------------------------
        logger.info("\n--- [1/5] Seeding & Testing: Purchase Requisitions ---")
        requisitions = [
            {"company": company_uuid, "code": "PR-2026-001", "title": "Permintaan Bahan Baku Utama", "request_date": "2026-08-10", "required_date": "2026-08-30", "status": "APPROVED"},
            {"company": company_uuid, "code": "PR-2026-002", "title": "Permintaan Alat Tulis Kantor", "request_date": "2026-08-11", "required_date": "2026-09-05", "status": "DRAFT"},
            {"company": company_uuid, "code": "PR-2026-003", "title": "Permintaan Sparepart Mesin", "request_date": "2026-08-12", "required_date": "2026-09-10", "status": "SUBMITTED"},
            {"company": company_uuid, "code": "PR-CANCELLED", "title": "Permintaan Dibatalkan", "request_date": "2026-07-15", "required_date": "2026-08-01", "status": "CANCELLED"},
            {"company": company_uuid, "code": "PR-DEL", "title": "Requisition Delete Test", "request_date": "2026-12-01", "required_date": "2026-12-15", "status": "DRAFT"},
        ]
        pr_res = self._run_resource_lifecycle("/api/v1/procurement/purchase-requisitions/", requisitions, "Bahan", "PR-DEL", company_uuid)
        self.state["stage_5"]["purchase_requisitions"] = pr_res["records"]
        pr_approved_uuid = pr_res["records"].get("PR-2026-001")

        # ----------------------------------------------------
        # 2. REQUEST FOR QUOTATIONS / RFQ (Permintaan Penawaran Vendor)
        # ----------------------------------------------------
        logger.info("\n--- [2/5] Seeding & Testing: Requests for Quotations (RFQ) ---")
        rfqs = [
            {"requisition": pr_approved_uuid, "issue_date": "2026-08-12", "closing_date": "2026-08-20", "status": "SENT", "title": "RFQ-2026-001"},
            {"issue_date": "2026-08-15", "closing_date": "2026-08-25", "status": "DRAFT", "title": "RFQ-2026-002"},
            {"issue_date": "2026-07-01", "closing_date": "2026-07-15", "status": "CLOSED", "title": "RFQ-2026-003"},
            {"issue_date": "2026-06-01", "closing_date": "2026-06-10", "status": "EXPIRED", "title": "RFQ-EXPIRED"},
            {"issue_date": "2026-12-01", "closing_date": "2026-12-05", "status": "DRAFT", "title": "RFQ-DEL"},
        ]
        rfq_res = self._run_resource_lifecycle("/api/v1/procurement/rfqs/", rfqs, "Bahan", "RFQ-DEL", company_uuid)
        self.state["stage_5"]["rfqs"] = rfq_res["records"]

        # ----------------------------------------------------
        # 3. PURCHASE ORDERS (Pesanan Pembelian / PO)
        # ----------------------------------------------------
        logger.info("\n--- [3/5] Seeding & Testing: Purchase Orders ---")
        purchase_orders = [
            {
                "_key": "PO-2026-001",
                "supplier_party": supplier_uuid,
                "currency": currency_uuid,
                "title": "Purchase Order Bahan Baku PT Pemasok",
                "order_date": "2026-08-20", "expected_receipt_date": "2026-09-10",
                "subtotal": "150000000", "tax_amount": "16500000", "total_amount": "166500000",
                "status": "APPROVED"
            },
            {
                "_key": "PO-2026-002",
                "supplier_party": supplier_uuid,
                "currency": currency_uuid,
                "title": "Purchase Order Perlengkapan Produksi",
                "order_date": "2026-08-21", "expected_receipt_date": "2026-09-15",
                "subtotal": "45000000", "tax_amount": "4950000", "total_amount": "49950000",
                "status": "DRAFT"
            },
            {
                "_key": "PO-2026-003",
                "supplier_party": supplier_uuid,
                "currency": currency_uuid,
                "title": "Purchase Order Jasa Perawatan Mesin",
                "order_date": "2026-08-22", "expected_receipt_date": "2026-09-20",
                "subtotal": "75000000", "tax_amount": "8250000", "total_amount": "83250000",
                "status": "SENT"
            },
            {
                "_key": "PO-CANCELLED",
                "supplier_party": supplier_uuid,
                "currency": currency_uuid,
                "title": "Purchase Order Dibatalkan Vendor",
                "order_date": "2026-07-01", "expected_receipt_date": "2026-07-20",
                "subtotal": "20000000", "tax_amount": "2200000", "total_amount": "22200000",
                "status": "CANCELLED"
            },
            {
                "_key": "PO-DEL",
                "supplier_party": supplier_uuid,
                "currency": currency_uuid,
                "title": "Purchase Order Delete Test",
                "order_date": "2026-12-01", "expected_receipt_date": "2026-12-10",
                "subtotal": "1000", "tax_amount": "110", "total_amount": "1110",
                "status": "DRAFT"
            },
        ]
        po_res = self._run_resource_lifecycle("/api/v1/procurement/purchase-orders/", purchase_orders, "Bahan", "PO-DEL", company_uuid)
        self.state["stage_5"]["purchase_orders"] = po_res["records"]
        po_approved_uuid = po_res["records"].get("PO-2026-001")

        logger.info("\n--- [3b/5] Melengkapi Goods Receipt untuk Three-Way Match ---")
        receipt_success = self._ensure_three_way_match_receipts(company_uuid)

        # ----------------------------------------------------
        # 4. STOCK MOVES (Pergerakan Stok Gudang)
        # ----------------------------------------------------
        logger.info("\n--- [4/5] Seeding & Testing: Stock Moves ---")
        stock_moves = [
            {"company": company_uuid, "code": "SM-2026-001", "title": "Penerimaan Barang PO-2026-001", "move_type": "RECEIPT", "scheduled_at": "2026-09-10T08:00:00+07:00", "completed_at": "2026-09-10T15:00:00+07:00", "status": "DONE"},
            {"company": company_uuid, "code": "SM-2026-002", "title": "Transfer Antar Gudang A ke B", "move_type": "TRANSFER", "scheduled_at": "2026-09-11T08:00:00+07:00", "status": "READY"},
            {"company": company_uuid, "code": "SM-2026-003", "title": "Pengeluaran Bahan Baku Produksi", "move_type": "ISSUE", "scheduled_at": "2026-09-12T08:00:00+07:00", "status": "DRAFT"},
            {"company": company_uuid, "code": "SM-CANCELLED", "title": "Transfer Stok Dibatalkan", "move_type": "TRANSFER", "scheduled_at": "2026-08-01T08:00:00+07:00", "status": "CANCELLED"},
            {"company": company_uuid, "code": "SM-DEL", "title": "Stock Move Delete Test", "move_type": "ADJUSTMENT", "scheduled_at": "2026-12-31T08:00:00+07:00", "status": "DRAFT"},
        ]
        sm_res = self._run_resource_lifecycle("/api/v1/inventory/stock-moves/", stock_moves, "Penerimaan", "SM-DEL", company_uuid)
        self.state["stage_5"]["stock_moves"] = sm_res["records"]

        # ----------------------------------------------------
        # 5. STOCK COUNTS (Stock Opname Gudang)
        # ----------------------------------------------------
        logger.info("\n--- [5/5] Seeding & Testing: Stock Counts ---")
        stock_counts = [
            {"count_date": "2026-03-31", "count_type": "FULL", "status": "IN_PROGRESS", "title": "SC-2026-Q1"},
            {"count_date": "2026-06-30", "count_type": "CYCLE", "status": "DRAFT", "title": "SC-2026-Q2"},
            {"count_date": "2025-12-31", "count_type": "FULL", "status": "COMPLETED", "title": "SC-2025-FINISH"},
            {"count_date": "2026-01-31", "count_type": "CYCLE", "status": "CANCELLED", "title": "SC-CANCELLED"},
            {"count_date": "2026-12-31", "count_type": "TEST", "status": "DRAFT", "title": "SC-DEL"},
        ]
        sc_res = self._run_resource_lifecycle("/api/v1/inventory/stock-counts/", stock_counts, "Opname", "SC-DEL", company_uuid)
        self.state["stage_5"]["stock_counts"] = sc_res["records"]

        reports = {"purchase_requisitions": pr_res, "rfqs": rfq_res, "purchase_orders": po_res, "stock_moves": sm_res, "stock_counts": sc_res}
        success = receipt_success and all(report["tests"]["create"] == "PASS" for report in reports.values())
        self._save_state()
        print("\n" + "="*50)
        print("SEEDING TAHAP 5 SELESAI DENGAN SUKSES!" if success else "SEEDING TAHAP 5 GAGAL — lihat error di atas.")
        print("="*50)
        return success

if __name__ == "__main__":
    BASE_URL = "http://localhost:8000"
    ADMIN_EMAIL = "testerp@gmail.com"   # Sesuaikan kredensial admin
    ADMIN_PASSWORD = "testerp123"

    runner = ERPSeederStage5Runner(base_url=BASE_URL, username=ADMIN_EMAIL, password=ADMIN_PASSWORD)
    raise SystemExit(0 if runner.execute_stage_5() else 1)

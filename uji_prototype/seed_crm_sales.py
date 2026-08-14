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
logger = logging.getLogger("ERPSeederStage4")

class ERPSeederStage4Runner:
    def __init__(self, base_url: str, username: str, password: str, state_file: str = "seeding_state.json"):
        self.base_url = base_url.rstrip('/')
        self.username = username
        self.password = password
        self.state_file = state_file
        self.access_token: Optional[str] = None
        self.state: Dict[str, Any] = self._load_state()

    def _load_state(self) -> Dict[str, Any]:
        """Membaca state UUID dari Tahap 1, 2, dan 3"""
        try:
            with open(self.state_file, "r") as f:
                data = json.load(f)
                logger.info(f"State file '{self.state_file}' berhasil dimuat.")
                return data
        except FileNotFoundError:
            logger.error(f"File '{self.state_file}' tidak ditemukan! Jalankan Tahap 1, 2, & 3 terlebih dahulu.")
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
            res = requests.post(full_endpoint, json=item, headers=self._get_headers(company_id))
            if res.status_code == 201:
                res_data = res.json()
                identifier = item.get("code") or item.get("name") or item.get("title")
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
            patch_payload = {"notes": "Updated via CRM/Sales Seeder"} if "crm" in endpoint else {"status": "DRAFT"}
            res_patch = requests.patch(f"{full_endpoint}{target_uuid}/", json=patch_payload, headers=self._get_headers(company_id))
            if res_patch.status_code == 200:
                results_report["patch"] = "PASS"

        # 5. Delete khusus
        if target_delete_uuid:
            res_del = requests.delete(f"{full_endpoint}{target_delete_uuid}/", headers=self._get_headers(company_id))
            if res_del.status_code == 204:
                results_report["delete"] = "PASS"

        return {"records": created_uuids, "tests": results_report}

    def execute_stage_4(self):
        if not self.authenticate():
            return

        tenant_uuid = self.state.get("created_records", {}).get("DUMMY-HOLDING")
        company_uuid = self.state.get("stage_2", {}).get("companies", {}).get("COMP-HOLDING")
        customer_uuid = self.state.get("stage_3", {}).get("parties", {}).get("PARTY-CUST-01")
        product_uuid = self.state.get("stage_3", {}).get("products", {}).get("PROD-ITEM-A")
        uom_uuid = self.state.get("stage_3", {}).get("uoms", {}).get("PCS")
        currency_uuid = self.state.get("stage_3", {}).get("currencies", {}).get("IDR")

        if not all([tenant_uuid, company_uuid, customer_uuid, product_uuid]):
            logger.error("Relasi dependency (Tenant, Company, Customer, Product) belum lengkap! Jalankan Tahap 1-3 terlebih dahulu.")
            return

        logger.info(f"\n=========================================")
        logger.info(f"MENJALANKAN SEEDING TAHAP 4 (CRM & Sales)")
        logger.info(f"Tenant UUID: {tenant_uuid}")
        logger.info(f"Company UUID: {company_uuid}")
        logger.info(f"Customer UUID: {customer_uuid}")
        logger.info(f"=========================================")

        self.state.setdefault("stage_4", {})

        # ----------------------------------------------------
        # 1. CRM LEADS / OPPORTUNITIES
        # ----------------------------------------------------
        logger.info("\n--- [1/4] Seeding & Testing: CRM Leads ---")
        leads = [
            {"tenant": tenant_uuid, "company": company_uuid, "code": "LEAD-001", "name": "Potensi Pengadaan Server IT", "status": "QUALIFIED"},
            {"tenant": tenant_uuid, "company": company_uuid, "code": "LEAD-002", "name": "Permintaan Penawaran Jasa Maintenance", "status": "NEW"},
            {"tenant": tenant_uuid, "company": company_uuid, "code": "LEAD-003", "name": "Prospek Lisensi Software ERP", "status": "IN_PROGRESS"},
            {"tenant": tenant_uuid, "company": company_uuid, "code": "LEAD-INACTIVE", "name": "Prospek Batal / Unqualified", "status": "LOST"},
            {"tenant": tenant_uuid, "company": company_uuid, "code": "LEAD-DEL", "name": "Lead Delete Test", "status": "NEW"},
        ]
        lead_res = self._run_resource_lifecycle("/api/v1/crm/leads/", leads, "Server", "LEAD-DEL", company_uuid)
        self.state["stage_4"]["leads"] = lead_res["records"]

        # ----------------------------------------------------
        # 2. SALES QUOTATIONS (Penawaran Harga)
        # ----------------------------------------------------
        logger.info("\n--- [2/4] Seeding & Testing: Sales Quotations ---")
        quotations = [
            {
                "tenant": tenant_uuid,
                "company": company_uuid,
                "customer": customer_uuid,
                "currency": currency_uuid,
                "code": "SQ-2026-001",
                "title": "Penawaran Perangkat IT Utama",
                "status": "DRAFT"
            },
            {
                "tenant": tenant_uuid,
                "company": company_uuid,
                "customer": customer_uuid,
                "currency": currency_uuid,
                "code": "SQ-2026-002",
                "title": "Penawaran Layanan Support Annual",
                "status": "SENT"
            },
            {
                "tenant": tenant_uuid,
                "company": company_uuid,
                "customer": customer_uuid,
                "currency": currency_uuid,
                "code": "SQ-2026-003",
                "title": "Penawaran Pengadaan Sparepart",
                "status": "APPROVED"
            },
            {
                "tenant": tenant_uuid,
                "company": company_uuid,
                "customer": customer_uuid,
                "currency": currency_uuid,
                "code": "SQ-2026-EXPIRED",
                "title": "Penawaran Kadaluarsa",
                "status": "EXPIRED"
            },
            {
                "tenant": tenant_uuid,
                "company": company_uuid,
                "customer": customer_uuid,
                "currency": currency_uuid,
                "code": "SQ-DEL",
                "title": "Quotation Delete Test",
                "status": "DRAFT"
            },
        ]
        sq_res = self._run_resource_lifecycle("/api/v1/sales/quotations/", quotations, "Utama", "SQ-DEL", company_uuid)
        self.state["stage_4"]["quotations"] = sq_res["records"]
        sq_approved_uuid = sq_res["records"].get("SQ-2026-003")

        # ----------------------------------------------------
        # 3. SALES ORDERS (Pesanan Penjualan)
        # ----------------------------------------------------
        logger.info("\n--- [3/4] Seeding & Testing: Sales Orders ---")
        sales_orders = [
            {
                "tenant": tenant_uuid,
                "company": company_uuid,
                "customer": customer_uuid,
                "quotation": sq_approved_uuid,
                "code": "SO-2026-001",
                "title": "Sales Order Server IT Project",
                "status": "CONFIRMED"
            },
            {
                "tenant": tenant_uuid,
                "company": company_uuid,
                "customer": customer_uuid,
                "code": "SO-2026-002",
                "title": "Sales Order Lisensi ERP Batch 1",
                "status": "DRAFT"
            },
            {
                "tenant": tenant_uuid,
                "company": company_uuid,
                "customer": customer_uuid,
                "code": "SO-2026-003",
                "title": "Sales Order Jasa Konsultasi",
                "status": "IN_PROGRESS"
            },
            {
                "tenant": tenant_uuid,
                "company": company_uuid,
                "customer": customer_uuid,
                "code": "SO-CANCELLED",
                "title": "Sales Order Dibatalkan Customer",
                "status": "CANCELLED"
            },
            {
                "tenant": tenant_uuid,
                "company": company_uuid,
                "customer": customer_uuid,
                "code": "SO-DEL",
                "title": "Sales Order Delete Test",
                "status": "DRAFT"
            },
        ]
        so_res = self._run_resource_lifecycle("/api/v1/sales/orders/", sales_orders, "Server", "SO-DEL", company_uuid)
        self.state["stage_4"]["sales_orders"] = so_res["records"]
        so_confirmed_uuid = so_res["records"].get("SO-2026-001")

        # ----------------------------------------------------
        # 4. SALES DELIVERIES (Pengiriman Barang Penjualan)
        # ----------------------------------------------------
        logger.info("\n--- [4/4] Seeding & Testing: Sales Deliveries ---")
        deliveries = [
            {
                "tenant": tenant_uuid,
                "company": company_uuid,
                "sales_order": so_confirmed_uuid,
                "customer": customer_uuid,
                "code": "DO-2026-001",
                "title": "Delivery Order Server IT Phase 1",
                "status": "READY"
            },
            {
                "tenant": tenant_uuid,
                "company": company_uuid,
                "sales_order": so_confirmed_uuid,
                "customer": customer_uuid,
                "code": "DO-2026-002",
                "title": "Delivery Order Server IT Phase 2",
                "status": "SHIPPED"
            },
            {
                "tenant": tenant_uuid,
                "company": company_uuid,
                "sales_order": so_confirmed_uuid,
                "customer": customer_uuid,
                "code": "DO-2026-003",
                "title": "Delivery Order Perlengkapan Aksesoris",
                "status": "DELIVERED"
            },
            {
                "tenant": tenant_uuid,
                "company": company_uuid,
                "sales_order": so_confirmed_uuid,
                "customer": customer_uuid,
                "code": "DO-RETURNED",
                "title": "Delivery Order Retur Pengiriman",
                "status": "RETURNED"
            },
            {
                "tenant": tenant_uuid,
                "company": company_uuid,
                "sales_order": so_confirmed_uuid,
                "customer": customer_uuid,
                "code": "DO-DEL",
                "title": "Delivery Order Delete Test",
                "status": "DRAFT"
            },
        ]
        do_res = self._run_resource_lifecycle("/api/v1/sales/deliveries/", deliveries, "Server", "DO-DEL", company_uuid)
        self.state["stage_4"]["deliveries"] = do_res["records"]

        # Simpan State Akhir
        self._save_state()
        print("\n" + "="*50)
        print("SEEDING TAHAP 4 (CRM & SALES) SELESAI DENGAN SUKSES!")
        print("="*50)

if __name__ == "__main__":
    BASE_URL = "http://localhost:8000"
    ADMIN_EMAIL = "testerp@gmail.com"   # Sesuaikan kredensial admin
    ADMIN_PASSWORD = "testerp123"

    runner = ERPSeederStage4Runner(base_url=BASE_URL, username=ADMIN_EMAIL, password=ADMIN_PASSWORD)
    runner.execute_stage_4()
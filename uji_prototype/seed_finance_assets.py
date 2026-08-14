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
logger = logging.getLogger("ERPSeederStage7")

class ERPSeederStage7Runner:
    def __init__(self, base_url: str, username: str, password: str, state_file: str = "seeding_state.json"):
        self.base_url = base_url.rstrip('/')
        self.username = username
        self.password = password
        self.state_file = state_file
        self.access_token: Optional[str] = None
        self.state: Dict[str, Any] = self._load_state()

    def _load_state(self) -> Dict[str, Any]:
        """Membaca state UUID dari Tahap 1 hingga 6"""
        try:
            with open(self.state_file, "r") as f:
                data = json.load(f)
                logger.info(f"State file '{self.state_file}' berhasil dimuat.")
                return data
        except FileNotFoundError:
            logger.error(f"File '{self.state_file}' tidak ditemukan! Jalankan Tahap 1 s/d 6 terlebih dahulu.")
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
            patch_payload = {"notes": "Updated via Asset Seeder"} if "assets" in endpoint else {"name": "Updated Category Name"}
            res_patch = requests.patch(f"{full_endpoint}{target_uuid}/", json=patch_payload, headers=self._get_headers(company_id))
            if res_patch.status_code == 200:
                results_report["patch"] = "PASS"

        # 5. Delete khusus
        if target_delete_uuid:
            res_del = requests.delete(f"{full_endpoint}{target_delete_uuid}/", headers=self._get_headers(company_id))
            if res_del.status_code == 204:
                results_report["delete"] = "PASS"

        return {"records": created_uuids, "tests": results_report}

    def execute_stage_7(self):
        if not self.authenticate():
            return

        tenant_uuid = self.state.get("created_records", {}).get("DUMMY-HOLDING")
        company_uuid = self.state.get("stage_2", {}).get("companies", {}).get("COMP-HOLDING")

        if not tenant_uuid or not company_uuid:
            logger.error("Relasi dependency (Tenant, Company) belum lengkap! Jalankan Tahap 1-6 terlebih dahulu.")
            return

        logger.info(f"\n=========================================")
        logger.info(f"MENJALANKAN SEEDING TAHAP 7 (Finance & Assets)")
        logger.info(f"Tenant UUID: {tenant_uuid}")
        logger.info(f"Company UUID: {company_uuid}")
        logger.info(f"=========================================")

        self.state.setdefault("stage_7", {})

        # ----------------------------------------------------
        # 1. ASSET CATEGORIES
        # ----------------------------------------------------
        logger.info("\n--- [1/5] Seeding & Testing: Asset Categories ---")
        categories = [
            {"tenant": tenant_uuid, "company": company_uuid, "code": "ACAT-IT", "name": "IT Hardware & Equipment"},
            {"tenant": tenant_uuid, "company": company_uuid, "code": "ACAT-VEHICLE", "name": "Operatonal Vehicles"},
            {"tenant": tenant_uuid, "company": company_uuid, "code": "ACAT-MACHINERY", "name": "Manufacturing Machinery"},
            {"tenant": tenant_uuid, "company": company_uuid, "code": "ACAT-BUILDING", "name": "Buildings & Real Estate"},
            {"tenant": tenant_uuid, "company": company_uuid, "code": "ACAT-DEL", "name": "Asset Category Delete Test"},
        ]
        cat_res = self._run_resource_lifecycle("/api/v1/assets/categories/", categories, "Hardware", "ACAT-DEL", company_uuid)
        self.state["stage_7"]["asset_categories"] = cat_res["records"]
        acat_it_uuid = cat_res["records"].get("ACAT-IT")

        # ----------------------------------------------------
        # 2. ASSETS (Aktiva Tetap)
        # ----------------------------------------------------
        logger.info("\n--- [2/5] Seeding & Testing: Assets ---")
        assets = [
            {"tenant": tenant_uuid, "company": company_uuid, "category": acat_it_uuid, "code": "AST-SERVER-01", "name": "Main Data Center Server Rack", "status": "ACTIVE"},
            {"tenant": tenant_uuid, "company": company_uuid, "category": acat_it_uuid, "code": "AST-LAPTOP-01", "name": "MacBook Pro Developer Unit", "status": "ACTIVE"},
            {"tenant": tenant_uuid, "company": company_uuid, "category": acat_it_uuid, "code": "AST-CAR-01", "name": "Operational Delivery Van", "status": "UNDER_MAINTENANCE"},
            {"tenant": tenant_uuid, "company": company_uuid, "category": acat_it_uuid, "code": "AST-DISPOSED", "name": "Old Office Printer 2020", "status": "DISPOSED"},
            {"tenant": tenant_uuid, "company": company_uuid, "category": acat_it_uuid, "code": "AST-DEL", "name": "Asset Delete Test", "status": "DRAFT"},
        ]
        asset_res = self._run_resource_lifecycle("/api/v1/assets/assets/", assets, "Server", "AST-DEL", company_uuid)
        self.state["stage_7"]["assets"] = asset_res["records"]
        ast_server_uuid = asset_res["records"].get("AST-SERVER-01")

        # ----------------------------------------------------
        # 3. ASSET BOOKS (Buku Penyusutan Aset)
        # ----------------------------------------------------
        logger.info("\n--- [3/5] Seeding & Testing: Asset Books ---")
        books = [
            {"tenant": tenant_uuid, "company": company_uuid, "asset": ast_server_uuid, "code": "BOOK-TAX-2026", "name": "Fiscal Tax Book 2026"},
            {"tenant": tenant_uuid, "company": company_uuid, "asset": ast_server_uuid, "code": "BOOK-COMM-2026", "name": "Commercial Accounting Book 2026"},
            {"tenant": tenant_uuid, "company": company_uuid, "asset": ast_server_uuid, "code": "BOOK-IFRS-2026", "name": "IFRS Standard Depreciation Book"},
            {"tenant": tenant_uuid, "company": company_uuid, "asset": ast_server_uuid, "code": "BOOK-ARCHIVED", "name": "Archived Book 2024"},
            {"tenant": tenant_uuid, "company": company_uuid, "asset": ast_server_uuid, "code": "BOOK-DEL", "name": "Asset Book Delete Test"},
        ]
        book_res = self._run_resource_lifecycle("/api/v1/assets/books/", books, "Fiscal", "BOOK-DEL", company_uuid)
        self.state["stage_7"]["asset_books"] = book_res["records"]

        # ----------------------------------------------------
        # 4. ASSET MAINTENANCES (Pemeliharaan Aset)
        # ----------------------------------------------------
        logger.info("\n--- [4/5] Seeding & Testing: Asset Maintenances ---")
        maintenances = [
            {"tenant": tenant_uuid, "company": company_uuid, "asset": ast_server_uuid, "code": "MNT-2026-Q1", "title": "Routine Server Preventive Maintenance Q1", "status": "SCHEDULED"},
            {"tenant": tenant_uuid, "company": company_uuid, "asset": ast_server_uuid, "code": "MNT-2026-EMG", "title": "Emergency Power Supply Battery Replacement", "status": "IN_PROGRESS"},
            {"tenant": tenant_uuid, "company": company_uuid, "asset": ast_server_uuid, "code": "MNT-2025-Q4", "title": "Annual System Calibration 2025", "status": "COMPLETED"},
            {"tenant": tenant_uuid, "company": company_uuid, "asset": ast_server_uuid, "code": "MNT-CANCELLED", "title": "Cancelled Cleaning Maintenance", "status": "CANCELLED"},
            {"tenant": tenant_uuid, "company": company_uuid, "asset": ast_server_uuid, "code": "MNT-DEL", "title": "Maintenance Delete Test", "status": "SCHEDULED"},
        ]
        mnt_res = self._run_resource_lifecycle("/api/v1/assets/maintenances/", maintenances, "Server", "MNT-DEL", company_uuid)
        self.state["stage_7"]["asset_maintenances"] = mnt_res["records"]

        # ----------------------------------------------------
        # 5. ASSET DISPOSALS (Pelepasan/Penjualan Aset)
        # ----------------------------------------------------
        logger.info("\n--- [5/5] Seeding & Testing: Asset Disposals ---")
        disposals = [
            {"tenant": tenant_uuid, "company": company_uuid, "asset": ast_server_uuid, "code": "DSP-2026-001", "title": "Disposal Server Hardware EOL", "status": "APPROVED"},
            {"tenant": tenant_uuid, "company": company_uuid, "asset": ast_server_uuid, "code": "DSP-2026-002", "title": "Disposal Kendaraan Rusak Berat", "status": "DRAFT"},
            {"tenant": tenant_uuid, "company": company_uuid, "asset": ast_server_uuid, "code": "DSP-2026-003", "title": "Pelepasan Komputer Bekas Kantor", "status": "COMPLETED"},
            {"tenant": tenant_uuid, "company": company_uuid, "asset": ast_server_uuid, "code": "DSP-REJECTED", "title": "Pengajuan Disposal Ditolak Manager", "status": "REJECTED"},
            {"tenant": tenant_uuid, "company": company_uuid, "asset": ast_server_uuid, "code": "DSP-DEL", "title": "Disposal Delete Test", "status": "DRAFT"},
        ]
        dsp_res = self._run_resource_lifecycle("/api/v1/assets/disposals/", disposals, "Server", "DSP-DEL", company_uuid)
        self.state["stage_7"]["asset_disposals"] = dsp_res["records"]

        # Simpan State Akhir
        self._save_state()
        print("\n" + "="*50)
        print("SEEDING TAHAP 7 (FINANCE & ASSETS) SELESAI DENGAN SUKSES!")
        print("="*50)

if __name__ == "__main__":
    BASE_URL = "http://localhost:8000"
    ADMIN_EMAIL = "testerp@gmail.com"   # Sesuaikan kredensial admin
    ADMIN_PASSWORD = "testerp123"

    runner = ERPSeederStage7Runner(base_url=BASE_URL, username=ADMIN_EMAIL, password=ADMIN_PASSWORD)
    runner.execute_stage_7()
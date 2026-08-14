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
logger = logging.getLogger("ERPSeederStage6")

class ERPSeederStage6Runner:
    def __init__(self, base_url: str, username: str, password: str, state_file: str = "seeding_state.json"):
        self.base_url = base_url.rstrip('/')
        self.username = username
        self.password = password
        self.state_file = state_file
        self.access_token: Optional[str] = None
        self.state: Dict[str, Any] = self._load_state()

    def _load_state(self) -> Dict[str, Any]:
        """Membaca state UUID dari Tahap 1 hingga 5"""
        try:
            with open(self.state_file, "r") as f:
                data = json.load(f)
                logger.info(f"State file '{self.state_file}' berhasil dimuat.")
                return data
        except FileNotFoundError:
            logger.error(f"File '{self.state_file}' tidak ditemukan! Jalankan Tahap 1 s/d 5 terlebih dahulu.")
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
                identifier = item.get("code") or item.get("title") or item.get("name")
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
            patch_payload = {"description": "Updated via Project/Manufacturing Seeder"} if "projects" in endpoint else {"status": "DRAFT"}
            res_patch = requests.patch(f"{full_endpoint}{target_uuid}/", json=patch_payload, headers=self._get_headers(company_id))
            if res_patch.status_code == 200:
                results_report["patch"] = "PASS"

        # 5. Delete khusus
        if target_delete_uuid:
            res_del = requests.delete(f"{full_endpoint}{target_delete_uuid}/", headers=self._get_headers(company_id))
            if res_del.status_code == 204:
                results_report["delete"] = "PASS"

        return {"records": created_uuids, "tests": results_report}

    def execute_stage_6(self):
        if not self.authenticate():
            return

        tenant_uuid = self.state.get("created_records", {}).get("DUMMY-HOLDING")
        company_uuid = self.state.get("stage_2", {}).get("companies", {}).get("COMP-HOLDING")
        user_uuid = self.state.get("stage_2", {}).get("users", {}).get("dummy.admin@example.com")
        product_uuid = self.state.get("stage_3", {}).get("products", {}).get("PROD-ITEM-A")
        uom_uuid = self.state.get("stage_3", {}).get("uoms", {}).get("PCS")

        if not all([tenant_uuid, company_uuid, product_uuid]):
            logger.error("Relasi dependency (Tenant, Company, Product) belum lengkap! Jalankan Tahap 1-5 terlebih dahulu.")
            return

        logger.info(f"\n=========================================")
        logger.info(f"MENJALANKAN SEEDING TAHAP 6 (Project & Manufacturing)")
        logger.info(f"Tenant UUID: {tenant_uuid}")
        logger.info(f"Company UUID: {company_uuid}")
        logger.info(f"=========================================")

        self.state.setdefault("stage_6", {})

        # ----------------------------------------------------
        # 1. PROJECTS (Manajemen Proyek)
        # ----------------------------------------------------
        logger.info("\n--- [1/4] Seeding & Testing: Projects ---")
        projects = [
            {"tenant": tenant_uuid, "company": company_uuid, "code": "PROJ-2026-001", "name": "Implementasi ERP Phase 1", "status": "IN_PROGRESS"},
            {"tenant": tenant_uuid, "company": company_uuid, "code": "PROJ-2026-002", "name": "Pengembangan Infrastruktur Jaringan", "status": "PLANNED"},
            {"tenant": tenant_uuid, "company": company_uuid, "code": "PROJ-2026-003", "name": "Renovasi Gedung Operasional", "status": "ON_HOLD"},
            {"tenant": tenant_uuid, "company": company_uuid, "code": "PROJ-COMPLETED", "name": "Migrasi Data Server 2025", "status": "COMPLETED"},
            {"tenant": tenant_uuid, "company": company_uuid, "code": "PROJ-DEL", "name": "Project Delete Test", "status": "PLANNED"},
        ]
        proj_res = self._run_resource_lifecycle("/api/v1/projects/projects/", projects, "Implementasi", "PROJ-DEL", company_uuid)
        self.state["stage_6"]["projects"] = proj_res["records"]
        proj_main_uuid = proj_res["records"].get("PROJ-2026-001")

        # ----------------------------------------------------
        # 2. PROJECT TASKS (Tugas Proyek)
        # ----------------------------------------------------
        logger.info("\n--- [2/4] Seeding & Testing: Project Tasks ---")
        tasks = [
            {"tenant": tenant_uuid, "company": company_uuid, "project": proj_main_uuid, "code": "TASK-001", "title": "Analisis Kebutuhan Sistem", "status": "DONE"},
            {"tenant": tenant_uuid, "company": company_uuid, "project": proj_main_uuid, "code": "TASK-002", "title": "Konfigurasi Database & Module", "status": "IN_PROGRESS"},
            {"tenant": tenant_uuid, "company": company_uuid, "project": proj_main_uuid, "code": "TASK-003", "title": "User Acceptance Testing (UAT)", "status": "TODO"},
            {"tenant": tenant_uuid, "company": company_uuid, "project": proj_main_uuid, "code": "TASK-BLOCKED", "title": "Integrasi Payment Gateway", "status": "BLOCKED"},
            {"tenant": tenant_uuid, "company": company_uuid, "project": proj_main_uuid, "code": "TASK-DEL", "title": "Task Delete Test", "status": "TODO"},
        ]
        task_res = self._run_resource_lifecycle("/api/v1/projects/tasks/", tasks, "Analisis", "TASK-DEL", company_uuid)
        self.state["stage_6"]["project_tasks"] = task_res["records"]

        # ----------------------------------------------------
        # 3. PRODUCTION ORDERS (Perintah Produksi / Manufaktur)
        # ----------------------------------------------------
        logger.info("\n--- [3/4] Seeding & Testing: Production Orders ---")
        production_orders = [
            {
                "tenant": tenant_uuid,
                "company": company_uuid,
                "product": product_uuid,
                "uom": uom_uuid,
                "code": "PO-MFG-2026-001",
                "title": "Produksi Batch 1 Server Item A",
                "status": "RELEASED"
            },
            {
                "tenant": tenant_uuid,
                "company": company_uuid,
                "product": product_uuid,
                "uom": uom_uuid,
                "code": "PO-MFG-2026-002",
                "title": "Produksi Batch 2 Server Item A",
                "status": "DRAFT"
            },
            {
                "tenant": tenant_uuid,
                "company": company_uuid,
                "product": product_uuid,
                "uom": uom_uuid,
                "code": "PO-MFG-2026-003",
                "title": "Produksi Sparepart Cadangan",
                "status": "IN_PROGRESS"
            },
            {
                "tenant": tenant_uuid,
                "company": company_uuid,
                "product": product_uuid,
                "uom": uom_uuid,
                "code": "PO-MFG-CANCELLED",
                "title": "Produksi Batal Karena Material Kurang",
                "status": "CANCELLED"
            },
            {
                "tenant": tenant_uuid,
                "company": company_uuid,
                "product": product_uuid,
                "uom": uom_uuid,
                "code": "PO-MFG-DEL",
                "title": "Production Order Delete Test",
                "status": "DRAFT"
            },
        ]
        po_mfg_res = self._run_resource_lifecycle("/api/v1/manufacturing/production-orders/", production_orders, "Batch", "PO-MFG-DEL", company_uuid)
        self.state["stage_6"]["production_orders"] = po_mfg_res["records"]
        po_released_uuid = po_mfg_res["records"].get("PO-MFG-2026-001")

        # ----------------------------------------------------
        # 4. WORK ORDERS (Perintah Kerja Operasi Manufaktur)
        # ----------------------------------------------------
        logger.info("\n--- [4/4] Seeding & Testing: Work Orders ---")
        work_orders = [
            {
                "tenant": tenant_uuid,
                "company": company_uuid,
                "production_order": po_released_uuid,
                "code": "WO-2026-001",
                "title": "Perakitan Komponen Utama",
                "status": "READY"
            },
            {
                "tenant": tenant_uuid,
                "company": company_uuid,
                "production_order": po_released_uuid,
                "code": "WO-2026-002",
                "title": "Quality Inspection & Testing",
                "status": "IN_PROGRESS"
            },
            {
                "tenant": tenant_uuid,
                "company": company_uuid,
                "production_order": po_released_uuid,
                "code": "WO-2026-003",
                "title": "Pengemasan & Labeling Akhir",
                "status": "COMPLETED"
            },
            {
                "tenant": tenant_uuid,
                "company": company_uuid,
                "production_order": po_released_uuid,
                "code": "WO-PAUSED",
                "title": "Perbaikan Mesin Perakitan",
                "status": "PAUSED"
            },
            {
                "tenant": tenant_uuid,
                "company": company_uuid,
                "production_order": po_released_uuid,
                "code": "WO-DEL",
                "title": "Work Order Delete Test",
                "status": "READY"
            },
        ]
        wo_res = self._run_resource_lifecycle("/api/v1/manufacturing/work-orders/", work_orders, "Perakitan", "WO-DEL", company_uuid)
        self.state["stage_6"]["work_orders"] = wo_res["records"]

        # Simpan State Akhir
        self._save_state()
        print("\n" + "="*50)
        print("SEEDING TAHAP 6 (PROJECT & MANUFACTURING) SELESAI DENGAN SUKSES!")
        print("="*50)

if __name__ == "__main__":
    BASE_URL = "http://localhost:8000"
    ADMIN_EMAIL = "testerp@gmail.com"   # Sesuaikan kredensial admin
    ADMIN_PASSWORD = "testerp123"

    runner = ERPSeederStage6Runner(base_url=BASE_URL, username=ADMIN_EMAIL, password=ADMIN_PASSWORD)
    runner.execute_stage_6()
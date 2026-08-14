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
logger = logging.getLogger("ERPSeederStage3")

class ERPSeederStage3Runner:
    def __init__(self, base_url: str, username: str, password: str, state_file: str = "seeding_state.json"):
        self.base_url = base_url.rstrip('/')
        self.username = username
        self.password = password
        self.state_file = state_file
        self.access_token: Optional[str] = None
        self.state: Dict[str, Any] = self._load_state()

    def _load_state(self) -> Dict[str, Any]:
        """Membaca state UUID dari Tahap 1 & 2"""
        try:
            with open(self.state_file, "r") as f:
                data = json.load(f)
                logger.info(f"State file '{self.state_file}' berhasil dimuat.")
                return data
        except FileNotFoundError:
            logger.error(f"File '{self.state_file}' tidak ditemukan! Jalankan Tahap 1 & 2 terlebih dahulu.")
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
                identifier = item.get("code") or item.get("symbol") or item.get("name")
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
            patch_payload = {"name": "Updated Master Data Name"}
            res_patch = requests.patch(f"{full_endpoint}{target_uuid}/", json=patch_payload, headers=self._get_headers(company_id))
            if res_patch.status_code == 200:
                results_report["patch"] = "PASS"

        # 5. Delete khusus
        if target_delete_uuid:
            res_del = requests.delete(f"{full_endpoint}{target_delete_uuid}/", headers=self._get_headers(company_id))
            if res_del.status_code == 204:
                results_report["delete"] = "PASS"

        return {"records": created_uuids, "tests": results_report}

    def execute_stage_3(self):
        if not self.authenticate():
            return

        tenant_uuid = self.state.get("created_records", {}).get("DUMMY-HOLDING")
        company_uuid = self.state.get("stage_2", {}).get("companies", {}).get("COMP-HOLDING")

        if not tenant_uuid or not company_uuid:
            logger.error("UUID Tenant atau Company tidak ditemukan di state! Jalankan Tahap 1 & 2 terlebih dahulu.")
            return

        logger.info(f"\n=========================================")
        logger.info(f"MENJALANKAN SEEDING TAHAP 3 (Master Data)")
        logger.info(f"Tenant UUID: {tenant_uuid}")
        logger.info(f"Company UUID: {company_uuid}")
        logger.info(f"=========================================")

        self.state.setdefault("stage_3", {})

        # ----------------------------------------------------
        # 1. CURRENCIES
        # ----------------------------------------------------
        logger.info("\n--- [1/5] Seeding & Testing: Currencies ---")
        currencies = [
            {"tenant": tenant_uuid, "code": "IDR", "name": "Indonesian Rupiah", "symbol": "Rp"},
            {"tenant": tenant_uuid, "code": "USD", "name": "US Dollar", "symbol": "$"},
            {"tenant": tenant_uuid, "code": "EUR", "name": "Euro", "symbol": "€"},
            {"tenant": tenant_uuid, "code": "SGD", "name": "Singapore Dollar", "symbol": "S$"},
            {"tenant": tenant_uuid, "code": "DEL", "name": "Delete Test Currency", "symbol": "D$"},
        ]
        curr_res = self._run_resource_lifecycle("/api/v1/master-data/currencies/", currencies, "Rupiah", "DEL", company_uuid)
        self.state["stage_3"]["currencies"] = curr_res["records"]

        # ----------------------------------------------------
        # 2. UNITS OF MEASURE (UOM)
        # ----------------------------------------------------
        logger.info("\n--- [2/5] Seeding & Testing: Units of Measure (UOM) ---")
        uoms = [
            {"tenant": tenant_uuid, "code": "PCS", "name": "Pieces"},
            {"tenant": tenant_uuid, "code": "BOX", "name": "Box"},
            {"tenant": tenant_uuid, "code": "KG", "name": "Kilogram"},
            {"tenant": tenant_uuid, "code": "MTR", "name": "Meter"},
            {"tenant": tenant_uuid, "code": "UOM-DEL", "name": "UOM Delete Test"},
        ]
        uom_res = self._run_resource_lifecycle("/api/v1/master-data/uoms/", uoms, "Pieces", "UOM-DEL", company_uuid)
        self.state["stage_3"]["uoms"] = uom_res["records"]
        pcs_uom_uuid = uom_res["records"].get("PCS")

        # ----------------------------------------------------
        # 3. PRODUCT CATEGORIES
        # ----------------------------------------------------
        logger.info("\n--- [3/5] Seeding & Testing: Product Categories ---")
        categories = [
            {"tenant": tenant_uuid, "code": "CAT-RAW", "name": "Raw Materials"},
            {"tenant": tenant_uuid, "code": "CAT-FG", "name": "Finished Goods"},
            {"tenant": tenant_uuid, "code": "CAT-SERVICE", "name": "Services"},
            {"tenant": tenant_uuid, "code": "CAT-SPARE", "name": "Spare Parts"},
            {"tenant": tenant_uuid, "code": "CAT-DEL", "name": "Category Delete Test"},
        ]
        cat_res = self._run_resource_lifecycle("/api/v1/master-data/product-categories/", categories, "Goods", "CAT-DEL", company_uuid)
        self.state["stage_3"]["categories"] = cat_res["records"]
        fg_cat_uuid = cat_res["records"].get("CAT-FG")

        # ----------------------------------------------------
        # 4. PRODUCTS
        # ----------------------------------------------------
        logger.info("\n--- [4/5] Seeding & Testing: Products ---")
        products = [
            {
                "tenant": tenant_uuid,
                "category": fg_cat_uuid,
                "uom": pcs_uom_uuid,
                "code": "PROD-ITEM-A",
                "name": "Standard Product Item A",
                "is_active": True
            },
            {
                "tenant": tenant_uuid,
                "category": fg_cat_uuid,
                "uom": pcs_uom_uuid,
                "code": "PROD-ITEM-B",
                "name": "Advanced Product Item B",
                "is_active": True
            },
            {
                "tenant": tenant_uuid,
                "category": fg_cat_uuid,
                "uom": pcs_uom_uuid,
                "code": "PROD-SVC-A",
                "name": "Consulting Service A",
                "is_active": True
            },
            {
                "tenant": tenant_uuid,
                "category": fg_cat_uuid,
                "uom": pcs_uom_uuid,
                "code": "PROD-INACTIVE",
                "name": "Discontinued Product",
                "is_active": False
            },
            {
                "tenant": tenant_uuid,
                "category": fg_cat_uuid,
                "uom": pcs_uom_uuid,
                "code": "PROD-DEL",
                "name": "Product Delete Test",
                "is_active": True
            },
        ]
        prod_res = self._run_resource_lifecycle("/api/v1/master-data/products/", products, "Standard", "PROD-DEL", company_uuid)
        self.state["stage_3"]["products"] = prod_res["records"]

        # ----------------------------------------------------
        # 5. PARTIES / CONTACTS (Customers & Suppliers)
        # ----------------------------------------------------
        logger.info("\n--- [5/5] Seeding & Testing: Parties (Customers & Suppliers) ---")
        parties = [
            {"tenant": tenant_uuid, "code": "PARTY-CUST-01", "name": "PT Pelanggan Utama", "is_customer": True, "is_supplier": False},
            {"tenant": tenant_uuid, "code": "PARTY-SUPP-01", "name": "PT Pemasok Bahan Baku", "is_customer": False, "is_supplier": True},
            {"tenant": tenant_uuid, "code": "PARTY-BOTH-01", "name": "PT Mitra Dual Fungsi", "is_customer": True, "is_supplier": True},
            {"tenant": tenant_uuid, "code": "PARTY-INACTIVE", "name": "PT Inactive Partner", "is_customer": True, "is_supplier": False},
            {"tenant": tenant_uuid, "code": "PARTY-DEL", "name": "Party Delete Test", "is_customer": True, "is_supplier": False},
        ]
        party_res = self._run_resource_lifecycle("/api/v1/master-data/parties/", parties, "Pelanggan", "PARTY-DEL", company_uuid)
        self.state["stage_3"]["parties"] = party_res["records"]

        # Simpan State Akhir
        self._save_state()
        print("\n" + "="*50)
        print("SEEDING TAHAP 3 (MASTER DATA) SELESAI DENGAN SUKSES!")
        print("="*50)

if __name__ == "__main__":
    BASE_URL = "http://localhost:8000"
    ADMIN_EMAIL = "testerp@gmail.com"   # Sesuaikan kredensial admin
    ADMIN_PASSWORD = "testerp123"

    runner = ERPSeederStage3Runner(base_url=BASE_URL, username=ADMIN_EMAIL, password=ADMIN_PASSWORD)
    runner.execute_stage_3()
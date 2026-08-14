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
logger = logging.getLogger("ERPSeeder")

class ERPSeederRunner:
    def __init__(self, base_url: str, username: str, password: str):
        self.base_url = base_url.rstrip('/')
        self.username = username
        self.password = password
        self.access_token: Optional[str] = None
        self.refresh_token: Optional[str] = None
        
        # State simpanan UUID untuk digunakan pada tahap seeder berikutnya
        self.state: Dict[str, Any] = {
            "resource": "core.tenants",
            "endpoint": "/api/v1/core/tenants/",
            "dependencies": [],
            "created_records": {},
            "tests": {}
        }

    def _get_headers(self, with_auth: bool = True, custom_token: Optional[str] = None) -> Dict[str, str]:
        headers = {"Content-Type": "application/json"}
        if with_auth:
            token = custom_token if custom_token else self.access_token
            if token:
                headers["Authorization"] = f"Bearer {token}"
        return headers

    def authenticate(self) -> bool:
        """1. Login dan dapatkan JWT Access Token"""
        url = f"{self.base_url}/api/v1/auth/token/"
        payload = {"email": self.username, "password": self.password}
        
        logger.info("Mengakses endpoint autentikasi JWT...")
        try:
            res = requests.post(url, json=payload, headers=self._get_headers(with_auth=False))
            if res.status_code == 200:
                data = res.json()
                self.access_token = data.get("access")
                self.refresh_token = data.get("refresh")
                logger.info("Autentikasi BERHASIL. JWT Token diperoleh.")
                return True
            else:
                logger.error(f"Autentikasi GAGAL ({res.status_code}): {res.text}")
                return False
        except Exception as e:
            logger.error(f"Gagal terhubung ke server: {str(e)}")
            return False

    def run_tenant_stage(self) -> Dict[str, Any]:
        """Eksekusi Seeding dan Uji Lifecycle Lengkap untuk Tenant"""
        if not self.access_token:
            if not self.authenticate():
                logger.error("Proses seeding dihentikan karena autentikasi gagal.")
                return self.state

        tenant_endpoint = f"{self.base_url}/api/v1/core/tenants/"
        dummy_tenants = [
            {"code": "DUMMY-HOLDING", "name": "Dummy Holding Indonesia", "status": "ACTIVE"},
            {"code": "DUMMY-MANUFACTURING", "name": "Dummy Manufacturing Group", "status": "ACTIVE"},
            {"code": "DUMMY-SERVICE", "name": "Dummy Service Corporation", "status": "ACTIVE"},
            {"code": "DUMMY-INACTIVE", "name": "Dummy Inactive Tenant", "status": "INACTIVE"},
            {"code": "DUMMY-DELETE", "name": "Dummy Tenant for Delete Test", "status": "ACTIVE"},
        ]

        # ----------------------------------------------------
        # A. Uji Create (POST) 5 Dummy Tenants
        # ----------------------------------------------------
        logger.info("\n--- [1] Uji Create Data (POST) ---")
        created_uuids = {}
        create_success = True

        for item in dummy_tenants:
            res = requests.post(tenant_endpoint, json=item, headers=self._get_headers())
            if res.status_code == 201:
                res_data = res.json()
                created_uuids[item["code"]] = res_data.get("id")
                logger.info(f"[PASS] Created Tenant '{item['code']}' -> ID: {res_data.get('id')}")
            else:
                logger.error(f"[FAIL] Create Tenant '{item['code']}' Gagal ({res.status_code}): {res.text}")
                create_success = False

        self.state["created_records"] = created_uuids
        self.state["tests"]["create"] = "PASS" if create_success and len(created_uuids) == 5 else "FAIL"

        holding_uuid = created_uuids.get("DUMMY-HOLDING")
        delete_uuid = created_uuids.get("DUMMY-DELETE")

        # ----------------------------------------------------
        # B. Uji Query Parameters (List, Pagination, Search, Ordering)
        # ----------------------------------------------------
        logger.info("\n--- [2] Uji List & Query Parameters (GET) ---")
        
        # 1. List & Pagination
        res_page = requests.get(f"{tenant_endpoint}?page=1&page_size=2", headers=self._get_headers())
        page_ok = False
        if res_page.status_code == 200:
            data = res_page.json()
            if all(k in data for k in ("count", "results")) and len(data.get("results", [])) <= 2:
                page_ok = True
                logger.info(f"[PASS] Pagination Test OK (Total: {data.get('count')}, Results count: {len(data.get('results'))})")
        self.state["tests"]["pagination"] = "PASS" if page_ok else "FAIL"

        # 2. Search
        res_search = requests.get(f"{tenant_endpoint}?search=Manufacturing", headers=self._get_headers())
        search_ok = False
        if res_search.status_code == 200:
            results = res_search.json().get("results", [])
            if any(r.get("code") == "DUMMY-MANUFACTURING" for r in results):
                search_ok = True
                logger.info("[PASS] Search Test OK (DUMMY-MANUFACTURING ditemukan)")
        self.state["tests"]["search"] = "PASS" if search_ok else "FAIL"

        # 3. Ordering Ascending & Descending
        res_ord_asc = requests.get(f"{tenant_endpoint}?ordering=code", headers=self._get_headers())
        res_ord_desc = requests.get(f"{tenant_endpoint}?ordering=-code", headers=self._get_headers())
        ordering_ok = (res_ord_asc.status_code == 200 and res_ord_desc.status_code == 200)
        logger.info(f"[{'PASS' if ordering_ok else 'FAIL'}] Ordering Test OK")
        self.state["tests"]["ordering"] = "PASS" if ordering_ok else "FAIL"
        self.state["tests"]["list"] = "PASS" if page_ok and search_ok and ordering_ok else "FAIL"

        # ----------------------------------------------------
        # C. Uji Retrieve (GET BY ID)
        # ----------------------------------------------------
        logger.info("\n--- [3] Uji Retrieve Detail (GET ID) ---")
        retrieve_ok = False
        if holding_uuid:
            res_get = requests.get(f"{tenant_endpoint}{holding_uuid}/", headers=self._get_headers())
            if res_get.status_code == 200 and res_get.json().get("code") == "DUMMY-HOLDING":
                retrieve_ok = True
                logger.info(f"[PASS] Retrieve Tenant DUMMY-HOLDING OK")
        self.state["tests"]["retrieve"] = "PASS" if retrieve_ok else "FAIL"

        # ----------------------------------------------------
        # D. Uji Patch / Partial Update (PATCH)
        # ----------------------------------------------------
        logger.info("\n--- [4] Uji Partial Update (PATCH) ---")
        patch_ok = False
        if holding_uuid:
            patch_payload = {"name": "Dummy Holding Indonesia Updated"}
            res_patch = requests.patch(f"{tenant_endpoint}{holding_uuid}/", json=patch_payload, headers=self._get_headers())
            if res_patch.status_code == 200 and res_patch.json().get("name") == "Dummy Holding Indonesia Updated":
                patch_ok = True
                logger.info(f"[PASS] Patch Tenant Name OK")
        self.state["tests"]["patch"] = "PASS" if patch_ok else "FAIL"

        # ----------------------------------------------------
        # E. Uji Delete pada Record Khusus (DELETE)
        # ----------------------------------------------------
        logger.info("\n--- [5] Uji Delete Record Khusus (DELETE) ---")
        delete_ok = False
        if delete_uuid:
            res_del = requests.delete(f"{tenant_endpoint}{delete_uuid}/", headers=self._get_headers())
            if res_del.status_code == 204:
                delete_ok = True
                logger.info(f"[PASS] Delete Tenant DUMMY-DELETE (204 No Content) OK")
        self.state["tests"]["delete"] = "PASS" if delete_ok else "FAIL"

        # ----------------------------------------------------
        # F. Uji Validasi Negatif
        # ----------------------------------------------------
        logger.info("\n--- [6] Uji Validasi Negatif ---")
        invalid_tests_passed = 0

        # 1. Payload Salah (Code > 255 Karakter) -> Expektasi 400
        bad_payload = {"code": "X" * 256, "name": "Invalid Tenant", "status": "ACTIVE"}
        res_400 = requests.post(tenant_endpoint, json=bad_payload, headers=self._get_headers())
        if res_400.status_code == 400:
            invalid_tests_passed += 1
            logger.info("[PASS] Validasi Code > 255 karakter melempar 400 Bad Request")
        else:
            logger.error(f"[FAIL] Expektasi 400, mendapat status: {res_400.status_code}")

        # 2. UUID Tidak Ditemukan -> Expektasi 404
        dummy_uuid = "00000000-0000-0000-0000-000000000000"
        res_404 = requests.get(f"{tenant_endpoint}{dummy_uuid}/", headers=self._get_headers())
        if res_404.status_code == 404:
            invalid_tests_passed += 1
            logger.info("[PASS] UUID acak melempar 404 Not Found")
        else:
            logger.error(f"[FAIL] Expektasi 404, mendapat status: {res_404.status_code}")

        # 3. Tanpa Token -> Expektasi 401
        res_401_no_token = requests.get(tenant_endpoint, headers=self._get_headers(with_auth=False))
        if res_401_no_token.status_code == 401:
            invalid_tests_passed += 1
            logger.info("[PASS] Request tanpa token melempar 401 Unauthorized")
        else:
            logger.error(f"[FAIL] Expektasi 401, mendapat status: {res_401_no_token.status_code}")

        # 4. Token Tidak Valid -> Expektasi 401
        res_401_bad_token = requests.get(tenant_endpoint, headers=self._get_headers(custom_token="invalid-token"))
        if res_401_bad_token.status_code == 401:
            invalid_tests_passed += 1
            logger.info("[PASS] Request dengan token tidak valid melempar 401 Unauthorized")
        else:
            logger.error(f"[FAIL] Expektasi 401, mendapat status: {res_401_bad_token.status_code}")

        self.state["tests"]["invalid_payload"] = "PASS" if invalid_tests_passed == 4 else "FAIL"

        return self.state

# ----------------------------------------------------
# Main Execution Entrypoint
# ----------------------------------------------------
if __name__ == "__main__":
    BASE_URL = "http://localhost:8000"  # Sesuaikan dengan URL server API
    ADMIN_EMAIL = "testerp@gmail.com"   # Sesuaikan kredensial admin
    ADMIN_PASSWORD = "testerp123"

    runner = ERPSeederRunner(base_url=BASE_URL, username=ADMIN_EMAIL, password=ADMIN_PASSWORD)
    report = runner.run_tenant_stage()

    # Cetak laporan akhir dan simpan state UUID
    print("\n" + "="*50)
    print("HASIL EKSEKUSI SEEDING & TESTING TAHAP 1 (CORE_TENANT)")
    print("="*50)
    print(json.dumps(report, indent=2))

    # Simpan state ke file JSON lokal agar dapat dibaca oleh seeder tahap berikutnya (Company, User, Role)
    with open("seeding_state.json", "w") as f:
        json.dump(report, f, indent=2)
    
    logger.info("\nState UUID tersimpan di 'seeding_state.json'. Siap digunakan untuk Tahap 2 (Company).")
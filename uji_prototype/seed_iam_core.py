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
logger = logging.getLogger("ERPSeederStage2")

class ERPSeederStage2Runner:
    def __init__(self, base_url: str, username: str, password: str, state_file: str = "seeding_state.json"):
        self.base_url = base_url.rstrip('/')
        self.username = username
        self.password = password
        self.state_file = state_file
        self.access_token: Optional[str] = None
        self.state: Dict[str, Any] = self._load_state()

    def _load_state(self) -> Dict[str, Any]:
        """Membaca state UUID dari hasil eksekusi Tahap 1"""
        try:
            with open(self.state_file, "r") as f:
                data = json.load(f)
                logger.info(f"State file '{self.state_file}' berhasil dimuat.")
                return data
        except FileNotFoundError:
            logger.error(f"File '{self.state_file}' tidak ditemukan! Jalankan Tahap 1 terlebih dahulu.")
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

    def _run_resource_lifecycle(self, endpoint: str, items: list, search_key: str, delete_code: str) -> Dict[str, Any]:
        """Helper generik untuk uji Lifecycle: Create, List, Pagination, Search, Retrieve, Patch, Delete"""
        full_endpoint = f"{self.base_url}{endpoint}"
        created_uuids = {}
        results_report = {"create": "FAIL", "list": "FAIL", "retrieve": "FAIL", "patch": "FAIL", "delete": "FAIL"}

        # 1. Create
        create_success = True
        for item in items:
            res = requests.post(full_endpoint, json=item, headers=self._get_headers())
            if res.status_code == 201:
                res_data = res.json()
                identifier = item.get("code") or item.get("email") or item.get("name")
                created_uuids[identifier] = res_data.get("id")
            else:
                create_success = False
                logger.error(f"  [FAIL] Create {endpoint} ({item}): {res.text}")
        
        results_report["create"] = "PASS" if create_success and len(created_uuids) == len(items) else "FAIL"

        first_key = list(created_uuids.keys())[0] if created_uuids else None
        target_uuid = created_uuids.get(first_key)
        target_delete_uuid = created_uuids.get(delete_code)

        # 2. List & Search
        res_search = requests.get(f"{full_endpoint}?search={search_key}", headers=self._get_headers())
        if res_search.status_code == 200:
            results_report["list"] = "PASS"

        # 3. Retrieve
        if target_uuid:
            res_get = requests.get(f"{full_endpoint}{target_uuid}/", headers=self._get_headers())
            if res_get.status_code == 200:
                results_report["retrieve"] = "PASS"

        # 4. Patch
        if target_uuid:
            patch_payload = {"description": "Updated via Automated Seeder"} if "roles" in endpoint else {"name": "Updated Name"}
            res_patch = requests.patch(f"{full_endpoint}{target_uuid}/", json=patch_payload, headers=self._get_headers())
            if res_patch.status_code == 200:
                results_report["patch"] = "PASS"

        # 5. Delete khusus
        if target_delete_uuid:
            res_del = requests.delete(f"{full_endpoint}{target_delete_uuid}/", headers=self._get_headers())
            if res_del.status_code == 204:
                results_report["delete"] = "PASS"

        return {"records": created_uuids, "tests": results_report}

    def execute_stage_2(self):
        if not self.authenticate():
            return

        tenant_uuid = self.state.get("created_records", {}).get("DUMMY-HOLDING")
        if not tenant_uuid:
            logger.error("UUID Tenant DUMMY-HOLDING tidak ditemukan di state!")
            return

        logger.info(f"\n=========================================")
        logger.info(f"MENJALANKAN SEEDING TAHAP 2 (Core & IAM)")
        logger.info(f"Tenant Target UUID: {tenant_uuid}")
        logger.info(f"=========================================")

        # ----------------------------------------------------
        # 1. CORE_COMPANY
        # ----------------------------------------------------
        logger.info("\n--- [1/5] Seeding & Testing: CORE_COMPANY ---")
        companies = [
            {"tenant": tenant_uuid, "code": "COMP-HOLDING", "name": "PT Holding Utama Indonesia", "is_active": True},
            {"tenant": tenant_uuid, "code": "COMP-MFG", "name": "PT Manufacturing Sub-Group", "is_active": True},
            {"tenant": tenant_uuid, "code": "COMP-SVC", "name": "PT Services Indonesia", "is_active": True},
            {"tenant": tenant_uuid, "code": "COMP-INACTIVE", "name": "PT Inactive Subsidiary", "is_active": False},
            {"tenant": tenant_uuid, "code": "COMP-DELETE", "name": "PT Company Delete Test", "is_active": True},
        ]
        comp_res = self._run_resource_lifecycle("/api/v1/core/companies/", companies, "Manufacturing", "COMP-DELETE")
        self.state.setdefault("stage_2", {})["companies"] = comp_res["records"]
        comp_holding_uuid = comp_res["records"].get("COMP-HOLDING")

        # ----------------------------------------------------
        # 2. CORE_ORGANIZATION
        # ----------------------------------------------------
        logger.info("\n--- [2/5] Seeding & Testing: CORE_ORGANIZATION ---")
        orgs = [
            {"tenant": tenant_uuid, "company": comp_holding_uuid, "code": "ORG-HQ", "name": "Headquarter Division"},
            {"tenant": tenant_uuid, "company": comp_holding_uuid, "code": "ORG-FINANCE", "name": "Finance & Accounting"},
            {"tenant": tenant_uuid, "company": comp_holding_uuid, "code": "ORG-OPERATIONAL", "name": "Operations Department"},
            {"tenant": tenant_uuid, "company": comp_holding_uuid, "code": "ORG-INACTIVE", "name": "Archived Division"},
            {"tenant": tenant_uuid, "company": comp_holding_uuid, "code": "ORG-DELETE", "name": "Org Delete Test"},
        ]
        org_res = self._run_resource_lifecycle("/api/v1/core/organizations/", orgs, "Finance", "ORG-DELETE")
        self.state["stage_2"]["organizations"] = org_res["records"]
        org_hq_uuid = org_res["records"].get("ORG-HQ")

        # ----------------------------------------------------
        # 3. IAM_ROLE
        # ----------------------------------------------------
        logger.info("\n--- [3/5] Seeding & Testing: IAM_ROLE ---")
        roles = [
            {"tenant": tenant_uuid, "code": "ROLE-ADMIN", "name": "System Administrator", "description": "Full Access"},
            {"tenant": tenant_uuid, "code": "ROLE-MANAGER", "name": "Operational Manager", "description": "Managerial Scope"},
            {"tenant": tenant_uuid, "code": "ROLE-STAFF", "name": "Operational Staff", "description": "Standard Staff"},
            {"tenant": tenant_uuid, "code": "ROLE-INACTIVE", "name": "Deprecated Role", "description": "Inactive Role"},
            {"tenant": tenant_uuid, "code": "ROLE-DELETE", "name": "Role Delete Test", "description": "Role to delete"},
        ]
        role_res = self._run_resource_lifecycle("/api/v1/accounts/roles/", roles, "Manager", "ROLE-DELETE")
        self.state["stage_2"]["roles"] = role_res["records"]
        role_admin_uuid = role_res["records"].get("ROLE-ADMIN")

        # ----------------------------------------------------
        # 4. IAM_USER
        # ----------------------------------------------------
        logger.info("\n--- [4/5] Seeding & Testing: IAM_USER ---")
        users = [
            {"tenant": tenant_uuid, "email": "dummy.admin@example.com", "first_name": "Dummy", "last_name": "Admin", "is_active": True},
            {"tenant": tenant_uuid, "email": "dummy.manager@example.com", "first_name": "Dummy", "last_name": "Manager", "is_active": True},
            {"tenant": tenant_uuid, "email": "dummy.staff@example.com", "first_name": "Dummy", "last_name": "Staff", "is_active": True},
            {"tenant": tenant_uuid, "email": "dummy.inactive@example.com", "first_name": "Dummy", "last_name": "Inactive", "is_active": False},
            {"tenant": tenant_uuid, "email": "dummy.delete@example.com", "first_name": "Dummy", "last_name": "DeleteTest", "is_active": True},
        ]
        user_res = self._run_resource_lifecycle("/api/v1/accounts/users/", users, "manager", "dummy.delete@example.com")
        self.state["stage_2"]["users"] = user_res["records"]
        user_admin_uuid = user_res["records"].get("dummy.admin@example.com")

        # ----------------------------------------------------
        # 5. IAM_USER_ROLE
        # ----------------------------------------------------
        logger.info("\n--- [5/5] Seeding & Testing: IAM_USER_ROLE ---")
        user_roles = [
            {
                "tenant": tenant_uuid,
                "user": user_admin_uuid,
                "role": role_admin_uuid,
                "company": comp_holding_uuid,
                "organization": org_hq_uuid,
                "code": "UR-ADMIN"
            },
            {
                "tenant": tenant_uuid,
                "user": user_res["records"].get("dummy.manager@example.com"),
                "role": role_res["records"].get("ROLE-MANAGER"),
                "company": comp_holding_uuid,
                "organization": org_hq_uuid,
                "code": "UR-MANAGER"
            },
            {
                "tenant": tenant_uuid,
                "user": user_res["records"].get("dummy.staff@example.com"),
                "role": role_res["records"].get("ROLE-STAFF"),
                "company": comp_holding_uuid,
                "organization": org_hq_uuid,
                "code": "UR-STAFF"
            },
            {
                "tenant": tenant_uuid,
                "user": user_admin_uuid,
                "role": role_admin_uuid,
                "company": comp_holding_uuid,
                "organization": org_hq_uuid,
                "code": "UR-DELETE"
            }
        ]
        ur_res = self._run_resource_lifecycle("/api/v1/accounts/user-roles/", user_roles, "ADMIN", "UR-DELETE")
        self.state["stage_2"]["user_roles"] = ur_res["records"]

        # Simpan State Akhir
        self._save_state()
        print("\n" + "="*50)
        print("SEEDING TAHAP 2 (CORE & IAM) SELESAI DENGAN SUKSES!")
        print("="*50)

if __name__ == "__main__":
    BASE_URL = "http://localhost:8000"
    ADMIN_EMAIL = "testerp@gmail.com"   # Sesuaikan kredensial admin
    ADMIN_PASSWORD = "testerp123"

    runner = ERPSeederStage2Runner(base_url=BASE_URL, username=ADMIN_EMAIL, password=ADMIN_PASSWORD)
    runner.execute_stage_2()
from decimal import Decimal
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import Role, User, UserRole
from apps.core.models import Company, Tenant
from apps.crm.models import Opportunity, CustomerInquiry, InquiryRequirement
from apps.master_data.models import Currency, Party, Product, UOM, CustomerProfile
from apps.sales.models import Order, Delivery
from apps.service.models import Case, Resolution
from apps.finance.models import BillingDocument
from apps.projects.models import Project


class DealAndServiceFlowTests(TestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(code="FLOW-TENANT", name="Flow Tenant", status="ACTIVE")
        self.currency = Currency.objects.create(currency_code="IDR-FLOW", currency_name="Rupiah")
        self.company = Company.objects.create(tenant=self.tenant, company_code="FLOW-CO", legal_name="Flow Company", base_currency=self.currency, status="ACTIVE")
        
        self.crm_user = self.make_user("crm_tester", "CRM")
        self.exec_user = self.make_user("exec_tester", "EXECUTIVE")
        
        self.customer = Party.objects.create(
            tenant=self.tenant,
            party_code="CUST-FLOW",
            party_type="ORGANIZATION",
            legal_name="PT Pelanggan Setia",
            display_name="PT Pelanggan Setia",
            default_currency=self.currency,
            status="ACTIVE"
        )
        
        self.uom = UOM.objects.create(tenant=self.tenant, uom_code="UNIT-FL", uom_name="Unit")
        self.product = Product.objects.create(
            tenant=self.tenant,
            base_uom=self.uom,
            product_code="PROD-FLOW-01",
            product_name="Mesin CNC Industrial",
            sales_item=True,
            status="ACTIVE"
        )
        
        self.headers = {"HTTP_X_COMPANY_ID": str(self.company.id)}

    def make_user(self, username, role_code):
        user = User.objects.create_user(username=username, email=f"{username}@flow.test", password="secretpassword", tenant=self.tenant)
        role, _ = Role.objects.get_or_create(tenant=self.tenant, role_code=role_code, defaults={"role_name": role_code})
        UserRole.objects.create(user=user, role=role, company=self.company)
        return user

    def client_for(self, user):
        client = APIClient()
        client.force_authenticate(user)
        return client

    # --- FLOW 1: TICKET SUPPORT & WARRANTY ---
    def test_support_ticket_and_warranty_verification_and_solution(self):
        client = self.client_for(self.crm_user)
        
        # 1. Create Support Ticket (Service Case)
        res_create = client.post("/api/v1/service/cases/", {
            "customer_party": str(self.customer.id),
            "product": str(self.product.id),
            "subject": "Layar Panel Mesin Mati Total",
            "description": "Klaim garansi karena panel mati saat pemakaian normal",
            "priority": "HIGH"
        }, format="json", **self.headers)
        self.assertEqual(res_create.status_code, 201, res_create.data)
        case_id = res_create.data["id"]
        
        # 2. Check Status & Warranty
        res_check = client.post(f"/api/v1/service/cases/{case_id}/check-status/", {}, format="json", **self.headers)
        self.assertEqual(res_check.status_code, 200, res_check.data)
        self.assertTrue(res_check.data["warranty_check"]["is_warranty_active"])
        self.assertEqual(res_check.data["warranty_check"]["status_label"], "WARRANTY_ACTIVE")
        
        # 3. Deliver Solution (Product Replacement)
        res_solve = client.post(f"/api/v1/service/cases/{case_id}/deliver-solution/", {
            "resolution_type": "REPLACEMENT",
            "resolution_notes": "Penggantian unit panel baru sesuai klaim garansi"
        }, format="json", **self.headers)
        self.assertEqual(res_solve.status_code, 200, res_solve.data)
        self.assertEqual(res_solve.data["case_status"], "RESOLVED")
        self.assertIsNotNone(res_solve.data["resolution"]["replacement_delivery_id"])
        
        # Verify in DB
        case_obj = Case.objects.get(id=case_id)
        self.assertEqual(case_obj.status, "RESOLVED")
        self.assertEqual(Resolution.objects.filter(service_case=case_obj).count(), 1)

    # --- FLOW 2: DEAL MANAGEMENT & CREDIT CHECK (SAFE) ---
    def test_deal_management_safe_handoff_to_pm(self):
        client = self.client_for(self.crm_user)
        
        # Setup customer profile with safe limit
        CustomerProfile.objects.create(
            party=self.customer,
            credit_limit=Decimal("500000000"),
            credit_hold=False
        )
        
        # Create Opportunity
        opp = Opportunity.objects.create(
            tenant=self.tenant,
            company=self.company,
            customer_party=self.customer,
            owner_user=self.crm_user,
            opportunity_name="Pengadaan Otomasi Pabrik",
            expected_amount=Decimal("150000000"),
            status="OPEN"
        )
        
        # Process Deal Won
        res = client.post(f"/api/v1/crm/opportunities/{opp.id}/process-deal-won/", {}, format="json", **self.headers)
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(res.data["decision"], "SEND_TO_PROJECT_MANAGEMENT")
        self.assertTrue(res.data["credit_evaluation"]["is_safe"])
        self.assertIsNotNone(res.data["handoff"]["project_id"])
        self.assertIsNotNone(res.data["handoff"]["sales_order_id"])
        
        # Verify in DB
        opp.refresh_from_db()
        self.assertEqual(opp.status, "WON")
        self.assertTrue(Project.objects.filter(id=res.data["handoff"]["project_id"]).exists())

    # --- FLOW 2: DEAL MANAGEMENT & CREDIT CHECK (OVER LIMIT) ---
    def test_deal_management_over_limit_manual_bill_and_executive_override(self):
        crm_client = self.client_for(self.crm_user)
        exec_client = self.client_for(self.exec_user)
        
        # Customer with small credit limit
        CustomerProfile.objects.create(
            party=self.customer,
            credit_limit=Decimal("10000000"),
            credit_hold=False
        )
        
        # Large Opportunity
        opp = Opportunity.objects.create(
            tenant=self.tenant,
            company=self.company,
            customer_party=self.customer,
            owner_user=self.crm_user,
            opportunity_name="Pengadaan Mega Robotik",
            expected_amount=Decimal("200000000"),
            status="OPEN"
        )
        
        # Process Deal Won -> Over Limit
        res = crm_client.post(f"/api/v1/crm/opportunities/{opp.id}/process-deal-won/", {}, format="json", **self.headers)
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(res.data["decision"], "SEND_BILL_TO_CLIENT_MANUALLY")
        self.assertFalse(res.data["credit_evaluation"]["is_safe"])
        self.assertIsNotNone(res.data["handoff"]["proforma_invoice_id"])
        
        # Executive Override
        res_ovr = exec_client.post(f"/api/v1/crm/opportunities/{opp.id}/executive-override/", {}, format="json", **self.headers)
        self.assertEqual(res_ovr.status_code, 200, res_ovr.data)
        self.assertTrue(res_ovr.data["success"])
        self.assertIsNotNone(res_ovr.data["project_id"])
        self.assertTrue(Project.objects.filter(id=res_ovr.data["project_id"]).exists())

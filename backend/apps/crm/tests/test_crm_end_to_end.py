from decimal import Decimal

from django.test import TestCase
from rest_framework.test import APIClient

from apps.accounts.models import Role, User, UserRole
from apps.core.models import Company, Tenant
from apps.crm.models import CostEstimate, CustomerInquiry, ExecutiveApproval, InquiryRequirement, QuotationDelivery
from apps.master_data.models import Currency, Party, Product, UOM
from apps.sales.models import Order, Quotation


class CRMEndToEndTests(TestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(code="CRM-UAT", name="CRM UAT", status="ACTIVE")
        self.currency = Currency.objects.create(currency_code="IDR-CRM", currency_name="Rupiah")
        self.company = Company.objects.create(tenant=self.tenant, company_code="CRM-UAT", legal_name="CRM Company", base_currency=self.currency, status="ACTIVE")
        self.crm = self.make_user("crm-user", "CRM")
        self.executive = self.make_user("executive-user", "EXECUTIVE")
        self.customer = Party.objects.create(tenant=self.tenant, party_code="CUST-CRM", party_type="ORGANIZATION", legal_name="CRM Customer", display_name="CRM Customer", default_currency=self.currency, status="ACTIVE")
        self.uom = UOM.objects.create(tenant=self.tenant, uom_code="UNIT-CRM", uom_name="Unit")
        self.product = Product.objects.create(tenant=self.tenant, base_uom=self.uom, product_code="PROD-CRM", product_name="CRM Product", sales_item=True, status="ACTIVE")
        self.headers = {"HTTP_X_COMPANY_ID": str(self.company.id)}

    def make_user(self, username, role_code):
        user = User.objects.create_user(username=username, email=f"{username}@example.com", password="secret", tenant=self.tenant)
        role = Role.objects.create(tenant=self.tenant, role_code=role_code, role_name=role_code)
        UserRole.objects.create(user=user, role=role, company=self.company)
        return user

    def client_for(self, user):
        client = APIClient(); client.force_authenticate(user); return client

    def create_inquiry(self):
        response = self.client_for(self.crm).post("/api/v1/crm/customer-inquiries/", {"customer_party": str(self.customer.id), "subject": "Factory automation", "description": "Need five units"}, format="json", **self.headers)
        self.assertEqual(response.status_code, 201, response.data)
        return response.data["id"]

    def test_inquiry_requires_specification_before_qualification(self):
        inquiry_id = self.create_inquiry()
        blocked = self.client_for(self.crm).post(f"/api/v1/crm/customer-inquiries/{inquiry_id}/qualify/", {}, format="json", **self.headers)
        self.assertEqual(blocked.status_code, 400, blocked.data)
        InquiryRequirement.objects.create(inquiry_id=inquiry_id, product=self.product, uom=self.uom, description="Five automation units", quantity=5, target_unit_price=150)
        qualified = self.client_for(self.crm).post(f"/api/v1/crm/customer-inquiries/{inquiry_id}/qualify/", {}, format="json", **self.headers)
        self.assertEqual(qualified.status_code, 200, qualified.data)
        self.assertEqual(CustomerInquiry.objects.get(pk=inquiry_id).status, "QUALIFIED")

    def test_estimate_quotation_approval_send_accept_and_convert(self):
        inquiry_id = self.create_inquiry()
        requirement = InquiryRequirement.objects.create(inquiry_id=inquiry_id, product=self.product, uom=self.uom, description="Five automation units", quantity=5)
        crm = self.client_for(self.crm)
        opportunity_id = crm.post(f"/api/v1/crm/customer-inquiries/{inquiry_id}/qualify/", {}, format="json", **self.headers).data["opportunity_id"]
        estimate_response = crm.post("/api/v1/crm/cost-estimates/", {"inquiry": inquiry_id, "opportunity": opportunity_id, "markup_percent": "25", "contingency_amount": "100"}, format="json", **self.headers)
        self.assertEqual(estimate_response.status_code, 201, estimate_response.data)
        estimate_id = estimate_response.data["id"]
        line = crm.post("/api/v1/crm/cost-estimate-lines/", {"estimate": estimate_id, "requirement": str(requirement.id), "product": str(self.product.id), "cost_element": "MATERIAL", "description": "Material", "quantity": "5", "unit_cost": "100"}, format="json", **self.headers)
        self.assertEqual(line.status_code, 201, line.data)
        calculated = crm.post(f"/api/v1/crm/cost-estimates/{estimate_id}/calculate/", {}, format="json", **self.headers)
        self.assertEqual(calculated.status_code, 200, calculated.data)
        self.assertEqual(Decimal(calculated.data["total_cost"]), Decimal("600"))
        self.assertEqual(Decimal(calculated.data["offered_amount"]), Decimal("750"))
        quotation_response = crm.post(f"/api/v1/crm/cost-estimates/{estimate_id}/create-quotation/", {}, format="json", **self.headers)
        self.assertEqual(quotation_response.status_code, 201, quotation_response.data)
        quotation_id = quotation_response.data["quotation_id"]
        approval_response = crm.post(f"/api/v1/sales/quotations/{quotation_id}/submit-approval/", {}, format="json", **self.headers)
        self.assertEqual(approval_response.status_code, 200, approval_response.data)
        approval_id = approval_response.data["approval_id"]
        denied = crm.post(f"/api/v1/crm/executive-approvals/{approval_id}/decide/", {"decision": "APPROVED"}, format="json", **self.headers)
        self.assertEqual(denied.status_code, 403)
        approved = self.client_for(self.executive).post(f"/api/v1/crm/executive-approvals/{approval_id}/decide/", {"decision": "APPROVED"}, format="json", **self.headers)
        self.assertEqual(approved.status_code, 200, approved.data)
        sent = crm.post(f"/api/v1/sales/quotations/{quotation_id}/send/", {"channel": "EMAIL", "recipient": "buyer@example.com"}, format="json", **self.headers)
        self.assertEqual(sent.status_code, 200, sent.data)
        accepted = crm.post(f"/api/v1/sales/quotations/{quotation_id}/customer-decision/", {"accepted": True}, format="json", **self.headers)
        self.assertEqual(accepted.status_code, 200, accepted.data)
        converted = crm.post(f"/api/v1/commands/sales/quotations/{quotation_id}/convert-to-order/", {"fulfillment_method": "PROJECT"}, format="json", **self.headers)
        self.assertEqual(converted.status_code, 201, converted.data)
        self.assertTrue(Order.objects.filter(quotation_id=quotation_id).exists())
        self.assertEqual(Quotation.objects.get(pk=quotation_id).status, "CONVERTED")
        self.assertTrue(QuotationDelivery.objects.filter(quotation_id=quotation_id, status="SENT").exists())

    def test_quotation_generation_is_idempotent(self):
        inquiry_id = self.create_inquiry()
        InquiryRequirement.objects.create(inquiry_id=inquiry_id, product=self.product, uom=self.uom, description="One unit", quantity=1)
        crm = self.client_for(self.crm)
        opportunity_id = crm.post(f"/api/v1/crm/customer-inquiries/{inquiry_id}/qualify/", {}, format="json", **self.headers).data["opportunity_id"]
        estimate = CostEstimate.objects.create(tenant=self.tenant, company=self.company, inquiry_id=inquiry_id, opportunity_id=opportunity_id, estimate_number="EST-IDEMP", markup_percent=10, status="DRAFT")
        estimate.lines.create(product=self.product, cost_element="MATERIAL", description="One", quantity=1, unit_cost=100, amount=100)
        crm.post(f"/api/v1/crm/cost-estimates/{estimate.id}/calculate/", {}, format="json", **self.headers)
        first = crm.post(f"/api/v1/crm/cost-estimates/{estimate.id}/create-quotation/", {}, format="json", **self.headers)
        second = crm.post(f"/api/v1/crm/cost-estimates/{estimate.id}/create-quotation/", {}, format="json", **self.headers)
        self.assertEqual(first.data["quotation_id"], second.data["quotation_id"])
        self.assertFalse(second.data["created"])

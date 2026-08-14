from decimal import Decimal

from django.test import TestCase
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.core.models import BusinessDocument, Company, Notification, Tenant
from apps.inventory.models import StockBalance, StockReservation
from apps.manufacturing.models import ProductionOrder
from apps.procurement.models import PurchaseRequisition
from apps.master_data.models import Currency, Product, Warehouse, WarehouseLocation
from apps.projects.models import Member, Project, ProjectDispatch, ProjectLifecycleEvent, ProjectReadinessCheck
from apps.sales.models import Order, OrderLine


class IncomingOrderProjectFlowTests(TestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(code="PROJECT-FLOW", name="Project Flow", status="ACTIVE")
        self.currency = Currency.objects.create(currency_code="IDR", currency_name="Rupiah")
        self.company = Company.objects.create(
            tenant=self.tenant, company_code="PF", legal_name="PT Project Flow",
            base_currency=self.currency, status="ACTIVE",
        )
        self.user = User.objects.create_user(
            username="project.manager", email="project.manager@example.com",
            password="secret", tenant=self.tenant,
        )
        self.product = Product.objects.create(product_code="MAT-001", product_name="Material Project", status="ACTIVE")
        self.warehouse = Warehouse.objects.create(
            company=self.company, warehouse_code="WH", warehouse_name="Main Warehouse", status="ACTIVE",
        )
        self.location = WarehouseLocation.objects.create(
            warehouse=self.warehouse, location_code="STOCK", location_name="Stock", active=True,
        )
        self.order_document = BusinessDocument.objects.create(
            tenant=self.tenant, company=self.company, document_type="SALES_ORDER",
            document_number="SO-PROJECT-001", status="APPROVED",
        )
        self.order = Order.objects.create(
            document=self.order_document, currency=self.currency, total_amount=Decimal("1000"), status="CONFIRMED",
        )
        OrderLine.objects.create(
            sales_order=self.order, product=self.product, ordered_quantity=Decimal("5"), unit_price=Decimal("200"),
            fulfillment_method="PROJECT",
        )
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        self.headers = {"HTTP_X_COMPANY_ID": str(self.company.id)}

    def post(self, path, data=None):
        return self.client.post(path, data or {}, format="json", **self.headers)

    def convert(self, budget="1000"):
        return self.post(
            f"/api/v1/commands/sales/orders/{self.order.id}/convert-to-project/",
            {"warehouse_id": str(self.warehouse.id), "budget_amount": budget, "project_name": "Order Project"},
        )

    def test_complete_flow_converts_verifies_reserves_and_starts(self):
        response = self.convert()
        self.assertEqual(response.status_code, 201, response.data)
        project = Project.objects.get(sales_order=self.order)
        self.assertEqual(project.project_manager, self.user)
        self.assertTrue(Member.objects.filter(project=project, user=self.user, project_role="PROJECT_MANAGER", status="ACTIVE").exists())
        visible = self.client.get("/api/v1/projects/projects/", **self.headers)
        self.assertEqual(visible.status_code, 200)
        self.assertEqual(visible.data["count"], 1)

        StockBalance.objects.create(
            company=self.company, product=self.product, warehouse_location=self.location,
            on_hand_quantity=Decimal("10"), reserved_quantity=Decimal("0"),
            available_quantity=Decimal("10"), inventory_value=Decimal("1000"),
        )
        response = self.post(f"/api/v1/commands/projects/projects/{project.id}/verify/")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["data"]["flow_status"], "VERIFIED")

        response = self.post(f"/api/v1/commands/projects/projects/{project.id}/reserve-materials/")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertTrue(response.data["data"]["checks"]["material_reserved"])
        self.assertEqual(StockReservation.objects.filter(project=project, status="ACTIVE").count(), 1)

        response = self.post(f"/api/v1/commands/projects/projects/{project.id}/start/")
        self.assertEqual(response.status_code, 200, response.data)
        project.refresh_from_db()
        self.assertEqual(project.status, "IN_PROGRESS")
        self.assertEqual(Notification.objects.filter(source_document=project.document).count(), 3)
        self.assertEqual(ProjectDispatch.objects.filter(project=project, status="SENT").count(), 3)
        self.assertSetEqual(set(ProjectDispatch.objects.filter(project=project).values_list("target_department", flat=True)), {"FINANCE", "WAREHOUSE", "PRODUCTION"})
        self.assertTrue(ProductionOrder.objects.filter(project=project, status="RELEASED").exists())
        self.assertEqual(project.lifecycle_status, "IN_PROGRESS")
        self.assertTrue(ProjectLifecycleEvent.objects.filter(project=project, action="VERIFY").exists())
        self.assertTrue(ProjectLifecycleEvent.objects.filter(project=project, action="RESERVE_MATERIALS").exists())
        self.assertTrue(ProjectLifecycleEvent.objects.filter(project=project, action="START").exists())
        self.assertFalse(ProjectReadinessCheck.objects.filter(project=project, status="FAILED").exists())

    def test_verify_reports_shortage_and_creates_resource_request(self):
        self.convert()
        project = Project.objects.get(sales_order=self.order)

        response = self.post(f"/api/v1/commands/projects/projects/{project.id}/verify/")

        self.assertEqual(response.status_code, 400, response.data)
        self.assertEqual(response.data["errors"]["code"], "PROJECT_PREREQUISITES_MISSING")
        self.assertTrue(response.data["errors"]["shortages"])
        project.refresh_from_db()
        self.assertEqual(project.status, "VERIFICATION_FAILED")
        self.assertEqual(project.projects_resourcerequest_project_set.filter(status="PENDING_STOCK").count(), 1)
        self.assertEqual(PurchaseRequisition.objects.filter(project=project, status="PENDING_APPROVAL").count(), 1)

    def test_start_is_rejected_before_verification_and_reservation(self):
        self.convert()
        project = Project.objects.get(sales_order=self.order)

        response = self.post(f"/api/v1/commands/projects/projects/{project.id}/start/")

        self.assertEqual(response.status_code, 400, response.data)
        project.refresh_from_db()
        self.assertEqual(project.status, "DRAFT")

    def test_conversion_is_idempotent(self):
        self.assertEqual(self.convert().status_code, 201)
        response = self.convert()
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(Project.objects.filter(sales_order=self.order).count(), 1)

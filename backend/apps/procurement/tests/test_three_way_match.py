from decimal import Decimal

from django.test import TestCase
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.core.models import Tenant
from apps.finance.models import BillingDocument, BillingDocumentLine
from apps.master_data.models import Currency, Party
from apps.procurement.models import (
    GoodsReceipt,
    GoodsReceiptLine,
    PurchaseOrder,
    PurchaseOrderLine,
    ThreeWayMatch,
)


class ThreeWayMatchWorkflowTests(TestCase):
    def setUp(self):
        tenant = Tenant.objects.create(code="TWM", name="Three Way Match", status="ACTIVE")
        self.user = User.objects.create_user(
            username="matcher", email="matcher@example.com", password="secret", tenant=tenant
        )
        self.currency = Currency.objects.create(currency_code="IDR", currency_name="Rupiah")
        self.supplier = Party.objects.create(
            tenant=tenant, legal_name="Supplier", party_type="ORGANIZATION", status="ACTIVE"
        )
        self.purchase_order = PurchaseOrder.objects.create(
            supplier_party=self.supplier,
            currency=self.currency,
            subtotal=Decimal("100"),
            tax_amount=Decimal("11"),
            total_amount=Decimal("111"),
            status="SENT",
        )
        PurchaseOrderLine.objects.create(
            purchase_order=self.purchase_order,
            ordered_quantity=Decimal("10"),
            unit_price=Decimal("10"),
        )
        self.invoice = BillingDocument.objects.create(
            purchase_order=self.purchase_order,
            party=self.supplier,
            currency=self.currency,
            billing_type="SUPPLIER_BILL",
            invoice_number="INV-TWM",
            tax_amount=Decimal("11"),
            status="DRAFT",
        )
        BillingDocumentLine.objects.create(
            billing_document=self.invoice,
            quantity=Decimal("10"),
            unit_price=Decimal("10"),
            line_total=Decimal("100"),
        )
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def match(self):
        return self.client.post(
            f"/api/v1/commands/procurement/purchase-orders/{self.purchase_order.id}/three-way-match/",
            {"supplier_invoice_id": str(self.invoice.id)},
            format="json",
        )

    def test_draft_invoice_uses_its_lines_and_all_receipts(self):
        first = GoodsReceipt.objects.create(purchase_order=self.purchase_order, status="COMPLETED")
        second = GoodsReceipt.objects.create(purchase_order=self.purchase_order, status="COMPLETED")
        GoodsReceiptLine.objects.create(goods_receipt=first, received_quantity=Decimal("4"))
        GoodsReceiptLine.objects.create(goods_receipt=second, accepted_quantity=Decimal("6"))

        response = self.match()

        self.assertEqual(response.status_code, 200, response.data)
        match = ThreeWayMatch.objects.get(
            purchase_order=self.purchase_order, supplier_invoice=self.invoice
        )
        self.assertEqual(match.match_status, "MATCHED")
        self.assertEqual(match.quantity_variance, Decimal("0"))
        self.assertEqual(match.price_variance, Decimal("0"))
        self.assertEqual(match.tax_variance, Decimal("0"))

    def test_missing_receipt_is_reported_specifically(self):
        response = self.match()

        self.assertEqual(response.status_code, 400, response.data)
        self.assertIn("goods_receipt", str(response.data))
        self.assertIn("THREE_WAY_MATCH_PREREQUISITES_MISSING", str(response.data))

    def test_invoice_from_another_po_is_not_matched(self):
        GoodsReceipt.objects.create(purchase_order=self.purchase_order, status="COMPLETED")
        other_invoice = BillingDocument.objects.create(
            billing_type="SUPPLIER_BILL", invoice_number="INV-OTHER", status="DRAFT"
        )

        response = self.client.post(
            f"/api/v1/commands/procurement/purchase-orders/{self.purchase_order.id}/three-way-match/",
            {"supplier_invoice_id": str(other_invoice.id)},
            format="json",
        )

        self.assertEqual(response.status_code, 400, response.data)
        self.assertFalse(ThreeWayMatch.objects.filter(supplier_invoice=other_invoice).exists())

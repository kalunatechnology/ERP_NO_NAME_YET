from decimal import Decimal

from django.test import TestCase
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.core.models import Company, Tenant
from apps.finance.models import (
    Account, BankAccount, BillingDocument, BillingDocumentLine,
    Journal, JournalLine, Payment, PaymentAllocation,
)
from apps.master_data.models import Currency, Party, SupplierProfile


class OutgoingPaymentWorkflowTests(TestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(code="TEN", name="Tenant", status="ACTIVE")
        self.currency = Currency.objects.create(currency_code="IDR", currency_name="Rupiah")
        self.company = Company.objects.create(tenant=self.tenant, legal_name="PT Test", base_currency=self.currency, status="ACTIVE")
        self.vendor = Party.objects.create(tenant=self.tenant, legal_name="Vendor", party_type="ORGANIZATION", default_currency=self.currency, status="ACTIVE")
        self.payable = Account.objects.create(company=self.company, account_code="2100", account_name="Hutang Usaha", account_type="LIABILITY", status="ACTIVE")
        self.bank_ledger = Account.objects.create(company=self.company, account_code="1101", account_name="Bank", account_type="ASSET", status="ACTIVE")
        SupplierProfile.objects.create(party=self.vendor, supplier_code="V001", payable_account=self.payable, approved_supplier=True)
        self.bank = BankAccount.objects.create(company=self.company, currency=self.currency, ledger_account=self.bank_ledger, bank_name="Bank Test", account_number="001", status="ACTIVE")
        Journal.objects.create(company=self.company, journal_code="BANK", journal_name="Bank Payment", journal_type="BANK", status="ACTIVE")
        self.maker = User.objects.create_user(username="maker", email="maker@example.com", password="secret", tenant=self.tenant)
        self.approver = User.objects.create_user(username="approver", email="approver@example.com", password="secret", tenant=self.tenant)
        self.billing = BillingDocument.objects.create(
            company=self.company, party=self.vendor, currency=self.currency,
            billing_type="SUPPLIER_BILL", invoice_number="INV-001",
            tax_amount=Decimal("0"), status="DRAFT",
        )
        BillingDocumentLine.objects.create(
            billing_document=self.billing, account=self.payable,
            quantity=Decimal("1"), unit_price=Decimal("1000000"),
            discount_amount=Decimal("0"), line_total=Decimal("1000000"),
        )
        self.client = APIClient()
        self.headers = {"HTTP_X_COMPANY_ID": str(self.company.id)}

    def post_as(self, user, path, data=None):
        self.client.force_authenticate(user)
        return self.client.post(path, data or {}, format="json", **self.headers)

    def test_complete_outgoing_payment_posts_balanced_journal_and_pays_bill(self):
        response = self.post_as(self.maker, f"/api/v1/commands/finance/billing-documents/{self.billing.id}/verify/")
        self.assertEqual(response.status_code, 200, response.data)
        response = self.post_as(self.approver, f"/api/v1/commands/finance/billing-documents/{self.billing.id}/approve/")
        self.assertEqual(response.status_code, 200, response.data)
        response = self.post_as(self.approver, f"/api/v1/commands/finance/billing-documents/{self.billing.id}/post/")
        self.assertEqual(response.status_code, 200, response.data)

        response = self.post_as(self.maker, "/api/v1/commands/finance/payment-batches/create/", {
            "bank_account_id": str(self.bank.id), "payment_date": "2026-08-11",
            "payment_method": "MANUAL_TRANSFER",
            "allocations": [{"billing_document_id": str(self.billing.id), "allocated_amount": "1000000"}],
        })
        self.assertEqual(response.status_code, 201, response.data)
        payment = Payment.objects.get(pk=response.data["data"]["id"])

        self.assertEqual(self.post_as(self.maker, f"/api/v1/commands/finance/payments/{payment.id}/submit/").status_code, 200)
        self.assertEqual(self.post_as(self.approver, f"/api/v1/commands/finance/payments/{payment.id}/approve/").status_code, 200)
        response = self.post_as(self.maker, f"/api/v1/commands/finance/payments/{payment.id}/execute/", {
            "execution_reference": "BANK-TRX-001", "note": "Transfer dikonfirmasi",
        })
        self.assertEqual(response.status_code, 200, response.data)

        payment.refresh_from_db()
        self.billing.refresh_from_db()
        lines = JournalLine.objects.filter(journal_entry=payment.journal_entry)
        self.assertEqual(payment.status, "ALLOCATED")
        self.assertEqual(self.billing.payment_status, "PAID")
        self.assertEqual(self.billing.outstanding_amount, Decimal("0"))
        self.assertEqual(PaymentAllocation.objects.filter(payment=payment).count(), 1)
        self.assertEqual(sum((line.debit_base or Decimal("0") for line in lines), Decimal("0")), Decimal("1000000"))
        self.assertEqual(sum((line.credit_base or Decimal("0") for line in lines), Decimal("0")), Decimal("1000000"))

    def test_maker_cannot_approve_own_payment(self):
        payment = Payment.objects.create(
            company=self.company, party=self.vendor, currency=self.currency, bank_account=self.bank,
            payment_type="OUTGOING", amount=Decimal("1"), status="SUBMITTED",
            submitted_by=self.maker, allocation_plan=[{"billing_document_id": str(self.billing.id), "allocated_amount": "1"}],
        )
        response = self.post_as(self.maker, f"/api/v1/commands/finance/payments/{payment.id}/approve/")
        self.assertEqual(response.status_code, 400)

    def test_draft_billing_can_be_deleted_with_its_lines(self):
        billing_id = self.billing.id
        self.client.force_authenticate(self.maker)

        response = self.client.delete(
            f"/api/v1/finance/billing-documents/{billing_id}/",
            **self.headers,
        )

        self.assertEqual(response.status_code, 204, getattr(response, "data", None))
        self.assertFalse(BillingDocument.objects.filter(pk=billing_id).exists())
        self.assertFalse(BillingDocumentLine.objects.filter(billing_document_id=billing_id).exists())

    def test_verified_billing_cannot_be_deleted(self):
        response = self.post_as(
            self.maker,
            f"/api/v1/commands/finance/billing-documents/{self.billing.id}/verify/",
        )
        self.assertEqual(response.status_code, 200, response.data)

        response = self.client.delete(
            f"/api/v1/finance/billing-documents/{self.billing.id}/",
            **self.headers,
        )

        self.assertEqual(response.status_code, 400, response.data)
        self.assertTrue(BillingDocument.objects.filter(pk=self.billing.id).exists())

from drf_spectacular.utils import extend_schema_serializer
from rest_framework import serializers
from apps.api_common.serializers import ERPModelSerializer
from apps.finance.models import FiscalYear, FiscalPeriod, Account, Journal, JournalEntry, JournalLine, BillingDocument, BillingDocumentLine, ARAPSchedule, Payment, PaymentAllocation, BankAccount, BankStatement, BankStatementLine, BankReconciliation, TaxTransaction, Budget, BudgetLine, PeriodClosing, FinancialSnapshot, UnitCostSnapshot, RecurringPaymentRule, RecurringPaymentRun, CreditFacility, ProjectWIPSnapshot, ProjectFunding, ProjectFundingTransaction, CostBaseline, CostBaselineLine, CostVariance, OverheadRule, OverheadAllocation, ProjectCostSnapshot, ProjectCostEntry, BillingProposal, InvoiceVarianceCase

class FiscalYearSerializer(ERPModelSerializer):
    class Meta:
        model = FiscalYear
        fields = "__all__"


class FiscalPeriodSerializer(ERPModelSerializer):
    class Meta:
        model = FiscalPeriod
        fields = "__all__"


class AccountSerializer(ERPModelSerializer):
    class Meta:
        model = Account
        fields = "__all__"


class JournalSerializer(ERPModelSerializer):
    class Meta:
        model = Journal
        fields = "__all__"


class JournalEntrySerializer(ERPModelSerializer):
    class Meta:
        model = JournalEntry
        fields = "__all__"


class JournalLineSerializer(ERPModelSerializer):
    class Meta:
        model = JournalLine
        fields = "__all__"


class BillingDocumentSerializer(ERPModelSerializer):
    def validate(self, attrs):
        attrs = super().validate(attrs)
        purchase_order = attrs.get("purchase_order", getattr(self.instance, "purchase_order", None))
        party = attrs.get("party", getattr(self.instance, "party", None))
        currency = attrs.get("currency", getattr(self.instance, "currency", None))
        if purchase_order:
            from apps.procurement.models import GoodsReceipt, PurchaseOrderLine

            errors = {}
            if purchase_order.supplier_party_id and party and purchase_order.supplier_party_id != party.id:
                errors["party"] = "Vendor invoice harus sama dengan supplier pada Purchase Order."
            if purchase_order.currency_id and currency and purchase_order.currency_id != currency.id:
                errors["currency"] = "Currency invoice harus sama dengan Purchase Order."
            if purchase_order.status in {"CANCELLED", "CLOSED"}:
                errors["purchase_order"] = "Purchase Order cancelled/closed tidak dapat ditagihkan."
            if not PurchaseOrderLine.objects.filter(purchase_order=purchase_order).exists():
                errors["purchase_order_lines"] = "Purchase Order belum memiliki line."
            if not GoodsReceipt.objects.filter(purchase_order=purchase_order).exists():
                errors["goods_receipt"] = "Purchase Order belum memiliki Goods Receipt."
            if errors:
                raise serializers.ValidationError(errors)
        return attrs

    class Meta:
        model = BillingDocument
        fields = "__all__"
        read_only_fields = ("subtotal", "total_amount", "paid_amount", "outstanding_amount", "payment_status", "status", "posting_date", "verified_by", "verified_at", "approved_by", "approved_at", "rejection_reason")


class BillingDocumentLineSerializer(ERPModelSerializer):
    class Meta:
        model = BillingDocumentLine
        fields = "__all__"


class ARAPScheduleSerializer(ERPModelSerializer):
    class Meta:
        model = ARAPSchedule
        fields = "__all__"


class PaymentSerializer(ERPModelSerializer):
    class Meta:
        model = Payment
        fields = "__all__"
        read_only_fields = ("document", "journal_entry", "status", "allocation_plan", "submitted_by", "submitted_at", "approved_by", "approved_at", "executed_by", "executed_at", "execution_reference", "execution_note", "failure_reason")


class PaymentAllocationSerializer(ERPModelSerializer):
    class Meta:
        model = PaymentAllocation
        fields = "__all__"


class BankAccountSerializer(ERPModelSerializer):
    class Meta:
        model = BankAccount
        fields = "__all__"


class BankStatementSerializer(ERPModelSerializer):
    class Meta:
        model = BankStatement
        fields = "__all__"


class BankStatementLineSerializer(ERPModelSerializer):
    class Meta:
        model = BankStatementLine
        fields = "__all__"


class BankReconciliationSerializer(ERPModelSerializer):
    class Meta:
        model = BankReconciliation
        fields = "__all__"


class TaxTransactionSerializer(ERPModelSerializer):
    class Meta:
        model = TaxTransaction
        fields = "__all__"


class BudgetSerializer(ERPModelSerializer):
    class Meta:
        model = Budget
        fields = "__all__"


@extend_schema_serializer(component_name="FinanceBudgetLine")
class BudgetLineSerializer(ERPModelSerializer):
    class Meta:
        model = BudgetLine
        fields = "__all__"


class PeriodClosingSerializer(ERPModelSerializer):
    class Meta:
        model = PeriodClosing
        fields = "__all__"


class FinancialSnapshotSerializer(ERPModelSerializer):
    class Meta:
        model = FinancialSnapshot
        fields = "__all__"


class UnitCostSnapshotSerializer(ERPModelSerializer):
    class Meta:
        model = UnitCostSnapshot
        fields = "__all__"


class RecurringPaymentRuleSerializer(ERPModelSerializer):
    class Meta:
        model = RecurringPaymentRule
        fields = "__all__"


class RecurringPaymentRunSerializer(ERPModelSerializer):
    class Meta:
        model = RecurringPaymentRun
        fields = "__all__"


class CreditFacilitySerializer(ERPModelSerializer):
    class Meta:
        model = CreditFacility
        fields = "__all__"


class ProjectWIPSnapshotSerializer(ERPModelSerializer):
    class Meta:
        model = ProjectWIPSnapshot
        fields = "__all__"


class ProjectFundingSerializer(ERPModelSerializer):
    requested_by_name = serializers.CharField(source="requested_by.full_name", read_only=True)
    requested_by_email = serializers.EmailField(source="requested_by.email", read_only=True)
    project_code = serializers.CharField(source="project.project_code", read_only=True)
    project_name = serializers.CharField(source="project.project_name", read_only=True)

    class Meta:
        model = ProjectFunding
        fields = "__all__"
        read_only_fields = ("status", "validation_note", "validated_by", "validated_at", "billing_code", "payment_reference", "paid_at", "ntpn", "reported_at")


class InvoiceVarianceCaseSerializer(ERPModelSerializer):
    invoice_number = serializers.CharField(source="billing_document.invoice_number", read_only=True)

    class Meta:
        model = InvoiceVarianceCase
        fields = "__all__"
        read_only_fields = ("status", "resolved_by", "resolved_at")
        read_only_fields = (
            "requested_by", "submitted_at", "verified_by", "verified_at",
            "approved_by", "approved_at", "rejected_by", "rejected_at", "project",
        )

    def validate(self, attrs):
        attrs = super().validate(attrs)
        amount = attrs.get("requested_amount", getattr(self.instance, "requested_amount", None))
        if amount is not None and amount <= 0:
            raise serializers.ValidationError({"requested_amount": "Nilai pengajuan harus lebih dari nol."})
        return attrs


class ProjectFundingTransactionSerializer(ERPModelSerializer):
    class Meta:
        model = ProjectFundingTransaction
        fields = "__all__"


class CostBaselineSerializer(ERPModelSerializer):
    class Meta:
        model = CostBaseline
        fields = "__all__"


class CostBaselineLineSerializer(ERPModelSerializer):
    class Meta:
        model = CostBaselineLine
        fields = "__all__"


class CostVarianceSerializer(ERPModelSerializer):
    class Meta:
        model = CostVariance
        fields = "__all__"


class OverheadRuleSerializer(ERPModelSerializer):
    class Meta:
        model = OverheadRule
        fields = "__all__"


class OverheadAllocationSerializer(ERPModelSerializer):
    class Meta:
        model = OverheadAllocation
        fields = "__all__"


class ProjectCostSnapshotSerializer(ERPModelSerializer):
    class Meta:
        model = ProjectCostSnapshot
        fields = "__all__"


class ProjectCostEntrySerializer(ERPModelSerializer):
    project_code = serializers.CharField(source="project.project_code", read_only=True)
    project_name = serializers.CharField(source="project.project_name", read_only=True)

    class Meta:
        model = ProjectCostEntry
        fields = "__all__"
        read_only_fields = ("status", "created_by", "validated_by", "validated_at", "posted_by", "posted_at", "journal_entry")

    def validate(self, attrs):
        attrs = super().validate(attrs)
        quantity = attrs.get("quantity", 1)
        unit_cost = attrs.get("unit_cost", 0)
        total = attrs.get("total_cost", 0)
        if quantity <= 0:
            raise serializers.ValidationError({"quantity": "Quantity harus lebih dari nol."})
        if unit_cost < 0 or total < 0:
            raise serializers.ValidationError({"total_cost": "Nilai biaya tidak boleh negatif."})
        attrs["total_cost"] = total or quantity * unit_cost
        return attrs


class BillingProposalSerializer(ERPModelSerializer):
    project_code = serializers.CharField(source="project.project_code", read_only=True)
    project_name = serializers.CharField(source="project.project_name", read_only=True)
    customer_name = serializers.CharField(source="customer.party_name", read_only=True)

    class Meta:
        model = BillingProposal
        fields = "__all__"
        read_only_fields = ("tax_amount", "total_amount", "status", "requested_by", "submitted_at", "approved_by", "approved_at", "rejection_reason", "billing_document")

    def validate(self, attrs):
        attrs = super().validate(attrs)
        subtotal = attrs.get("subtotal", 0)
        rate = attrs.get("tax_rate", 0)
        if subtotal <= 0:
            raise serializers.ValidationError({"subtotal": "Nilai tagihan harus lebih dari nol."})
        if rate < 0:
            raise serializers.ValidationError({"tax_rate": "Tax rate tidak boleh negatif."})
        attrs["tax_amount"] = subtotal * rate / 100
        attrs["total_amount"] = subtotal + attrs["tax_amount"]
        return attrs


class CustomerCreditLimitSerializer(ERPModelSerializer):
    customer_name = serializers.CharField(source="customer.party_name", read_only=True)
    available_credit = serializers.DecimalField(max_digits=18, decimal_places=2, read_only=True)

    class Meta:
        from apps.finance.models import CustomerCreditLimit
        model = CustomerCreditLimit
        fields = "__all__"




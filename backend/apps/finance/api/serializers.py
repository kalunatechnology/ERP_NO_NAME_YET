from rest_framework import serializers
from apps.api_common.serializers import ERPModelSerializer
from apps.finance.models import FiscalYear, FiscalPeriod, Account, Journal, JournalEntry, JournalLine, BillingDocument, BillingDocumentLine, ARAPSchedule, Payment, PaymentAllocation, BankAccount, BankStatement, BankStatementLine, BankReconciliation, TaxTransaction, Budget, BudgetLine, PeriodClosing, FinancialSnapshot, UnitCostSnapshot, RecurringPaymentRule, RecurringPaymentRun, CreditFacility, ProjectWIPSnapshot, ProjectFunding, ProjectFundingTransaction, CostBaseline, CostBaselineLine, CostVariance, OverheadRule, OverheadAllocation, ProjectCostSnapshot

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
    class Meta:
        model = BillingDocument
        fields = "__all__"


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
    class Meta:
        model = ProjectFunding
        fields = "__all__"


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



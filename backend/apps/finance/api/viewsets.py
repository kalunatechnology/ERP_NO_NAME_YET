from apps.finance.models import FiscalYear, FiscalPeriod, Account, Journal, JournalEntry, JournalLine, BillingDocument, BillingDocumentLine, ARAPSchedule, Payment, PaymentAllocation, BankAccount, BankStatement, BankStatementLine, BankReconciliation, TaxTransaction, Budget, BudgetLine, PeriodClosing, FinancialSnapshot, UnitCostSnapshot, RecurringPaymentRule, RecurringPaymentRun, CreditFacility, ProjectWIPSnapshot, ProjectFunding, ProjectFundingTransaction, CostBaseline, CostBaselineLine, CostVariance, OverheadRule, OverheadAllocation, ProjectCostSnapshot
from apps.api_common.viewsets import BaseERPModelViewSet, ReadOnlyERPModelViewSet
from .serializers import FiscalYearSerializer, FiscalPeriodSerializer, AccountSerializer, JournalSerializer, JournalEntrySerializer, JournalLineSerializer, BillingDocumentSerializer, BillingDocumentLineSerializer, ARAPScheduleSerializer, PaymentSerializer, PaymentAllocationSerializer, BankAccountSerializer, BankStatementSerializer, BankStatementLineSerializer, BankReconciliationSerializer, TaxTransactionSerializer, BudgetSerializer, BudgetLineSerializer, PeriodClosingSerializer, FinancialSnapshotSerializer, UnitCostSnapshotSerializer, RecurringPaymentRuleSerializer, RecurringPaymentRunSerializer, CreditFacilitySerializer, ProjectWIPSnapshotSerializer, ProjectFundingSerializer, ProjectFundingTransactionSerializer, CostBaselineSerializer, CostBaselineLineSerializer, CostVarianceSerializer, OverheadRuleSerializer, OverheadAllocationSerializer, ProjectCostSnapshotSerializer

class FiscalYearViewSet(BaseERPModelViewSet):
    queryset = FiscalYear.objects.all()
    serializer_class = FiscalYearSerializer


class FiscalPeriodViewSet(BaseERPModelViewSet):
    queryset = FiscalPeriod.objects.all()
    serializer_class = FiscalPeriodSerializer


class AccountViewSet(BaseERPModelViewSet):
    queryset = Account.objects.all()
    serializer_class = AccountSerializer


class JournalViewSet(BaseERPModelViewSet):
    queryset = Journal.objects.all()
    serializer_class = JournalSerializer


class JournalEntryViewSet(BaseERPModelViewSet):
    queryset = JournalEntry.objects.all()
    serializer_class = JournalEntrySerializer


class JournalLineViewSet(BaseERPModelViewSet):
    queryset = JournalLine.objects.all()
    serializer_class = JournalLineSerializer


class BillingDocumentViewSet(BaseERPModelViewSet):
    queryset = BillingDocument.objects.all()
    serializer_class = BillingDocumentSerializer


class BillingDocumentLineViewSet(BaseERPModelViewSet):
    queryset = BillingDocumentLine.objects.all()
    serializer_class = BillingDocumentLineSerializer


class ARAPScheduleViewSet(BaseERPModelViewSet):
    queryset = ARAPSchedule.objects.all()
    serializer_class = ARAPScheduleSerializer


class PaymentViewSet(BaseERPModelViewSet):
    queryset = Payment.objects.all()
    serializer_class = PaymentSerializer


class PaymentAllocationViewSet(BaseERPModelViewSet):
    queryset = PaymentAllocation.objects.all()
    serializer_class = PaymentAllocationSerializer


class BankAccountViewSet(BaseERPModelViewSet):
    queryset = BankAccount.objects.all()
    serializer_class = BankAccountSerializer


class BankStatementViewSet(BaseERPModelViewSet):
    queryset = BankStatement.objects.all()
    serializer_class = BankStatementSerializer


class BankStatementLineViewSet(BaseERPModelViewSet):
    queryset = BankStatementLine.objects.all()
    serializer_class = BankStatementLineSerializer


class BankReconciliationViewSet(BaseERPModelViewSet):
    queryset = BankReconciliation.objects.all()
    serializer_class = BankReconciliationSerializer


class TaxTransactionViewSet(BaseERPModelViewSet):
    queryset = TaxTransaction.objects.all()
    serializer_class = TaxTransactionSerializer


class BudgetViewSet(BaseERPModelViewSet):
    queryset = Budget.objects.all()
    serializer_class = BudgetSerializer


class BudgetLineViewSet(BaseERPModelViewSet):
    queryset = BudgetLine.objects.all()
    serializer_class = BudgetLineSerializer


class PeriodClosingViewSet(BaseERPModelViewSet):
    queryset = PeriodClosing.objects.all()
    serializer_class = PeriodClosingSerializer


class FinancialSnapshotViewSet(BaseERPModelViewSet):
    queryset = FinancialSnapshot.objects.all()
    serializer_class = FinancialSnapshotSerializer


class UnitCostSnapshotViewSet(BaseERPModelViewSet):
    queryset = UnitCostSnapshot.objects.all()
    serializer_class = UnitCostSnapshotSerializer


class RecurringPaymentRuleViewSet(BaseERPModelViewSet):
    queryset = RecurringPaymentRule.objects.all()
    serializer_class = RecurringPaymentRuleSerializer


class RecurringPaymentRunViewSet(BaseERPModelViewSet):
    queryset = RecurringPaymentRun.objects.all()
    serializer_class = RecurringPaymentRunSerializer


class CreditFacilityViewSet(BaseERPModelViewSet):
    queryset = CreditFacility.objects.all()
    serializer_class = CreditFacilitySerializer


class ProjectWIPSnapshotViewSet(BaseERPModelViewSet):
    queryset = ProjectWIPSnapshot.objects.all()
    serializer_class = ProjectWIPSnapshotSerializer


class ProjectFundingViewSet(BaseERPModelViewSet):
    queryset = ProjectFunding.objects.all()
    serializer_class = ProjectFundingSerializer


class ProjectFundingTransactionViewSet(BaseERPModelViewSet):
    queryset = ProjectFundingTransaction.objects.all()
    serializer_class = ProjectFundingTransactionSerializer


class CostBaselineViewSet(BaseERPModelViewSet):
    queryset = CostBaseline.objects.all()
    serializer_class = CostBaselineSerializer


class CostBaselineLineViewSet(BaseERPModelViewSet):
    queryset = CostBaselineLine.objects.all()
    serializer_class = CostBaselineLineSerializer


class CostVarianceViewSet(BaseERPModelViewSet):
    queryset = CostVariance.objects.all()
    serializer_class = CostVarianceSerializer


class OverheadRuleViewSet(BaseERPModelViewSet):
    queryset = OverheadRule.objects.all()
    serializer_class = OverheadRuleSerializer


class OverheadAllocationViewSet(BaseERPModelViewSet):
    queryset = OverheadAllocation.objects.all()
    serializer_class = OverheadAllocationSerializer


class ProjectCostSnapshotViewSet(BaseERPModelViewSet):
    queryset = ProjectCostSnapshot.objects.all()
    serializer_class = ProjectCostSnapshotSerializer



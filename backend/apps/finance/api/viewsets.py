from decimal import Decimal

from django.db import transaction
from django.db.models import Sum
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response

from apps.finance.models import FiscalYear, FiscalPeriod, Account, Journal, JournalEntry, JournalLine, BillingDocument, BillingDocumentLine, ARAPSchedule, Payment, PaymentAllocation, BankAccount, BankStatement, BankStatementLine, BankReconciliation, TaxTransaction, Budget, BudgetLine, PeriodClosing, FinancialSnapshot, UnitCostSnapshot, RecurringPaymentRule, RecurringPaymentRun, CreditFacility, ProjectWIPSnapshot, ProjectFunding, ProjectFundingTransaction, CostBaseline, CostBaselineLine, CostVariance, OverheadRule, OverheadAllocation, ProjectCostSnapshot, ProjectCostEntry, BillingProposal, InvoiceVarianceCase, CustomerCreditLimit
from apps.api_common.viewsets import BaseERPModelViewSet, ReadOnlyERPModelViewSet
from apps.api_common.audit import create_audit_event, snapshot
from apps.projects.access import is_executive, is_finance, is_project_management
from apps.finance.accounting_services import ensure_standard_coa, get_trial_balance_summary, post_invoice_journal, post_payment_journal
from .serializers import FiscalYearSerializer, FiscalPeriodSerializer, AccountSerializer, JournalSerializer, JournalEntrySerializer, JournalLineSerializer, BillingDocumentSerializer, BillingDocumentLineSerializer, ARAPScheduleSerializer, PaymentSerializer, PaymentAllocationSerializer, BankAccountSerializer, BankStatementSerializer, BankStatementLineSerializer, BankReconciliationSerializer, TaxTransactionSerializer, BudgetSerializer, BudgetLineSerializer, PeriodClosingSerializer, FinancialSnapshotSerializer, UnitCostSnapshotSerializer, RecurringPaymentRuleSerializer, RecurringPaymentRunSerializer, CreditFacilitySerializer, ProjectWIPSnapshotSerializer, ProjectFundingSerializer, ProjectFundingTransactionSerializer, CostBaselineSerializer, CostBaselineLineSerializer, CostVarianceSerializer, OverheadRuleSerializer, OverheadAllocationSerializer, ProjectCostSnapshotSerializer, ProjectCostEntrySerializer, BillingProposalSerializer, InvoiceVarianceCaseSerializer, CustomerCreditLimitSerializer


class FiscalYearViewSet(BaseERPModelViewSet):
    queryset = FiscalYear.objects.all()
    serializer_class = FiscalYearSerializer


class FiscalPeriodViewSet(BaseERPModelViewSet):
    queryset = FiscalPeriod.objects.all()
    serializer_class = FiscalPeriodSerializer


class AccountViewSet(BaseERPModelViewSet):
    queryset = Account.objects.all()
    serializer_class = AccountSerializer

    @action(detail=False, methods=["post"])
    def init_standard_coa(self, request):
        """Initializes default Chart of Accounts for standard double-entry bookkeeping."""
        company_id = request.data.get("company")
        from apps.core.models import Company
        company = Company.objects.filter(id=company_id).first() if company_id else None
        accounts = ensure_standard_coa(company)
        serializer = self.get_serializer(list(accounts.values()), many=True)
        return Response({"message": "Bagan Akun (CoA) standar berhasil dibuat.", "accounts": serializer.data})

    @action(detail=False, methods=["get"])
    def trial_balance(self, request):
        """Calculates real-time Trial Balance (Neraca Saldo) across all accounts."""
        company_id = request.query_params.get("company")
        from apps.core.models import Company
        company = Company.objects.filter(id=company_id).first() if company_id else None
        start_date = request.query_params.get("start_date")
        end_date = request.query_params.get("end_date")
        data = get_trial_balance_summary(company, start_date, end_date)
        return Response(data)


class JournalViewSet(BaseERPModelViewSet):
    queryset = Journal.objects.all()
    serializer_class = JournalSerializer


class JournalEntryViewSet(BaseERPModelViewSet):
    queryset = JournalEntry.objects.all().order_by("-posting_date", "-id")
    serializer_class = JournalEntrySerializer

    @action(detail=False, methods=["get"])
    def trial_balance(self, request):
        company_id = request.query_params.get("company")
        from apps.core.models import Company
        company = Company.objects.filter(id=company_id).first() if company_id else None
        start_date = request.query_params.get("start_date")
        end_date = request.query_params.get("end_date")
        data = get_trial_balance_summary(company, start_date, end_date)
        return Response(data)


class JournalLineViewSet(BaseERPModelViewSet):
    queryset = JournalLine.objects.all()
    serializer_class = JournalLineSerializer



class BillingDocumentViewSet(BaseERPModelViewSet):
    queryset = BillingDocument.objects.all()
    serializer_class = BillingDocumentSerializer

    @transaction.atomic
    def perform_destroy(self, instance):
        from apps.procurement.models import ThreeWayMatch

        if instance.status not in {"", "DRAFT", "REJECTED"}:
            raise ValidationError({
                "status": "Hanya billing DRAFT atau REJECTED yang dapat dihapus."
            })
        if (
            ARAPSchedule.objects.filter(billing_document=instance).exists()
            or PaymentAllocation.objects.filter(billing_document=instance).exists()
            or TaxTransaction.objects.filter(billing_document=instance).exists()
        ):
            raise ValidationError({
                "billing": "Billing sudah memiliki transaksi turunan dan tidak dapat dihapus."
            })
        ThreeWayMatch.objects.filter(supplier_invoice=instance).delete()
        BillingDocumentLine.objects.filter(billing_document=instance).delete()
        super().perform_destroy(instance)


class BillingDocumentLineViewSet(BaseERPModelViewSet):
    queryset = BillingDocumentLine.objects.all()
    serializer_class = BillingDocumentLineSerializer


class ARAPScheduleViewSet(BaseERPModelViewSet):
    queryset = ARAPSchedule.objects.all()
    serializer_class = ARAPScheduleSerializer


class PaymentViewSet(BaseERPModelViewSet):
    queryset = Payment.objects.all()
    serializer_class = PaymentSerializer


class PaymentAllocationViewSet(ReadOnlyERPModelViewSet):
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

    def perform_create(self, serializer):
        if not is_finance(self.request.user):
            raise PermissionDenied("Hanya Finance yang dapat membuat transaksi pajak.")
        company = serializer.validated_data.get("company")
        billing = serializer.validated_data.get("billing_document")
        if not company and billing:
            company = billing.company
        if not company:
            from apps.core.models import Company
            company = Company.objects.filter(pk=self.request.headers.get("X-Company-ID")).first()
        serializer.save(status="DRAFT", company=company)

    @action(detail=True, methods=["post"])
    def validate(self, request, pk=None):
        if not is_finance(request.user):
            raise PermissionDenied("Hanya Finance yang dapat memvalidasi pajak.")
        item = self.get_object()
        if item.status not in {"DRAFT", "CORRECTION_REQUIRED"}:
            raise ValidationError({"status": "Pajak harus DRAFT/CORRECTION_REQUIRED."})
        item.status, item.validation_note, item.validated_by, item.validated_at = "VALIDATED", request.data.get("note", ""), request.user, timezone.now()
        item.save(update_fields=["status", "validation_note", "validated_by", "validated_at"])
        return Response(self.get_serializer(item).data)

    @action(detail=True, methods=["post"], url_path="create-billing-code")
    def create_billing_code(self, request, pk=None):
        if not is_finance(request.user): raise PermissionDenied("Hanya Finance yang dapat membuat billing code.")
        item = self.get_object()
        if item.status != "VALIDATED": raise ValidationError({"status": "Pajak harus VALIDATED."})
        item.billing_code = request.data.get("billing_code") or f"TAX-{str(item.id)[:12].upper()}"
        item.status = "BILLING_CODE_CREATED"
        item.save(update_fields=["billing_code", "status"])
        return Response(self.get_serializer(item).data)

    @action(detail=True, methods=["post"])
    def pay(self, request, pk=None):
        if not is_finance(request.user): raise PermissionDenied("Hanya Finance yang dapat mencatat pembayaran pajak.")
        item = self.get_object()
        if item.status != "BILLING_CODE_CREATED": raise ValidationError({"status": "Billing code belum dibuat."})
        if not request.data.get("payment_reference"): raise ValidationError({"payment_reference": "Referensi pembayaran wajib."})
        item.payment_reference, item.ntpn, item.paid_at, item.status = request.data["payment_reference"], request.data.get("ntpn", ""), timezone.now(), "PAID"
        item.save(update_fields=["payment_reference", "ntpn", "paid_at", "status"])
        return Response(self.get_serializer(item).data)

    @action(detail=True, methods=["post"])
    def report(self, request, pk=None):
        if not is_finance(request.user): raise PermissionDenied("Hanya Finance yang dapat melaporkan pajak.")
        item = self.get_object()
        if item.status != "PAID" or not item.ntpn: raise ValidationError({"status": "Pajak harus PAID dan memiliki NTPN."})
        item.status, item.reported_at = "REPORTED", timezone.now()
        item.save(update_fields=["status", "reported_at"])
        return Response(self.get_serializer(item).data)


class InvoiceVarianceCaseViewSet(BaseERPModelViewSet):
    queryset = InvoiceVarianceCase.objects.all()
    serializer_class = InvoiceVarianceCaseSerializer

    @action(detail=True, methods=["post"])
    def resolve(self, request, pk=None):
        if not is_finance(request.user): raise PermissionDenied("Hanya Finance yang dapat menyelesaikan variance.")
        item = self.get_object()
        if item.status != "OPEN": raise ValidationError({"status": "Variance case sudah ditutup."})
        resolution = str(request.data.get("resolution", "")).strip()
        if not resolution: raise ValidationError({"resolution": "Catatan penyelesaian wajib diisi."})
        item.status, item.resolution, item.resolved_by, item.resolved_at = "RESOLVED", resolution, request.user, timezone.now()
        item.save(update_fields=["status", "resolution", "resolved_by", "resolved_at", "updated_at"])
        item.three_way_match.match_status = "MATCHED_WITH_OVERRIDE"
        item.three_way_match.reviewed_by = request.user
        item.three_way_match.reviewed_at = timezone.now()
        item.three_way_match.save(update_fields=["match_status", "reviewed_by", "reviewed_at"])
        return Response(self.get_serializer(item).data)


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

    def get_queryset(self):
        queryset = super().get_queryset()
        user = self.request.user
        if is_executive(user) or is_finance(user) or is_project_management(user):
            return queryset
        return queryset

    def perform_create(self, serializer):
        user = self.request.user
        req_data = self.request.data
        if not is_project_management(user) and not is_executive(user) and not is_finance(user):
            raise PermissionDenied("Hanya Project Management yang dapat mengajukan funding.")

        # Map fallback field names from PM workspace
        if not serializer.validated_data.get("requested_amount"):
            amount = req_data.get("amount") or req_data.get("requested_amount")
            if amount:
                serializer.validated_data["requested_amount"] = Decimal(str(amount))
                serializer.validated_data["approved_limit"] = Decimal(str(amount))

        if not serializer.validated_data.get("purpose"):
            purpose = req_data.get("description") or req_data.get("purpose") or req_data.get("title") or "Pengajuan Dana Operasional Proyek"
            serializer.validated_data["purpose"] = purpose

        if not serializer.validated_data.get("funding_type"):
            funding_type = req_data.get("funding_type") or req_data.get("category") or "OPERATIONAL"
            serializer.validated_data["funding_type"] = funding_type

        serializer.validated_data.setdefault("status", "DRAFT")
        serializer.validated_data["requested_by"] = user
        super().perform_create(serializer)

    def perform_update(self, serializer):
        if serializer.instance.requested_by_id != self.request.user.id and not is_executive(self.request.user):
            raise PermissionDenied("Anda hanya dapat mengubah pengajuan funding milik sendiri.")
        if serializer.instance.status not in ["", "DRAFT", "REJECTED"]:
            raise ValidationError({"status": "Pengajuan yang sedang direview tidak dapat diubah."})
        super().perform_update(serializer)

    def _transition(self, request, instance, expected, target, **fields):
        if instance.status not in expected:
            raise ValidationError({"status": f"Status {instance.status} tidak dapat diubah menjadi {target}."})
        before = snapshot(instance)
        instance.status = target
        instance.review_note = request.data.get("note", instance.review_note)
        for name, value in fields.items():
            setattr(instance, name, value)
        instance.save()
        create_audit_event(request=request, instance=instance, event_type=target, before=before, after=snapshot(instance))
        return Response(self.get_serializer(instance).data)

    @action(detail=True, methods=["post"])
    def submit(self, request, pk=None):
        instance = self.get_object()
        if instance.requested_by_id and instance.requested_by_id != request.user.id and not (is_executive(request.user) or is_project_management(request.user)):
            raise PermissionDenied("Hanya pembuat pengajuan atau PM yang dapat melakukan submit.")
        if not instance.purpose or not instance.requested_amount:
            raise ValidationError({"funding": "Purpose dan requested_amount wajib diisi."})
        return self._transition(request, instance, ["", "DRAFT", "REJECTED"], "SUBMITTED", submitted_at=timezone.now())

    @action(detail=True, methods=["post"])
    def verify(self, request, pk=None):
        if not is_finance(request.user):
            raise PermissionDenied("Hanya Finance yang dapat memverifikasi funding.")
        return self._transition(request, self.get_object(), ["SUBMITTED"], "VERIFIED", verified_by=request.user, verified_at=timezone.now())

    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        if not is_finance(request.user):
            raise PermissionDenied("Hanya Finance yang dapat menyetujui funding.")
        instance = self.get_object()
        approved = request.data.get("approved_limit") or instance.requested_amount or 0
        note = request.data.get("note") or request.data.get("notes") or "Disetujui oleh Finance."
        return self._transition(request, instance, ["", "DRAFT", "SUBMITTED", "VERIFIED", "PENDING", "APPROVED"], "APPROVED", approved_limit=Decimal(str(approved)), approved_by=request.user, approved_at=timezone.now(), review_note=note)

    @action(detail=True, methods=["post"])
    def reject(self, request, pk=None):
        if not is_finance(request.user):
            raise PermissionDenied("Hanya Finance yang dapat menolak funding.")
        note = request.data.get("note") or request.data.get("notes") or "Ditolak oleh Finance."
        return self._transition(request, self.get_object(), ["", "DRAFT", "SUBMITTED", "VERIFIED", "PENDING", "APPROVED"], "REJECTED", rejected_by=request.user, rejected_at=timezone.now(), review_note=note)

    @action(detail=True, methods=["post"])
    def decide(self, request, pk=None):
        """Unified endpoint for Finance decisions: APPROVED, REJECTED, DISBURSED."""
        if not is_finance(request.user):
            raise PermissionDenied("Hanya Finance yang dapat memproses keputusan funding.")
        instance = self.get_object()
        decision = (request.data.get("decision") or "APPROVED").upper()
        notes = request.data.get("notes") or request.data.get("note") or ""

        if decision == "APPROVED":
            approved = request.data.get("approved_limit") or instance.requested_amount or 0
            return self._transition(request, instance, ["", "DRAFT", "SUBMITTED", "VERIFIED", "PENDING", "APPROVED"], "APPROVED", approved_limit=Decimal(str(approved)), approved_by=request.user, approved_at=timezone.now(), review_note=notes)
        elif decision == "REJECTED":
            return self._transition(request, instance, ["", "DRAFT", "SUBMITTED", "VERIFIED", "PENDING", "APPROVED"], "REJECTED", rejected_by=request.user, rejected_at=timezone.now(), review_note=notes)
        elif decision in ["DISBURSED", "PAID"]:
            return self._transition(request, instance, ["", "DRAFT", "SUBMITTED", "VERIFIED", "PENDING", "APPROVED", "ACTIVE"], "DISBURSED", review_note=notes)
        else:
            instance.status = decision
            instance.review_note = notes
            instance.save(update_fields=["status", "review_note"])
            return Response(self.get_serializer(instance).data)

    @action(detail=True, methods=["post"], url_path="create-project")
    @transaction.atomic
    def create_project(self, request, pk=None):
        from apps.projects.models import Member, Project

        funding = self.get_object()
        if not is_project_management(request.user):
            raise PermissionDenied("Hanya Project Management yang dapat membuat project.")
        if funding.requested_by_id != request.user.id and not is_executive(request.user):
            raise PermissionDenied("Funding ini bukan pengajuan Anda.")
        if funding.status != "APPROVED":
            raise ValidationError({"status": "Project hanya dapat dibuat dari funding APPROVED."})
        if funding.project_id:
            return Response({"project_id": funding.project_id, "created": False})
        manager_id = request.data.get("project_manager") or request.user.id
        project = Project.objects.create(
            tenant=funding.tenant,
            company=funding.company,
            project_code=request.data.get("project_code", f"PRJ-{str(funding.id)[:8].upper()}"),
            project_name=request.data.get("project_name", funding.purpose[:255]),
            description=funding.purpose,
            project_manager_id=manager_id,
            budget_amount=funding.approved_limit,
            status="PLANNED",
            lifecycle_status="DRAFT",
            source_type="FUNDING_REQUEST",
        )
        Member.objects.get_or_create(project=project, user_id=manager_id, defaults={"project_role": "PROJECT_MANAGER", "status": "ACTIVE", "assigned_at": timezone.now()})
        funding.project = project
        funding.status = "ACTIVE"
        funding.save(update_fields=["project", "status"])
        create_audit_event(request=request, instance=project, event_type="CREATE_FROM_FUNDING", after=snapshot(project))
        return Response({"project_id": project.id, "created": True}, status=status.HTTP_201_CREATED)


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


class ProjectCostEntryViewSet(BaseERPModelViewSet):
    queryset = ProjectCostEntry.objects.all()
    serializer_class = ProjectCostEntrySerializer

    def perform_create(self, serializer):
        if not (is_project_management(self.request.user) or is_finance(self.request.user)):
            raise PermissionDenied("Hanya Project Management atau Finance yang dapat merekam biaya project.")
        serializer.validated_data["status"] = "CAPTURED"
        serializer.validated_data["created_by"] = self.request.user
        super().perform_create(serializer)

    @action(detail=False, methods=["post"], url_path="collect-operational")
    def collect_operational(self, request):
        if not (is_project_management(request.user) or is_finance(request.user)):
            raise PermissionDenied("Hanya Project Management atau Finance yang dapat mengumpulkan biaya.")
        project_id = request.data.get("project")
        if not project_id: raise ValidationError({"project": "Project wajib diisi."})
        from apps.projects.models import Project
        from apps.finance.workflow_services import collect_project_operational_costs
        project = Project.objects.get(pk=project_id)
        rows = collect_project_operational_costs(project, request.user)
        return Response({"created": len(rows), "ids": [str(row.id) for row in rows]})

    @action(detail=True, methods=["post"])
    def validate(self, request, pk=None):
        if not is_finance(request.user):
            raise PermissionDenied("Hanya Finance yang dapat memvalidasi biaya.")
        item = self.get_object()
        if item.status != "CAPTURED":
            raise ValidationError({"status": "Hanya biaya CAPTURED yang dapat divalidasi."})
        item.status = "VALIDATED"
        item.validation_note = request.data.get("note", "")
        item.validated_by = request.user
        item.validated_at = timezone.now()
        item.save(update_fields=["status", "validation_note", "validated_by", "validated_at", "updated_at"])
        return Response(self.get_serializer(item).data)

    @action(detail=True, methods=["post"])
    def post(self, request, pk=None):
        if not is_finance(request.user):
            raise PermissionDenied("Hanya Finance yang dapat posting biaya ke WIP.")
        item = self.get_object()
        if item.status != "VALIDATED":
            raise ValidationError({"status": "Biaya harus VALIDATED sebelum posting."})
        from apps.finance.workflow_services import ensure_account, ensure_journal
        journal = ensure_journal(item.company, "PROJECT_WIP", "Project WIP")
        wip_account = ensure_account(item.company, "1140-WIP", "Work In Progress", "ASSET", "DEBIT")
        offset_account = ensure_account(item.company, "5990-COST-CLEARING", "Project Cost Clearing", "EXPENSE", "CREDIT")
        entry = JournalEntry.objects.create(
            journal=journal, entry_number=f"WIP-{str(item.id)[:8].upper()}", posting_date=item.transaction_date,
            description=f"WIP {item.project.project_code}: {item.description}", status="POSTED",
        )
        JournalLine.objects.create(journal_entry=entry, account=wip_account, project=item.project, debit_base=item.total_cost, credit_base=0, transaction_amount=item.total_cost)
        JournalLine.objects.create(journal_entry=entry, account=offset_account, project=item.project, debit_base=0, credit_base=item.total_cost, transaction_amount=-item.total_cost)
        item.status = "POSTED"
        item.journal_entry = entry
        item.posted_by = request.user
        item.posted_at = timezone.now()
        item.save(update_fields=["status", "journal_entry", "posted_by", "posted_at", "updated_at"])
        return Response(self.get_serializer(item).data)

    @action(detail=False, methods=["post"], url_path="calculate-wip")
    def calculate_wip(self, request):
        if not is_finance(request.user):
            raise PermissionDenied("Hanya Finance yang dapat menghitung WIP.")
        project_id = request.data.get("project")
        if not project_id:
            raise ValidationError({"project": "Project wajib diisi."})
        from apps.projects.models import Project
        project = Project.objects.get(pk=project_id)
        posted = self.get_queryset().filter(project=project, status="POSTED").aggregate(total=Sum("total_cost"))["total"] or Decimal("0")
        snapshot = ProjectWIPSnapshot.objects.create(
            project=project, snapshot_date=timezone.localdate(), completion_percent=project.progress_percent or 0,
            recognized_cost=posted, wip_asset_amount=posted, accrued_billing_amount=0,
            unbilled_amount=posted, status="CALCULATED",
        )
        return Response(ProjectWIPSnapshotSerializer(snapshot, context={"request": request}).data, status=status.HTTP_201_CREATED)


class BillingProposalViewSet(BaseERPModelViewSet):
    queryset = BillingProposal.objects.all()
    serializer_class = BillingProposalSerializer

    def perform_create(self, serializer):
        if not is_project_management(self.request.user):
            raise PermissionDenied("Hanya Project Management yang dapat membuat billing proposal.")
        serializer.validated_data["status"] = "DRAFT"
        serializer.validated_data["requested_by"] = self.request.user
        super().perform_create(serializer)

    @action(detail=True, methods=["post"])
    def submit(self, request, pk=None):
        item = self.get_object()
        if item.requested_by_id != request.user.id and not is_executive(request.user):
            raise PermissionDenied("Hanya pembuat proposal yang dapat submit.")
        if item.status not in {"DRAFT", "REJECTED"}:
            raise ValidationError({"status": "Proposal tidak dapat disubmit dari status ini."})
        item.status = "SUBMITTED"
        item.submitted_at = timezone.now()
        item.save(update_fields=["status", "submitted_at", "updated_at"])
        return Response(self.get_serializer(item).data)

    @action(detail=True, methods=["post"])
    @transaction.atomic
    def approve(self, request, pk=None):
        if not is_finance(request.user):
            raise PermissionDenied("Hanya Finance yang dapat menyetujui billing proposal.")
        item = self.get_object()
        if item.status != "SUBMITTED":
            raise ValidationError({"status": "Hanya proposal SUBMITTED yang dapat disetujui."})
        invoice = BillingDocument.objects.create(
            company=item.company, party=item.customer, project=item.project, billing_type="CUSTOMER_INVOICE",
            invoice_number=f"INV-{str(item.id)[:8].upper()}", invoice_date=timezone.localdate(),
            subtotal=item.subtotal, tax_amount=item.tax_amount, total_amount=item.total_amount,
            paid_amount=0, outstanding_amount=item.total_amount, payment_status="UNPAID", status="POSTED",
            posting_date=timezone.localdate(), verified_by=request.user, verified_at=timezone.now(),
            approved_by=request.user, approved_at=timezone.now(),
        )
        ARAPSchedule.objects.create(billing_document=invoice, installment_number=1, due_date=timezone.localdate(), original_amount=item.total_amount, paid_amount=0, outstanding_amount=item.total_amount, status="OPEN")
        # Post double-entry journal entry automatically
        try:
            post_invoice_journal(invoice, request.user)
        except Exception as e:
            print("Auto-journal post warning:", e)

        item.status = "INVOICED"
        item.approved_by = request.user
        item.approved_at = timezone.now()
        item.billing_document = invoice
        item.save(update_fields=["status", "approved_by", "approved_at", "billing_document", "updated_at"])
        return Response(self.get_serializer(item).data)

    @action(detail=True, methods=["post"])
    def reject(self, request, pk=None):
        if not is_finance(request.user):
            raise PermissionDenied("Hanya Finance yang dapat menolak billing proposal.")
        item = self.get_object()
        reason = request.data.get("reason", "")
        if item.status != "SUBMITTED" or not reason:
            raise ValidationError({"reason": "Proposal SUBMITTED memerlukan alasan penolakan."})
        item.status = "REJECTED"
        item.rejection_reason = reason
        item.save(update_fields=["status", "rejection_reason", "updated_at"])
        return Response(self.get_serializer(item).data)


class CustomerCreditLimitViewSet(BaseERPModelViewSet):
    queryset = CustomerCreditLimit.objects.all()
    serializer_class = CustomerCreditLimitSerializer


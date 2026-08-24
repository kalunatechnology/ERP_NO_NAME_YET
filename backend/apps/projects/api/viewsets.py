from datetime import timedelta
from decimal import Decimal

from django.db import transaction
from django.utils import timezone

from rest_framework import filters
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response


from apps.projects.models import (
    Project,
    ProjectControlItem,
    ProjectExpense,
    ProjectLifecycleEvent,
    ProjectReadinessCheck,
    Member,
    Task,
    TaskDependency,
    Milestone,
    MaterialRequirement,
    BudgetLine,
    Timesheet,
    ChangeRequest,
    ChangeRequestMaterial,
    Board,
    BoardColumn,
    TaskBoardPosition,
    HealthRule,
    HealthSnapshot,
    Risk,
    Issue,
    IssueAction,
    ProjectDispatch,
    TechnicalBrief,
    TechnicalBriefVersion,
    Requirement,
    AcceptanceCriteria,
    ResourceRequest,
    ResourceRequestLine,
    ResourceAllocation,
    ProgressSnapshot,
    EquipmentUsage,
    WeightIndicator,
    WeightComponent,
    ProjectWeeklyProgress,
    ProjectMainTask,
    TaskAssignment,
    ProjectWeeklyTask,
    ProjectDailyTask,
    TaskTransferRequest,
    TaskActivityLog,
)
from apps.api_common.viewsets import BaseERPModelViewSet, ReadOnlyERPModelViewSet
from django.db.models import Q
from rest_framework.exceptions import PermissionDenied
from apps.projects.access import (
    can_access_project,
    can_manage_project,
    has_project_access,
    is_executive,
    is_project_management,
    is_finance,
    IsProjectPMPermission,
    IsDailyTaskOwnerOrPM,
)
from .serializers import (
    ProjectSerializer,
    ProjectControlItemSerializer,
    ProjectExpenseSerializer,
    ProjectLifecycleEventSerializer,
    ProjectReadinessCheckSerializer,
    MemberSerializer,
    TaskSerializer,
    TaskDependencySerializer,
    MilestoneSerializer,
    MaterialRequirementSerializer,
    BudgetLineSerializer,
    TimesheetSerializer,
    ChangeRequestSerializer,
    ChangeRequestMaterialSerializer,
    BoardSerializer,
    BoardColumnSerializer,
    TaskBoardPositionSerializer,
    HealthRuleSerializer,
    HealthSnapshotSerializer,
    RiskSerializer,
    IssueSerializer,
    IssueActionSerializer,
    ProjectDispatchSerializer,
    TechnicalBriefSerializer,
    TechnicalBriefVersionSerializer,
    RequirementSerializer,
    AcceptanceCriteriaSerializer,
    ResourceRequestSerializer,
    ResourceRequestLineSerializer,
    ResourceAllocationSerializer,
    ProgressSnapshotSerializer,
    EquipmentUsageSerializer,
    WeightIndicatorSerializer,
    WeightComponentSerializer,
    ProjectWeeklyProgressSerializer,
    ProjectMainTaskSerializer,
    TaskAssignmentSerializer,
    ProjectWeeklyTaskSerializer,
    ProjectDailyTaskSerializer,
    TaskTransferRequestSerializer,
    TaskActivityLogSerializer,
)
from apps.projects.task_hierarchy_services import (
    recalculate_task_tree,
    process_transfer_approval,
    direct_reassign_task,
    override_task_progress,
    log_task_activity,
)


class ProjectViewSet(BaseERPModelViewSet):
    queryset = Project.objects.all()
    serializer_class = ProjectSerializer

    def get_queryset(self):
        queryset = super().get_queryset()
        if is_executive(self.request.user) or is_finance(self.request.user) or is_project_management(self.request.user):
            return queryset
        return queryset.filter(
            Q(project_manager=self.request.user)
            | Q(project_manager__isnull=True)
            | Q(projects_member_project_set__user=self.request.user, projects_member_project_set__status__in=["", "ACTIVE"])
        ).distinct()

    def perform_create(self, serializer):
        if not is_project_management(self.request.user):
            raise PermissionDenied("Hanya Project Management yang dapat membuat project.")
        super().perform_create(serializer)

    @action(detail=True, methods=["get"])
    def hierarchy(self, request, pk=None):
        project = self.get_object()
        main_tasks = project.main_tasks.prefetch_related(
            "assignments__assignee",
            "weekly_tasks__daily_tasks__owner",
            "weekly_tasks__assignee",
        ).all()
        serializer = ProjectMainTaskSerializer(main_tasks, many=True)

        members_data = []
        user_ids_seen = set()

        if project.project_manager:
            members_data.append({
                "id": str(project.project_manager.id),
                "user_id": str(project.project_manager.id),
                "username": project.project_manager.username,
                "full_name": project.project_manager.full_name or project.project_manager.username,
                "role_in_project": "PROJECT_MANAGER",
            })
            user_ids_seen.add(project.project_manager.id)

        for m in project.projects_member_project_set.select_related("user").filter(status__in=["", "ACTIVE"]):
            if m.user and m.user.id not in user_ids_seen:
                members_data.append({
                    "id": str(m.user.id),
                    "user_id": str(m.user.id),
                    "username": m.user.username,
                    "full_name": m.user.full_name or m.user.username,
                    "role_in_project": m.project_role or "MEMBER",
                })
                user_ids_seen.add(m.user.id)

        # Also provide all active tenant/company users for PM assignment flexibility
        from apps.accounts.models import User
        users_qs = User.objects.filter(is_active=True)
        if hasattr(project, "tenant_id") and project.tenant_id:
            users_qs = users_qs.filter(tenant_id=project.tenant_id)
        elif hasattr(project, "company_id") and project.company_id:
            users_qs = users_qs.filter(company_id=project.company_id)

        all_users = []
        for u in users_qs[:100]:
            u_info = {
                "id": str(u.id),
                "user_id": str(u.id),
                "username": u.username,
                "full_name": u.full_name or u.username,
                "email": u.email,
            }
            all_users.append(u_info)
            if u.id not in user_ids_seen:
                members_data.append({
                    "id": str(u.id),
                    "user_id": str(u.id),
                    "username": u.username,
                    "full_name": u.full_name or u.username,
                    "role_in_project": "TEAM_MEMBER",
                })
                user_ids_seen.add(u.id)

        return Response({
            "project_id": str(project.id),
            "id": str(project.id),
            "project_code": project.project_code,
            "code": project.project_code,
            "project_name": project.project_name,
            "name": project.project_name,
            "description": project.description,
            "progress_percent": project.progress_percent,
            "progress": project.progress_percent,
            "status": project.status or project.lifecycle_status,
            "planned_start_date": str(project.planned_start_date or ""),
            "planned_end_date": str(project.planned_end_date or ""),
            "project_manager": str(project.project_manager_id) if project.project_manager_id else None,
            "pm": str(project.project_manager_id) if project.project_manager_id else None,
            "project_manager_name": project.project_manager.full_name if project.project_manager else "Project Manager",
            "pm_name": project.project_manager.full_name if project.project_manager else "Project Manager",
            "members": members_data,
            "members_detail": members_data,
            "available_users": all_users,
            "main_tasks": serializer.data,
        })

    @action(detail=True, methods=["get"])
    def evm(self, request, pk=None):
        """Calculates Earned Value Management (EVM), Schedule Variance, and Cost Performance Index."""
        project = self.get_object()
        from apps.projects.evm_services import calculate_project_evm, record_weekly_evm_snapshot
        evm_data = calculate_project_evm(project)
        # Snapshot record
        try:
            record_weekly_evm_snapshot(project)
        except Exception as e:
            print("EVM snapshot warning:", e)
        return Response(evm_data)

    @action(detail=True, methods=["get"])
    def financial_performance(self, request, pk=None):
        """Calculates real-time P&L (Laba Rugi), Revenue, Costs, and Budget Variance."""
        project = self.get_object()
        from apps.projects.financial_services import calculate_project_financials
        data = calculate_project_financials(project)
        return Response(data)

    @action(detail=True, methods=["post", "patch"])
    def update_financials(self, request, pk=None):
        """Allows PM / Finance to update budget_amount, contract_amount (Target Revenue), target_margin."""
        project = self.get_object()
        if not can_manage_project(request.user, project) and not is_finance(request.user):
            raise PermissionDenied("Hanya Project Manager atau Divisi Finance yang dapat mengubah parameter keuangan proyek.")

        contract_amount = request.data.get("contract_amount") or request.data.get("contract_value") or request.data.get("revenue_target")
        budget_amount = request.data.get("budget_amount") or request.data.get("budget")
        target_margin = request.data.get("target_margin_percent")

        update_fields = []
        if contract_amount is not None:
            project.contract_amount = Decimal(str(contract_amount))
            update_fields.append("contract_amount")
        if budget_amount is not None:
            project.budget_amount = Decimal(str(budget_amount))
            update_fields.append("budget_amount")
        if target_margin is not None:
            project.target_margin_percent = Decimal(str(target_margin))
            update_fields.append("target_margin_percent")

        if update_fields:
            update_fields.append("updated_at")
            project.save(update_fields=update_fields)

        from apps.projects.financial_services import calculate_project_financials
        data = calculate_project_financials(project)
        return Response(data)

    @action(detail=True, methods=["get", "post"])
    def funding_requests(self, request, pk=None):
        """List or create project funding request / operational budget request."""
        project = self.get_object()
        from apps.projects.models import ProjectExpense

        if request.method == "POST":
            if not can_manage_project(request.user, project) and not has_project_access(request.user, project, required_roles=["PROJECT_MANAGER", "MEMBER"]):
                raise PermissionDenied("Hanya PM atau anggota tim proyek yang dapat mengajukan permintaan anggaran.")

            amount = request.data.get("amount") or request.data.get("requested_amount")
            category = request.data.get("category") or "OPERATIONAL"
            description = request.data.get("description") or request.data.get("reason") or "Permintaan dana proyek"

            if not amount:
                raise ValidationError({"amount": "Jumlah anggaran wajib diisi."})

            expense = ProjectExpense.objects.create(
                project=project,
                company=project.company,
                tenant=project.tenant,
                amount=Decimal(str(amount)),
                expense_type=category,
                description=description,
                expense_date=timezone.localdate(),
                status="SUBMITTED",
                created_by=request.user,
            )
            return Response(ProjectExpenseSerializer(expense).data, status=201)

        expenses = ProjectExpense.objects.filter(project=project).order_by("-expense_date", "-created_at")
        return Response(ProjectExpenseSerializer(expenses, many=True).data)


class ProjectControlItemViewSet(BaseERPModelViewSet):
    queryset = ProjectControlItem.objects.all()
    serializer_class = ProjectControlItemSerializer


class ProjectExpenseViewSet(BaseERPModelViewSet):
    queryset = ProjectExpense.objects.all()
    serializer_class = ProjectExpenseSerializer

    def perform_create(self, serializer):
        super().perform_create(serializer)
        instance = serializer.instance
        try:
            from apps.finance.accounting_services import post_project_expense_journal
            post_project_expense_journal(instance, self.request.user)
        except Exception as e:
            print("Auto-journal expense warning:", e)


class ProjectLifecycleEventViewSet(ReadOnlyERPModelViewSet):
    queryset = ProjectLifecycleEvent.objects.all()
    serializer_class = ProjectLifecycleEventSerializer


class ProjectReadinessCheckViewSet(ReadOnlyERPModelViewSet):
    queryset = ProjectReadinessCheck.objects.all()
    serializer_class = ProjectReadinessCheckSerializer


class MemberViewSet(BaseERPModelViewSet):
    queryset = Member.objects.all()
    serializer_class = MemberSerializer

    def get_queryset(self):
        queryset = super().get_queryset()
        if is_executive(self.request.user):
            return queryset
        return queryset.filter(Q(project__project_manager=self.request.user) | Q(user=self.request.user)).distinct()

    def perform_create(self, serializer):
        project = serializer.validated_data.get("project")
        if not project or not can_manage_project(self.request.user, project):
            raise PermissionDenied("Hanya manager project yang dapat menambahkan anggota.")
        super().perform_create(serializer)

    def perform_update(self, serializer):
        if not can_manage_project(self.request.user, serializer.instance.project):
            raise PermissionDenied("Hanya manager project yang dapat mengubah anggota.")
        super().perform_update(serializer)

    def perform_destroy(self, instance):
        if not can_manage_project(self.request.user, instance.project):
            raise PermissionDenied("Hanya manager project yang dapat menghapus anggota.")
        super().perform_destroy(instance)


class TaskViewSet(BaseERPModelViewSet):
    queryset = Task.objects.all()
    serializer_class = TaskSerializer

    def get_queryset(self):
        queryset = super().get_queryset()
        if is_executive(self.request.user):
            return queryset
        return queryset.filter(
            Q(project__project_manager=self.request.user)
            | Q(project__projects_member_project_set__user=self.request.user, project__projects_member_project_set__status__in=["", "ACTIVE"])
        ).distinct()

    def perform_create(self, serializer):
        project = serializer.validated_data.get("project")
        if not project or not can_manage_project(self.request.user, project):
            raise PermissionDenied("Hanya manager project yang dapat membuat dan assign task.")
        super().perform_create(serializer)

    def perform_update(self, serializer):
        task = serializer.instance
        user = self.request.user
        if not can_access_project(user, task.project):
            raise PermissionDenied("Task berada di luar project Anda.")
        if not can_manage_project(user, task.project):
            if task.assigned_to_id != user.id:
                raise PermissionDenied("Anda hanya dapat memperbarui task yang ditugaskan kepada Anda.")
            allowed = {"status", "progress_percent", "actual_start_at", "actual_end_at", "actual_hours", "evidence_json"}
            changed = set(serializer.validated_data)
            if changed - allowed:
                raise PermissionDenied("Assignee hanya dapat memperbarui progress, status, waktu aktual, dan evidence.")
        super().perform_update(serializer)

    def perform_destroy(self, instance):
        if not can_manage_project(self.request.user, instance.project):
            raise PermissionDenied("Hanya manager project yang dapat menghapus task.")
        super().perform_destroy(instance)


class TaskDependencyViewSet(BaseERPModelViewSet):
    queryset = TaskDependency.objects.all()
    serializer_class = TaskDependencySerializer


class MilestoneViewSet(BaseERPModelViewSet):
    queryset = Milestone.objects.all()
    serializer_class = MilestoneSerializer


class MaterialRequirementViewSet(BaseERPModelViewSet):
    queryset = MaterialRequirement.objects.all()
    serializer_class = MaterialRequirementSerializer


class BudgetLineViewSet(BaseERPModelViewSet):
    queryset = BudgetLine.objects.all()
    serializer_class = BudgetLineSerializer


class TimesheetViewSet(BaseERPModelViewSet):
    queryset = Timesheet.objects.all()
    serializer_class = TimesheetSerializer


class ChangeRequestViewSet(BaseERPModelViewSet):
    queryset = ChangeRequest.objects.all()
    serializer_class = ChangeRequestSerializer

    def perform_create(self, serializer):
        project = serializer.validated_data.get("project")
        if not project or not can_manage_project(self.request.user, project):
            raise PermissionDenied("Hanya manager project yang dapat mencatat change request.")
        serializer.validated_data.update({"requested_by": self.request.user, "status": "DRAFT", "approval_status": "DRAFT", "original_end_date": project.planned_end_date})
        super().perform_create(serializer)

    @action(detail=True, methods=["post"])
    def analyze(self, request, pk=None):
        item = self.get_object()
        if not can_manage_project(request.user, item.project):
            raise PermissionDenied("Hanya manager project yang dapat menganalisis perubahan.")
        if item.status not in {"DRAFT", "CLIENT_REJECTED"}:
            raise ValidationError({"status": "Change request tidak dapat dianalisis dari status ini."})
        item.schedule_impact_days = request.data.get("schedule_impact_days", item.schedule_impact_days or 0)
        item.cost_impact = request.data.get("cost_impact", item.cost_impact or 0)
        item.billing_adjustment = request.data.get("billing_adjustment", item.cost_impact or 0)
        base = item.project.planned_end_date
        item.revised_end_date = base + timedelta(days=int(item.schedule_impact_days or 0)) if base else None
        item.analyzed_by = request.user
        item.analyzed_at = timezone.now()
        item.status = "ANALYZED"
        item.save()
        return Response(self.get_serializer(item).data)

    @action(detail=True, methods=["post"], url_path="submit-client")
    def submit_client(self, request, pk=None):
        item = self.get_object()
        if item.status != "ANALYZED":
            raise ValidationError({"status": "Change request harus ANALYZED sebelum dikirim ke client."})
        item.status = "WAITING_CLIENT"
        item.approval_status = "PENDING_CLIENT"
        item.submitted_at = timezone.now()
        item.save(update_fields=["status", "approval_status", "submitted_at"])
        return Response(self.get_serializer(item).data)

    @action(detail=True, methods=["post"], url_path="client-decision")
    @transaction.atomic
    def client_decision(self, request, pk=None):
        from apps.finance.models import BillingProposal
        item = self.get_object()
        if not can_manage_project(request.user, item.project) and not is_executive(request.user):
            raise PermissionDenied("Keputusan client hanya dapat dicatat oleh manager project.")
        if item.status != "WAITING_CLIENT":
            raise ValidationError({"status": "Change request tidak sedang menunggu keputusan client."})
        raw_approved = request.data.get("approved")
        approved = raw_approved is True or str(raw_approved).lower() in {"true", "1", "yes"}
        item.client_decision_note = request.data.get("note", "")
        item.client_decided_at = timezone.now()
        if not approved:
            item.status = "CLIENT_REJECTED"
            item.approval_status = "REJECTED"
            item.save()
            return Response(self.get_serializer(item).data)
        project = item.project
        for line in item.material_changes.select_related("product", "warehouse"):
            requirement, _ = MaterialRequirement.objects.get_or_create(project=project, product=line.product, warehouse=line.warehouse, defaults={"required_quantity": 0, "reserved_quantity": 0, "issued_quantity": 0, "status": "PLANNED"})
            requirement.required_quantity = (requirement.required_quantity or 0) + line.quantity_delta
            requirement.status = "CHANGE_APPROVED"
            requirement.save(update_fields=["required_quantity", "status"])
            line.applied_requirement = requirement
            line.save(update_fields=["applied_requirement"])
        if item.revised_end_date:
            project.planned_end_date = item.revised_end_date
        project.budget_amount = (project.budget_amount or 0) + (item.cost_impact or 0)
        project.save(update_fields=["planned_end_date", "budget_amount"])
        from apps.projects.workflow_services import apply_change_replanning
        procurement_requisition = apply_change_replanning(item, request.user)
        if item.billing_adjustment and item.billing_adjustment > 0:
            BillingProposal.objects.create(tenant=project.tenant, company=project.company, project=project, customer=project.customer_party, trigger_type="CHANGE_REQUEST_APPROVED", description=f"Approved change: {item.description}", subtotal=item.billing_adjustment, tax_rate=0, tax_amount=0, total_amount=item.billing_adjustment, status="DRAFT", requested_by=request.user)
        item.status = "APPLIED"
        item.approval_status = "APPROVED"
        item.applied_at = timezone.now()
        item.applied_by = request.user
        item.save()
        data = self.get_serializer(item).data
        data["procurement_requisition_id"] = str(procurement_requisition.id) if procurement_requisition else None
        return Response(data)


class ChangeRequestMaterialViewSet(BaseERPModelViewSet):
    queryset = ChangeRequestMaterial.objects.all()
    serializer_class = ChangeRequestMaterialSerializer

    def perform_create(self, serializer):
        change = serializer.validated_data.get("change_request")
        if not change or not can_manage_project(self.request.user, change.project) or change.status not in {"DRAFT", "CLIENT_REJECTED"}:
            raise PermissionDenied("Material change hanya dapat ditambah pada draft oleh manager project.")
        super().perform_create(serializer)


class BoardViewSet(BaseERPModelViewSet):
    queryset = Board.objects.all()
    serializer_class = BoardSerializer


class BoardColumnViewSet(BaseERPModelViewSet):
    queryset = BoardColumn.objects.all()
    serializer_class = BoardColumnSerializer


class TaskBoardPositionViewSet(BaseERPModelViewSet):
    queryset = TaskBoardPosition.objects.all()
    serializer_class = TaskBoardPositionSerializer


class HealthRuleViewSet(BaseERPModelViewSet):
    queryset = HealthRule.objects.all()
    serializer_class = HealthRuleSerializer


class HealthSnapshotViewSet(BaseERPModelViewSet):
    queryset = HealthSnapshot.objects.all()
    serializer_class = HealthSnapshotSerializer


class RiskViewSet(BaseERPModelViewSet):
    queryset = Risk.objects.all()
    serializer_class = RiskSerializer


class IssueViewSet(BaseERPModelViewSet):
    queryset = Issue.objects.all()
    serializer_class = IssueSerializer

    def perform_create(self, serializer):
        project = serializer.validated_data.get("project")
        if not project or not can_access_project(self.request.user, project):
            raise PermissionDenied("Issue harus dilaporkan oleh anggota project.")
        serializer.validated_data.update({"reported_by": self.request.user, "reported_at": timezone.now(), "status": "REPORTED", "alert_status": "NONE"})
        super().perform_create(serializer)

    @action(detail=True, methods=["post"])
    def analyze(self, request, pk=None):
        from apps.core.models import Notification
        item = self.get_object()
        if not can_manage_project(request.user, item.project):
            raise PermissionDenied("Hanya manager project yang dapat menganalisis masalah.")
        if item.status != "REPORTED":
            raise ValidationError({"status": "Hanya issue REPORTED yang dapat dianalisis."})
        item.root_cause = request.data.get("root_cause", "")
        item.milestone_impact = request.data.get("milestone_impact", "")
        item.severity = request.data.get("severity", item.severity)
        item.analyzed_by = request.user
        item.analyzed_at = timezone.now()
        item.status = "ANALYZED"
        item.alert_status = "ACTIVE"
        item.save()
        Notification.objects.create(tenant=item.project.tenant, company=item.project.company, source_document=item.document, notification_type="PROJECT_OPERATIONAL_ISSUE", title=f"{item.severity} issue: {item.project.project_code}", message=item.description, action_url=f"/api/v1/projects/issues/{item.id}/", priority="HIGH" if item.severity in {"HIGH", "CRITICAL"} else "MEDIUM", created_at=timezone.now())
        return Response(self.get_serializer(item).data)


class IssueActionViewSet(BaseERPModelViewSet):
    queryset = IssueAction.objects.all()
    serializer_class = IssueActionSerializer

    def perform_create(self, serializer):
        issue = serializer.validated_data.get("issue")
        if not issue or not can_manage_project(self.request.user, issue.project) or issue.status not in {"ANALYZED", "ACTION_IN_PROGRESS"}:
            raise PermissionDenied("Corrective action memerlukan issue yang sudah dianalisis.")
        issue.status = "ACTION_IN_PROGRESS"
        issue.save(update_fields=["status"])
        serializer.validated_data["created_by"] = self.request.user
        super().perform_create(serializer)

    @action(detail=True, methods=["post"])
    def complete(self, request, pk=None):
        item = self.get_object()
        if not can_manage_project(request.user, item.issue.project) and item.assigned_to_id != request.user.id:
            raise PermissionDenied("Corrective action hanya dapat diselesaikan manager atau assignee.")
        if item.status == "COMPLETED":
            return Response(self.get_serializer(item).data)
        from apps.projects.workflow_services import apply_issue_action
        try:
            apply_issue_action(item, request.user)
        except ValueError as error:
            raise ValidationError({"action": str(error)}) from error
        item.status = "COMPLETED"
        item.completed_at = timezone.now()
        item.save(update_fields=["status", "completed_at"])
        if not item.issue.actions.exclude(status="COMPLETED").exists():
            item.issue.status = "RESOLVED"
            item.issue.alert_status = "RESOLVED"
            item.issue.resolved_at = timezone.now()
            item.issue.save(update_fields=["status", "alert_status", "resolved_at"])
        return Response(self.get_serializer(item).data)


class ProjectDispatchViewSet(ReadOnlyERPModelViewSet):
    queryset = ProjectDispatch.objects.all()
    serializer_class = ProjectDispatchSerializer


class TechnicalBriefViewSet(BaseERPModelViewSet):
    queryset = TechnicalBrief.objects.all()
    serializer_class = TechnicalBriefSerializer


class TechnicalBriefVersionViewSet(BaseERPModelViewSet):
    queryset = TechnicalBriefVersion.objects.all()
    serializer_class = TechnicalBriefVersionSerializer


class RequirementViewSet(BaseERPModelViewSet):
    queryset = Requirement.objects.all()
    serializer_class = RequirementSerializer


class AcceptanceCriteriaViewSet(BaseERPModelViewSet):
    queryset = AcceptanceCriteria.objects.all()
    serializer_class = AcceptanceCriteriaSerializer


class ResourceRequestViewSet(BaseERPModelViewSet):
    queryset = ResourceRequest.objects.all()
    serializer_class = ResourceRequestSerializer


class ResourceRequestLineViewSet(BaseERPModelViewSet):
    queryset = ResourceRequestLine.objects.all()
    serializer_class = ResourceRequestLineSerializer


class ResourceAllocationViewSet(BaseERPModelViewSet):
    queryset = ResourceAllocation.objects.all()
    serializer_class = ResourceAllocationSerializer


class ProgressSnapshotViewSet(BaseERPModelViewSet):
    queryset = ProgressSnapshot.objects.all()
    serializer_class = ProgressSnapshotSerializer


class EquipmentUsageViewSet(BaseERPModelViewSet):
    queryset = EquipmentUsage.objects.all()
    serializer_class = EquipmentUsageSerializer


class WeightIndicatorViewSet(BaseERPModelViewSet):
    queryset = WeightIndicator.objects.all()
    serializer_class = WeightIndicatorSerializer


class WeightComponentViewSet(BaseERPModelViewSet):
    queryset = WeightComponent.objects.all()
    serializer_class = WeightComponentSerializer


class ProjectWeeklyProgressViewSet(BaseERPModelViewSet):
    queryset = ProjectWeeklyProgress.objects.all()
    serializer_class = ProjectWeeklyProgressSerializer

    def get_queryset(self):
        queryset = super().get_queryset()
        project_id = self.request.query_params.get("project") or self.request.query_params.get("project_id")
        if project_id:
            queryset = queryset.filter(project_id=project_id)
        if is_executive(self.request.user) or is_finance(self.request.user) or is_project_management(self.request.user):
            return queryset
        return queryset.filter(
            Q(project__project_manager=self.request.user)
            | Q(project__projects_member_project_set__user=self.request.user, project__projects_member_project_set__status__in=["", "ACTIVE"])
        ).distinct()

    def perform_create(self, serializer):
        project = serializer.validated_data.get("project")
        if not project or not can_manage_project(self.request.user, project):
            raise PermissionDenied("Hanya manager project yang dapat mencatat weekly progress review.")
        serializer.validated_data["recorded_by"] = self.request.user
        super().perform_create(serializer)

    def perform_update(self, serializer):
        project = serializer.instance.project
        if not can_manage_project(self.request.user, project):
            raise PermissionDenied("Hanya manager project yang dapat mengubah weekly progress review.")
        serializer.validated_data["recorded_by"] = self.request.user
        super().perform_update(serializer)


class ProjectMainTaskViewSet(BaseERPModelViewSet):
    queryset = ProjectMainTask.objects.all()
    serializer_class = ProjectMainTaskSerializer
    permission_classes = [IsProjectPMPermission]

    def get_queryset(self):
        user = self.request.user
        queryset = ProjectMainTask.objects.select_related("project", "created_by").prefetch_related("assignments__assignee").all()
        project_id = self.request.query_params.get("project") or self.request.query_params.get("project_id")
        if project_id:
            queryset = queryset.filter(project_id=project_id)
        if getattr(user, "is_superuser", False) or getattr(user, "is_staff", False) or is_executive(user) or is_project_management(user):
            return queryset
        return queryset.filter(
            Q(project__project_manager=user)
            | Q(project__project_manager__isnull=True)
            | Q(project__projects_member_project_set__user=user, project__projects_member_project_set__status__in=["", "ACTIVE"])
            | Q(assignments__assignee=user)
            | Q(created_by=user)
        ).distinct()

    def perform_create(self, serializer):
        project = serializer.validated_data.get("project")
        if not can_manage_project(self.request.user, project) and not has_project_access(self.request.user, project, required_roles=["PROJECT_MANAGER"]):
            raise PermissionDenied("Hanya Project Manager yang dapat membuat Main Task.")
        serializer.validated_data["created_by"] = self.request.user
        instance = serializer.save()
        log_task_activity(
            project=project,
            actor=self.request.user,
            task_level="MAIN",
            task_id=instance.id,
            task_title=instance.name,
            action="CREATED",
            reason="Main task created by PM",
        )
        recalculate_task_tree(main_task=instance)

    def perform_update(self, serializer):
        project = serializer.instance.project
        if not can_manage_project(self.request.user, project):
            raise PermissionDenied("Hanya Project Manager yang dapat mengubah Main Task.")
        instance = serializer.save()
        recalculate_task_tree(main_task=instance)

    def perform_destroy(self, instance):
        project = instance.project
        if not can_manage_project(self.request.user, project):
            raise PermissionDenied("Hanya Project Manager yang dapat menghapus Main Task.")
        task_title = instance.name
        task_id = instance.id
        super().perform_destroy(instance)
        log_task_activity(
            project=project,
            actor=self.request.user,
            task_level="MAIN",
            task_id=task_id,
            task_title=task_title,
            action="DELETED",
            reason="Main task deleted by PM",
        )
        recalculate_task_tree(project=project)

    @action(detail=True, methods=["post"])
    def assign_members(self, request, pk=None):
        main_task = self.get_object()
        project = main_task.project
        if not can_manage_project(request.user, project):
            raise PermissionDenied("Hanya Project Manager yang dapat menugaskan anggota.")

        raw_users = request.data.get("user_ids") or request.data.get("assignee")
        if raw_users is None:
            user_ids = []
        elif isinstance(raw_users, list):
            user_ids = [str(u) for u in raw_users if u]
        else:
            user_ids = [str(raw_users)]

        with transaction.atomic():
            # Remove unselected
            TaskAssignment.objects.filter(main_task=main_task).exclude(assignee_id__in=user_ids).delete()
            # Add new
            for uid in user_ids:
                TaskAssignment.objects.get_or_create(
                    main_task=main_task,
                    assignee_id=uid,
                    defaults={"assigned_by": request.user}
                )
                Member.objects.get_or_create(
                    project=project,
                    user_id=uid,
                    defaults={"project_role": "MEMBER", "status": "ACTIVE"}
                )

            log_task_activity(
                project=project,
                actor=request.user,
                task_level="MAIN",
                task_id=main_task.id,
                task_title=main_task.name,
                action="ASSIGNMENT_UPDATED",
                new_value=str(user_ids),
                reason="Updated assignees for main task",
            )

        serializer = self.get_serializer(main_task)
        return Response(serializer.data)


    @action(detail=True, methods=["post"])
    def override_progress(self, request, pk=None):
        main_task = self.get_object()
        if not can_manage_project(request.user, main_task.project):
            raise PermissionDenied("Hanya Project Manager yang dapat melakukan manual override progress.")

        progress = request.data.get("progress")
        reason = request.data.get("reason", "")
        if progress is None:
            raise ValidationError({"progress": "Field progress wajib diisi."})
        if not reason:
            raise ValidationError({"reason": "Alasan override progress wajib disertakan."})

        override_task_progress(main_task, progress, request.user, reason)
        serializer = self.get_serializer(main_task)
        return Response(serializer.data)


class TaskAssignmentViewSet(BaseERPModelViewSet):
    queryset = TaskAssignment.objects.all()
    serializer_class = TaskAssignmentSerializer


class ProjectWeeklyTaskViewSet(BaseERPModelViewSet):
    queryset = ProjectWeeklyTask.objects.all()
    serializer_class = ProjectWeeklyTaskSerializer
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]

    def get_queryset(self):
        queryset = super().get_queryset()
        main_task_id = self.request.query_params.get("main_task") or self.request.query_params.get("main_task_id")
        project_id = self.request.query_params.get("project") or self.request.query_params.get("project_id")
        if main_task_id:
            queryset = queryset.filter(main_task_id=main_task_id)
        if project_id:
            queryset = queryset.filter(main_task__project_id=project_id)
        return queryset

    def perform_create(self, serializer):
        user = self.request.user
        main_task = serializer.validated_data.get("main_task")
        if not main_task:
            raise PermissionDenied("Main task wajib disertakan.")
        project = main_task.project

        # Superuser, Admin/Staff, or PM has full authority
        is_pm = (
            getattr(user, "is_superuser", False)
            or getattr(user, "is_staff", False)
            or is_executive(user)
            or is_project_management(user)
            or can_manage_project(user, project)
            or has_project_access(user, project, required_roles=["PROJECT_MANAGER", "MANAGER"])
        )

        # Check if user is explicitly assigned to this Main Task
        is_assigned = (
            TaskAssignment.objects.filter(main_task=main_task, assignee=user).exists()
            or getattr(main_task, "created_by_id", None) == user.id
        )

        if not is_pm and not is_assigned:
            raise PermissionDenied(
                "Akses ditolak: Hanya pengguna yang di-assign pada task ini atau Project Manager yang dapat membuat target mingguan."
            )

        if not serializer.validated_data.get("assignee"):
            serializer.validated_data["assignee"] = user

        instance = serializer.save()
        log_task_activity(
            project=project,
            actor=user,
            task_level="WEEKLY",
            task_id=instance.id,
            task_title=f"Week {instance.week_number}: {instance.target_description or main_task.name}",
            action="CREATED",
            reason="Weekly task breakdown created",
        )
        recalculate_task_tree(weekly_task=instance)

    def perform_update(self, serializer):
        instance = serializer.instance
        user = self.request.user
        main_task = instance.main_task
        project = main_task.project
        is_pm = (
            getattr(user, "is_superuser", False)
            or getattr(user, "is_staff", False)
            or is_executive(user)
            or is_project_management(user)
            or can_manage_project(user, project)
        )
        is_pic_or_assignee = (
            instance.assignee_id == user.id
            or TaskAssignment.objects.filter(main_task=main_task, assignee=user).exists()
        )
        if not is_pm and not is_pic_or_assignee:
            raise PermissionDenied("Akses ditolak: Hanya PIC Weekly Task atau Project Manager yang dapat memperbarui target mingguan ini.")

        instance = serializer.save()
        recalculate_task_tree(weekly_task=instance)

    def perform_destroy(self, instance):
        user = self.request.user
        main_task = instance.main_task
        project = main_task.project
        is_pm = (
            getattr(user, "is_superuser", False)
            or getattr(user, "is_staff", False)
            or is_executive(user)
            or is_project_management(user)
            or can_manage_project(user, project)
        )
        is_assignee = instance.assignee_id == user.id
        if not is_pm and not is_assignee:
            raise PermissionDenied("Akses ditolak: Hanya PIC Weekly Task atau Project Manager yang dapat menghapus target mingguan ini.")

        task_id = instance.id
        task_title = f"Week {instance.week_number}: {instance.target_description or main_task.name}"
        super().perform_destroy(instance)
        log_task_activity(
            project=project,
            actor=user,
            task_level="WEEKLY",
            task_id=task_id,
            task_title=task_title,
            action="DELETED",
            reason="Weekly task deleted",
        )
        recalculate_task_tree(main_task=main_task)

    @action(detail=True, methods=["post"])
    def override_progress(self, request, pk=None):
        weekly_task = self.get_object()
        if not can_manage_project(request.user, weekly_task.main_task.project):
            raise PermissionDenied("Hanya Project Manager yang dapat melakukan manual override progress.")

        progress = request.data.get("progress")
        reason = request.data.get("reason", "")
        if progress is None:
            raise ValidationError({"progress": "Field progress wajib diisi."})
        if not reason:
            raise ValidationError({"reason": "Alasan override progress wajib disertakan."})

        override_task_progress(weekly_task, progress, request.user, reason)
        serializer = self.get_serializer(weekly_task)
        return Response(serializer.data)


class ProjectDailyTaskViewSet(BaseERPModelViewSet):
    queryset = ProjectDailyTask.objects.all()
    serializer_class = ProjectDailyTaskSerializer
    permission_classes = [IsDailyTaskOwnerOrPM]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]

    def get_queryset(self):
        queryset = super().get_queryset()
        weekly_task_id = self.request.query_params.get("weekly_task") or self.request.query_params.get("weekly_task_id")
        project_id = self.request.query_params.get("project") or self.request.query_params.get("project_id")
        owner_id = self.request.query_params.get("owner") or self.request.query_params.get("owner_id")

        if weekly_task_id:
            queryset = queryset.filter(weekly_task_id=weekly_task_id)
        if project_id:
            queryset = queryset.filter(weekly_task__main_task__project_id=project_id)
        if owner_id:
            queryset = queryset.filter(owner_id=owner_id)
        return queryset


    def perform_create(self, serializer):
        user = self.request.user
        weekly_task = serializer.validated_data.get("weekly_task")
        if not weekly_task:
            raise PermissionDenied("Weekly task wajib disertakan.")
        main_task = weekly_task.main_task
        project = main_task.project

        # Allow PM, Executive, Superuser, Admin/Staff
        is_pm = (
            getattr(user, "is_superuser", False)
            or getattr(user, "is_staff", False)
            or is_executive(user)
            or is_project_management(user)
            or can_manage_project(user, project)
            or has_project_access(user, project, required_roles=["PROJECT_MANAGER", "MANAGER"])
        )

        # Check if user is PIC of the weekly task, assigned to the main task, or creator
        is_assigned = (
            weekly_task.assignee_id == user.id
            or TaskAssignment.objects.filter(main_task=main_task, assignee=user).exists()
            or getattr(weekly_task, "created_by_id", None) == user.id
            or getattr(main_task, "created_by_id", None) == user.id
        )

        if not is_pm and not is_assigned:
            raise PermissionDenied(
                "Akses ditolak: Hanya PIC Weekly Task, tim yang di-assign pada task ini, atau Project Manager yang dapat membuat Daily Task."
            )

        if not serializer.validated_data.get("owner"):
            serializer.validated_data["owner"] = user

        instance = serializer.save()
        log_task_activity(
            project=project,
            actor=user,
            task_level="DAILY",
            task_id=instance.id,
            task_title=instance.title,
            action="CREATED",
            reason="Daily task created",
        )
        recalculate_task_tree(daily_task=instance)

    def perform_update(self, serializer):
        instance = serializer.instance
        user = self.request.user
        weekly_task = instance.weekly_task
        main_task = weekly_task.main_task
        project = main_task.project
        is_pm = (
            getattr(user, "is_superuser", False)
            or getattr(user, "is_staff", False)
            or is_executive(user)
            or is_project_management(user)
            or can_manage_project(user, project)
        )
        is_owner_or_pic = (
            instance.owner_id == user.id
            or weekly_task.assignee_id == user.id
            or TaskAssignment.objects.filter(main_task=main_task, assignee=user).exists()
        )
        if not is_pm and not is_owner_or_pic:
            raise PermissionDenied("Akses ditolak: Hanya pemilik task (Owner), PIC Weekly Task, atau Project Manager yang dapat memperbarui Daily Task ini.")

        instance = serializer.save()
        recalculate_task_tree(daily_task=instance)

    def perform_destroy(self, instance):
        user = self.request.user
        weekly_task = instance.weekly_task
        project = weekly_task.main_task.project
        is_pm = (
            getattr(user, "is_superuser", False)
            or getattr(user, "is_staff", False)
            or is_executive(user)
            or is_project_management(user)
            or can_manage_project(user, project)
        )
        is_owner_or_pic = (
            instance.owner_id == user.id
            or weekly_task.assignee_id == user.id
        )
        if not is_pm and not is_owner_or_pic:
            raise PermissionDenied("Akses ditolak: Hanya pemilik task (Owner), PIC Weekly Task, atau Project Manager yang dapat menghapus Daily Task ini.")

        task_id = instance.id
        task_title = instance.title
        super().perform_destroy(instance)
        log_task_activity(
            project=project,
            actor=user,
            task_level="DAILY",
            task_id=task_id,
            task_title=task_title,
            action="DELETED",
            reason="Daily task deleted",
        )
        recalculate_task_tree(weekly_task=weekly_task)

    @action(detail=True, methods=["patch"])
    def update_progress(self, request, pk=None):
        daily_task = self.get_object()
        project = daily_task.weekly_task.main_task.project

        # Owner or PM can update daily task progress
        if daily_task.owner_id != request.user.id and not can_manage_project(request.user, project):
            raise PermissionDenied("Hanya pemilik task (Owner) atau Project Manager yang dapat memperbarui progress dan status pekerjaan ini.")

        progress = request.data.get("progress")
        status = request.data.get("status")
        is_blocked = request.data.get("is_blocked")
        block_reason = request.data.get("block_reason")

        if "time_slot" in request.data:
            daily_task.time_slot = request.data.get("time_slot") or ""
        if "output_result" in request.data:
            daily_task.output_result = request.data.get("output_result") or ""
        if "notes" in request.data:
            daily_task.notes = request.data.get("notes") or ""
        if "title" in request.data and request.data.get("title"):
            daily_task.title = request.data.get("title")
        if "description" in request.data:
            daily_task.description = request.data.get("description") or ""

        old_progress = daily_task.progress
        old_status = daily_task.status

        if progress is not None:
            daily_task.progress = Decimal(str(progress))
            if Decimal(str(progress)) >= Decimal("100.00") and not status:
                daily_task.status = "COMPLETED"

        if status is not None:
            daily_task.status = status
            if status == "COMPLETED" and progress is None:
                daily_task.progress = Decimal("100.00")
            elif status == "NOT_STARTED" and progress is None:
                daily_task.progress = Decimal("0.00")

        if is_blocked is not None:
            daily_task.is_blocked = bool(is_blocked)
            if daily_task.is_blocked:
                daily_task.status = "BLOCKED"
                daily_task.block_reason = block_reason or ""
            else:
                if daily_task.status == "BLOCKED":
                    daily_task.status = "IN_PROGRESS" if daily_task.progress > 0 else "NOT_STARTED"
                daily_task.block_reason = ""

        daily_task.save()

        log_task_activity(
            project=project,
            actor=request.user,
            task_level="DAILY",
            task_id=daily_task.id,
            task_title=daily_task.title,
            action="PROGRESS_UPDATED",
            field_name="progress/status",
            old_value=f"{old_progress}% ({old_status})",
            new_value=f"{daily_task.progress}% ({daily_task.status})",
            reason=block_reason or "Regular progress update",
        )

        recalculate_task_tree(daily_task=daily_task)
        serializer = self.get_serializer(daily_task)
        return Response(serializer.data)

    @action(detail=True, methods=["post"])
    def report_blocked(self, request, pk=None):
        daily_task = self.get_object()
        project = daily_task.weekly_task.main_task.project

        reason = request.data.get("reason", "")
        if not reason:
            raise ValidationError({"reason": "Alasan kendala (block reason) wajib diisi."})

        daily_task.is_blocked = True
        daily_task.status = "BLOCKED"
        daily_task.block_reason = reason
        daily_task.save(update_fields=["is_blocked", "status", "block_reason", "updated_at"])

        log_task_activity(
            project=project,
            actor=request.user,
            task_level="DAILY",
            task_id=daily_task.id,
            task_title=daily_task.title,
            action="BLOCKED",
            field_name="status",
            old_value="ACTIVE",
            new_value="BLOCKED",
            reason=reason,
        )

        recalculate_task_tree(daily_task=daily_task)
        serializer = self.get_serializer(daily_task)
        return Response(serializer.data)

    @action(detail=True, methods=["post"])
    def request_transfer(self, request, pk=None):
        daily_task = self.get_object()
        project = daily_task.weekly_task.main_task.project

        if daily_task.owner_id != request.user.id and not can_manage_project(request.user, project):
            raise PermissionDenied("Hanya pemilik task saat ini yang dapat mengajukan transfer.")

        target_user_id = request.data.get("target_user_id") or request.data.get("target_user")
        reason = request.data.get("reason", "")
        if not target_user_id:
            raise ValidationError({"target_user_id": "Target user ID wajib diisi."})

        transfer_request = TaskTransferRequest.objects.create(
            daily_task=daily_task,
            requested_by=request.user,
            target_user_id=target_user_id,
            status="PENDING",
            reason=reason,
        )

        log_task_activity(
            project=project,
            actor=request.user,
            task_level="DAILY",
            task_id=daily_task.id,
            task_title=daily_task.title,
            action="TRANSFER_REQUESTED",
            field_name="owner",
            old_value=str(request.user),
            new_value=str(target_user_id),
            reason=reason,
        )

        serializer = TaskTransferRequestSerializer(transfer_request)
        return Response(serializer.data)

    @action(detail=True, methods=["post"])
    def direct_reassign(self, request, pk=None):
        daily_task = self.get_object()
        project = daily_task.weekly_task.main_task.project

        if not can_manage_project(request.user, project):
            raise PermissionDenied("Hanya Project Manager yang dapat melakukan direct reassign.")

        target_user_id = request.data.get("target_user_id") or request.data.get("target_user")
        reason = request.data.get("reason", "")
        if not target_user_id:
            raise ValidationError({"target_user_id": "Target user ID wajib diisi."})

        from apps.accounts.models import User
        target_user = User.objects.get(pk=target_user_id)
        direct_reassign_task(daily_task, target_user, request.user, reason)
        serializer = self.get_serializer(daily_task)
        return Response(serializer.data)


class TaskTransferRequestViewSet(BaseERPModelViewSet):
    queryset = TaskTransferRequest.objects.all()
    serializer_class = TaskTransferRequestSerializer
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]

    def get_queryset(self):
        queryset = super().get_queryset()
        project_id = self.request.query_params.get("project") or self.request.query_params.get("project_id")
        if project_id:
            queryset = queryset.filter(daily_task__weekly_task__main_task__project_id=project_id)
        return queryset

    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        transfer_req = self.get_object()
        project = transfer_req.daily_task.weekly_task.main_task.project
        if not can_manage_project(request.user, project):
            raise PermissionDenied("Hanya Project Manager yang dapat menyetujui transfer task.")

        review_note = request.data.get("review_note", "")
        process_transfer_approval(transfer_req, approved=True, pm_user=request.user, review_note=review_note)
        serializer = self.get_serializer(transfer_req)
        return Response(serializer.data)

    @action(detail=True, methods=["post"])
    def reject(self, request, pk=None):
        transfer_req = self.get_object()
        project = transfer_req.daily_task.weekly_task.main_task.project
        if not can_manage_project(request.user, project):
            raise PermissionDenied("Hanya Project Manager yang dapat menolak transfer task.")

        review_note = request.data.get("review_note", "")
        process_transfer_approval(transfer_req, approved=False, pm_user=request.user, review_note=review_note)
        serializer = self.get_serializer(transfer_req)
        return Response(serializer.data)

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        transfer_req = self.get_object()
        project = transfer_req.daily_task.weekly_task.main_task.project
        if transfer_req.requested_by_id != request.user.id and not can_manage_project(request.user, project):
            raise PermissionDenied("Hanya pemohon atau PM yang dapat membatalkan pengajuan transfer.")

        transfer_req.status = "CANCELLED"
        transfer_req.save(update_fields=["status"])
        log_task_activity(
            project=project,
            actor=request.user,
            task_level="DAILY",
            task_id=transfer_req.daily_task.id,
            task_title=transfer_req.daily_task.title,
            action="TRANSFER_CANCELLED",
            reason="Cancelled by requester or PM",
        )
        serializer = self.get_serializer(transfer_req)
        return Response(serializer.data)


class TaskActivityLogViewSet(ReadOnlyERPModelViewSet):
    queryset = TaskActivityLog.objects.all()
    serializer_class = TaskActivityLogSerializer
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]

    def get_queryset(self):
        queryset = super().get_queryset()
        project_id = self.request.query_params.get("project") or self.request.query_params.get("project_id")
        task_id = self.request.query_params.get("task_id")
        if project_id:
            queryset = queryset.filter(project_id=project_id)
        if task_id:
            queryset = queryset.filter(task_id=task_id)
        return queryset




from datetime import timedelta

from django.db import transaction
from django.utils import timezone
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from apps.projects.models import Project, ProjectControlItem, ProjectExpense, ProjectLifecycleEvent, ProjectReadinessCheck, Member, Task, TaskDependency, Milestone, MaterialRequirement, BudgetLine, Timesheet, ChangeRequest, ChangeRequestMaterial, Board, BoardColumn, TaskBoardPosition, HealthRule, HealthSnapshot, Risk, Issue, IssueAction, ProjectDispatch, TechnicalBrief, TechnicalBriefVersion, Requirement, AcceptanceCriteria, ResourceRequest, ResourceRequestLine, ResourceAllocation, ProgressSnapshot, EquipmentUsage, WeightIndicator, WeightComponent, ProjectWeeklyProgress
from apps.api_common.viewsets import BaseERPModelViewSet, ReadOnlyERPModelViewSet
from django.db.models import Q
from rest_framework.exceptions import PermissionDenied
from apps.projects.access import can_access_project, can_manage_project, is_executive, is_project_management, is_finance
from .serializers import ProjectSerializer, ProjectControlItemSerializer, ProjectExpenseSerializer, ProjectLifecycleEventSerializer, ProjectReadinessCheckSerializer, MemberSerializer, TaskSerializer, TaskDependencySerializer, MilestoneSerializer, MaterialRequirementSerializer, BudgetLineSerializer, TimesheetSerializer, ChangeRequestSerializer, ChangeRequestMaterialSerializer, BoardSerializer, BoardColumnSerializer, TaskBoardPositionSerializer, HealthRuleSerializer, HealthSnapshotSerializer, RiskSerializer, IssueSerializer, IssueActionSerializer, ProjectDispatchSerializer, TechnicalBriefSerializer, TechnicalBriefVersionSerializer, RequirementSerializer, AcceptanceCriteriaSerializer, ResourceRequestSerializer, ResourceRequestLineSerializer, ResourceAllocationSerializer, ProgressSnapshotSerializer, EquipmentUsageSerializer, WeightIndicatorSerializer, WeightComponentSerializer, ProjectWeeklyProgressSerializer

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


class ProjectControlItemViewSet(BaseERPModelViewSet):
    queryset = ProjectControlItem.objects.all()
    serializer_class = ProjectControlItemSerializer


class ProjectExpenseViewSet(BaseERPModelViewSet):
    queryset = ProjectExpense.objects.all()
    serializer_class = ProjectExpenseSerializer

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


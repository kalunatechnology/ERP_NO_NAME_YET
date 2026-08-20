from drf_spectacular.utils import extend_schema_serializer
from rest_framework import serializers
from django.utils import timezone
from apps.api_common.serializers import ERPModelSerializer
from apps.projects.models import Project, ProjectControlItem, ProjectExpense, ProjectLifecycleEvent, ProjectReadinessCheck, Member, Task, TaskDependency, Milestone, MaterialRequirement, BudgetLine, Timesheet, ChangeRequest, ChangeRequestMaterial, Board, BoardColumn, TaskBoardPosition, HealthRule, HealthSnapshot, Risk, Issue, IssueAction, ProjectDispatch, TechnicalBrief, TechnicalBriefVersion, Requirement, AcceptanceCriteria, ResourceRequest, ResourceRequestLine, ResourceAllocation, ProgressSnapshot, EquipmentUsage, WeightIndicator, WeightComponent, ProjectWeeklyProgress

class ProjectSerializer(ERPModelSerializer):
    class Meta:
        model = Project
        fields = "__all__"


class ProjectControlItemSerializer(ERPModelSerializer):
    class Meta:
        model = ProjectControlItem
        fields = "__all__"


class ProjectExpenseSerializer(ERPModelSerializer):
    billing_invoice_number = serializers.CharField(source="billing_document.invoice_number", read_only=True)
    billing_status = serializers.CharField(source="billing_document.status", read_only=True)
    payment_status = serializers.CharField(source="billing_document.payment_status", read_only=True)
    paid_amount = serializers.DecimalField(source="billing_document.paid_amount", max_digits=24, decimal_places=6, read_only=True)
    outstanding_amount = serializers.DecimalField(source="billing_document.outstanding_amount", max_digits=24, decimal_places=6, read_only=True)

    class Meta:
        model = ProjectExpense
        fields = "__all__"

    def validate(self, attrs):
        attrs = super().validate(attrs)
        project = attrs.get("project") or getattr(self.instance, "project", None)
        billing = attrs.get("billing_document") or getattr(self.instance, "billing_document", None)
        if billing and billing.project_id and project and billing.project_id != project.id:
            raise serializers.ValidationError({"billing_document": "Billing terhubung ke proyek lain."})
        return attrs

    @staticmethod
    def _link_billing(instance):
        billing = instance.billing_document
        if billing and not billing.project_id:
            billing.project = instance.project
            billing.save(update_fields=["project"])
        return instance

    def create(self, validated_data):
        return self._link_billing(super().create(validated_data))

    def update(self, instance, validated_data):
        return self._link_billing(super().update(instance, validated_data))

class ProjectLifecycleEventSerializer(ERPModelSerializer):
    class Meta:
        model = ProjectLifecycleEvent
        fields = "__all__"

class ProjectReadinessCheckSerializer(ERPModelSerializer):
    class Meta:
        model = ProjectReadinessCheck
        fields = "__all__"


class MemberSerializer(ERPModelSerializer):
    class Meta:
        model = Member
        fields = "__all__"

    def validate(self, attrs):
        attrs = super().validate(attrs)
        project = attrs.get("project") or getattr(self.instance, "project", None)
        user = attrs.get("user") or getattr(self.instance, "user", None)
        if project and user and project.tenant_id and user.tenant_id != project.tenant_id:
            raise serializers.ValidationError({"user": "User harus berada pada tenant project yang sama."})
        return attrs

    def create(self, validated_data):
        validated_data.setdefault("assigned_at", timezone.now())
        return super().create(validated_data)


class TaskSerializer(ERPModelSerializer):
    class Meta:
        model = Task
        fields = "__all__"

    def validate(self, attrs):
        attrs = super().validate(attrs)
        project = attrs.get("project") or getattr(self.instance, "project", None)
        assignee = attrs.get("assigned_to") or getattr(self.instance, "assigned_to", None)
        if project and assignee:
            is_manager = project.project_manager_id == assignee.id
            is_member = Member.objects.filter(project=project, user=assignee).filter(status__in=["", "ACTIVE"]).exists()
            if not is_manager and not is_member:
                raise serializers.ValidationError({"assigned_to": "Assignee harus menjadi anggota project."})
        return attrs


class TaskDependencySerializer(ERPModelSerializer):
    class Meta:
        model = TaskDependency
        fields = "__all__"


class MilestoneSerializer(ERPModelSerializer):
    class Meta:
        model = Milestone
        fields = "__all__"


class MaterialRequirementSerializer(ERPModelSerializer):
    class Meta:
        model = MaterialRequirement
        fields = "__all__"


@extend_schema_serializer(component_name="ProjectBudgetLine")
class BudgetLineSerializer(ERPModelSerializer):
    class Meta:
        model = BudgetLine
        fields = "__all__"


class TimesheetSerializer(ERPModelSerializer):
    class Meta:
        model = Timesheet
        fields = "__all__"


class ChangeRequestSerializer(ERPModelSerializer):
    class Meta:
        model = ChangeRequest
        fields = "__all__"
        read_only_fields = ("requested_by", "analyzed_by", "analyzed_at", "submitted_at", "client_decided_at", "applied_at", "applied_by", "status", "approval_status")


class ChangeRequestMaterialSerializer(ERPModelSerializer):
    class Meta:
        model = ChangeRequestMaterial
        fields = "__all__"
        read_only_fields = ("applied_requirement",)


class BoardSerializer(ERPModelSerializer):
    class Meta:
        model = Board
        fields = "__all__"


class BoardColumnSerializer(ERPModelSerializer):
    class Meta:
        model = BoardColumn
        fields = "__all__"


class TaskBoardPositionSerializer(ERPModelSerializer):
    class Meta:
        model = TaskBoardPosition
        fields = "__all__"


class HealthRuleSerializer(ERPModelSerializer):
    class Meta:
        model = HealthRule
        fields = "__all__"


class HealthSnapshotSerializer(ERPModelSerializer):
    class Meta:
        model = HealthSnapshot
        fields = "__all__"


class RiskSerializer(ERPModelSerializer):
    class Meta:
        model = Risk
        fields = "__all__"


class IssueSerializer(ERPModelSerializer):
    class Meta:
        model = Issue
        fields = "__all__"
        read_only_fields = ("reported_by", "reported_at", "analyzed_by", "analyzed_at", "alert_status", "status")


class IssueActionSerializer(ERPModelSerializer):
    class Meta:
        model = IssueAction
        fields = "__all__"
        read_only_fields = ("created_by", "created_at", "completed_at")


class ProjectDispatchSerializer(ERPModelSerializer):
    class Meta:
        model = ProjectDispatch
        fields = "__all__"
        read_only_fields = ("sent_by", "sent_at", "acknowledged_at")




class TechnicalBriefSerializer(ERPModelSerializer):
    class Meta:
        model = TechnicalBrief
        fields = "__all__"


class TechnicalBriefVersionSerializer(ERPModelSerializer):
    class Meta:
        model = TechnicalBriefVersion
        fields = "__all__"


class RequirementSerializer(ERPModelSerializer):
    class Meta:
        model = Requirement
        fields = "__all__"


class AcceptanceCriteriaSerializer(ERPModelSerializer):
    class Meta:
        model = AcceptanceCriteria
        fields = "__all__"


class ResourceRequestSerializer(ERPModelSerializer):
    class Meta:
        model = ResourceRequest
        fields = "__all__"


class ResourceRequestLineSerializer(ERPModelSerializer):
    class Meta:
        model = ResourceRequestLine
        fields = "__all__"


class ResourceAllocationSerializer(ERPModelSerializer):
    class Meta:
        model = ResourceAllocation
        fields = "__all__"


class ProgressSnapshotSerializer(ERPModelSerializer):
    class Meta:
        model = ProgressSnapshot
        fields = "__all__"


class EquipmentUsageSerializer(ERPModelSerializer):
    class Meta:
        model = EquipmentUsage
        fields = "__all__"


class WeightIndicatorSerializer(ERPModelSerializer):
    class Meta:
        model = WeightIndicator
        fields = "__all__"


class WeightComponentSerializer(ERPModelSerializer):
    class Meta:
        model = WeightComponent
        fields = "__all__"


class ProjectWeeklyProgressSerializer(ERPModelSerializer):
    class Meta:
        model = ProjectWeeklyProgress
        fields = "__all__"

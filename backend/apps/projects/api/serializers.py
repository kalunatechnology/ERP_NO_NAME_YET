from drf_spectacular.utils import extend_schema_serializer
from rest_framework import serializers
from django.utils import timezone
from apps.api_common.serializers import ERPModelSerializer
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


class TaskAssignmentSerializer(ERPModelSerializer):
    assignee_name = serializers.CharField(source="assignee.full_name", read_only=True)
    assignee_username = serializers.CharField(source="assignee.username", read_only=True)

    class Meta:
        model = TaskAssignment
        fields = "__all__"

    def validate(self, attrs):
        attrs = super().validate(attrs)
        main_task = attrs.get("main_task") or getattr(self.instance, "main_task", None)
        assignee = attrs.get("assignee") or getattr(self.instance, "assignee", None)
        if main_task and assignee:
            project = main_task.project
            is_pm = project.project_manager_id == assignee.id
            is_member = Member.objects.filter(project=project, user=assignee).filter(status__in=["", "ACTIVE"]).exists()
            if not is_pm and not is_member:
                raise serializers.ValidationError({"assignee": "Assignee harus merupakan anggota aktif pada proyek ini."})
        return attrs


from django.contrib.auth import get_user_model

User = get_user_model()


class ProjectDailyTaskSerializer(ERPModelSerializer):
    owner = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.all(),
        required=False,
        default=serializers.CurrentUserDefault(),
    )
    owner_name = serializers.CharField(source="owner.full_name", read_only=True)
    owner_username = serializers.CharField(source="owner.username", read_only=True)
    weekly_task_name = serializers.CharField(source="weekly_task.target_description", read_only=True)
    main_task_id = serializers.UUIDField(source="weekly_task.main_task.id", read_only=True)
    main_task_name = serializers.CharField(source="weekly_task.main_task.name", read_only=True)
    project_id = serializers.UUIDField(source="weekly_task.main_task.project.id", read_only=True)

    class Meta:
        model = ProjectDailyTask
        fields = "__all__"

    def validate(self, attrs):
        attrs = super().validate(attrs)
        if not attrs.get("owner"):
            request = self.context.get("request")
            if request and hasattr(request, "user") and request.user.is_authenticated:
                attrs["owner"] = request.user

        weekly_task = attrs.get("weekly_task") or getattr(self.instance, "weekly_task", None)
        planned_date = attrs.get("planned_date") or getattr(self.instance, "planned_date", None)
        owner = attrs.get("owner") or getattr(self.instance, "owner", None)

        if weekly_task and planned_date:
            if weekly_task.start_date and planned_date < weekly_task.start_date:
                raise serializers.ValidationError(
                    {"planned_date": f"Planned date ({planned_date}) tidak boleh sebelum awal Weekly Task ({weekly_task.start_date})."}
                )
            if weekly_task.end_date and planned_date > weekly_task.end_date:
                raise serializers.ValidationError(
                    {"planned_date": f"Planned date ({planned_date}) tidak boleh melampaui akhir Weekly Task ({weekly_task.end_date})."}
                )

        if weekly_task and owner:
            project = weekly_task.main_task.project
            is_pm = project.project_manager_id == owner.id
            is_member = Member.objects.filter(project=project, user=owner).filter(status__in=["", "ACTIVE"]).exists()
            if not is_pm and not is_member:
                raise serializers.ValidationError({"owner": "Owner task harus anggota aktif pada proyek ini."})

        return attrs


class ProjectWeeklyTaskSerializer(ERPModelSerializer):
    assignee_name = serializers.CharField(source="assignee.full_name", read_only=True)
    assignee_username = serializers.CharField(source="assignee.username", read_only=True)
    main_task_name = serializers.CharField(source="main_task.name", read_only=True)
    daily_tasks = ProjectDailyTaskSerializer(many=True, read_only=True)

    class Meta:
        model = ProjectWeeklyTask
        fields = "__all__"

    def validate(self, attrs):
        attrs = super().validate(attrs)
        main_task = attrs.get("main_task") or getattr(self.instance, "main_task", None)
        start_date = attrs.get("start_date") or getattr(self.instance, "start_date", None)
        end_date = attrs.get("end_date") or getattr(self.instance, "end_date", None)

        if start_date and end_date and start_date > end_date:
            raise serializers.ValidationError({"end_date": "Tanggal akhir tidak boleh sebelum tanggal mulai."})

        if main_task:
            if main_task.start_date and start_date and start_date < main_task.start_date:
                raise serializers.ValidationError(
                    {"start_date": f"Start date ({start_date}) tidak boleh sebelum tanggal mulai Main Task ({main_task.start_date})."}
                )
            if main_task.due_date and end_date and end_date > main_task.due_date:
                raise serializers.ValidationError(
                    {"end_date": f"End date ({end_date}) tidak boleh melampaui due date Main Task ({main_task.due_date})."}
                )
        return attrs


class ProjectMainTaskSerializer(ERPModelSerializer):
    assignments = TaskAssignmentSerializer(many=True, read_only=True)
    weekly_tasks = ProjectWeeklyTaskSerializer(many=True, read_only=True)
    created_by_name = serializers.CharField(source="created_by.full_name", read_only=True)

    class Meta:
        model = ProjectMainTask
        fields = "__all__"

    def validate(self, attrs):
        attrs = super().validate(attrs)
        start_date = attrs.get("start_date") or getattr(self.instance, "start_date", None)
        due_date = attrs.get("due_date") or getattr(self.instance, "due_date", None)
        if start_date and due_date and start_date > due_date:
            raise serializers.ValidationError({"due_date": "Due date tidak boleh mendahului start date."})
        return attrs


class TaskTransferRequestSerializer(ERPModelSerializer):
    requested_by_name = serializers.CharField(source="requested_by.full_name", read_only=True)
    requested_by_username = serializers.CharField(source="requested_by.username", read_only=True)
    target_user_name = serializers.CharField(source="target_user.full_name", read_only=True)
    target_user_username = serializers.CharField(source="target_user.username", read_only=True)
    from_user = serializers.CharField(source="requested_by.id", read_only=True)
    from_user_name = serializers.CharField(source="requested_by.full_name", read_only=True)
    to_user = serializers.CharField(source="target_user.id", read_only=True)
    to_user_name = serializers.CharField(source="target_user.full_name", read_only=True)
    daily_task_title = serializers.CharField(source="daily_task.title", read_only=True)
    project_id = serializers.UUIDField(source="daily_task.weekly_task.main_task.project.id", read_only=True)

    class Meta:
        model = TaskTransferRequest
        fields = "__all__"


    def validate(self, attrs):
        attrs = super().validate(attrs)
        daily_task = attrs.get("daily_task") or getattr(self.instance, "daily_task", None)
        target_user = attrs.get("target_user") or getattr(self.instance, "target_user", None)
        if daily_task and target_user:
            project = daily_task.weekly_task.main_task.project
            is_pm = project.project_manager_id == target_user.id
            is_member = Member.objects.filter(project=project, user=target_user).filter(status__in=["", "ACTIVE"]).exists()
            if not is_pm and not is_member:
                raise serializers.ValidationError({"target_user": "Target user transfer harus anggota aktif pada proyek ini."})
        return attrs


class TaskActivityLogSerializer(ERPModelSerializer):
    actor_name = serializers.CharField(source="actor.full_name", read_only=True)
    actor_username = serializers.CharField(source="actor.username", read_only=True)

    class Meta:
        model = TaskActivityLog
        fields = "__all__"


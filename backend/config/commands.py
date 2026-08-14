from __future__ import annotations

from datetime import date
from decimal import Decimal
from uuid import uuid4

from django.apps import apps
from django.db import transaction
from django.db.models import Avg, Count, F, Q, Sum
from django.db.models.functions import Coalesce
from django.shortcuts import get_object_or_404
from django.utils import timezone
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import (
    OpenApiParameter,
    OpenApiResponse,
    extend_schema,
    inline_serializer,
)
from rest_framework import permissions, serializers, status
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.generics import GenericAPIView

from apps.api_common.audit import create_audit_event, snapshot
from apps.api_common.scoping import get_scope_value


ZERO = Decimal("0")


# ---------------------------------------------------------------------------
# OpenAPI / Swagger schema helpers
# ---------------------------------------------------------------------------


class ERPEmptyCommandSerializer(serializers.Serializer):
    """Fallback serializer for commands without a request body."""

    pass


class ERPCommandResponseSerializer(serializers.Serializer):
    """Standard success envelope returned by ERP command endpoints."""

    success = serializers.BooleanField()
    message = serializers.CharField()
    data = serializers.JSONField(required=False, allow_null=True)


class ERPCommandErrorSerializer(serializers.Serializer):
    """Generic DRF validation/error response used by command endpoints."""

    detail = serializers.JSONField(required=False)
    errors = serializers.JSONField(required=False)


COMPANY_SCOPE_PARAMETERS = [
    OpenApiParameter(
        name="X-Company-ID",
        type=OpenApiTypes.UUID,
        location=OpenApiParameter.HEADER,
        required=False,
        description="UUID company aktif. Dapat menggantikan query parameter company_id.",
    ),
    OpenApiParameter(
        name="company_id",
        type=OpenApiTypes.UUID,
        location=OpenApiParameter.QUERY,
        required=False,
        description="UUID company aktif jika header X-Company-ID tidak digunakan.",
    ),
]


def command_schema(
    *,
    tag: str,
    summary: str,
    request_serializer=None,
    success_status: int = status.HTTP_200_OK,
    description: str | None = None,
    parameters=None,
):
    """
    Apply a consistent OpenAPI contract to an ERP command endpoint.

    The serializer is used only for schema generation. Runtime validation
    remains inside each command method, preserving the existing business logic.
    """

    return extend_schema(
        tags=[tag],
        summary=summary,
        description=description or f"Menjalankan command ERP: {summary}.",
        request=request_serializer,
        parameters=parameters or [],
        responses={
            success_status: ERPCommandResponseSerializer,
            status.HTTP_400_BAD_REQUEST: OpenApiResponse(
                response=ERPCommandErrorSerializer,
                description="Payload atau status transaksi tidak valid.",
            ),
            status.HTTP_401_UNAUTHORIZED: OpenApiResponse(
                response=ERPCommandErrorSerializer,
                description="Token autentikasi tidak tersedia atau tidak valid.",
            ),
            status.HTTP_403_FORBIDDEN: OpenApiResponse(
                response=ERPCommandErrorSerializer,
                description="Pengguna tidak memiliki izin untuk menjalankan command.",
            ),
            status.HTTP_404_NOT_FOUND: OpenApiResponse(
                response=ERPCommandErrorSerializer,
                description="Resource yang diminta tidak ditemukan.",
            ),
        },
    )


def optional_decimal_field(*, required: bool = False):
    return serializers.DecimalField(
        max_digits=24,
        decimal_places=6,
        required=required,
        allow_null=not required,
    )


def optional_uuid_field(*, required: bool = False):
    return serializers.UUIDField(
        required=required,
        allow_null=not required,
    )



def dec(value, default=ZERO) -> Decimal:
    if value is None or value == "":
        return default
    return Decimal(str(value))


def model_payload(instance):
    data = snapshot(instance)
    data["model"] = instance._meta.label
    return data


def document_number(prefix: str) -> str:
    return f"{prefix}-{timezone.localdate():%Y%m%d}-{uuid4().hex[:8].upper()}"


def create_business_document(*, source=None, document_type: str, prefix: str, user=None, status_value="DRAFT"):
    from apps.core.models import BusinessDocument

    tenant_id = get_scope_value(source, "tenant") if source is not None else getattr(user, "tenant_id", None)
    company_id = get_scope_value(source, "company") if source is not None else None
    return BusinessDocument.objects.create(
        tenant_id=tenant_id,
        company_id=company_id,
        document_type=document_type,
        document_number=document_number(prefix),
        status=status_value,
        document_date=timezone.localdate(),
        version=1,
        created_by=user,
    )


def update_document(document, *, status_value: str, user=None, posting=False):
    if document is None:
        return
    document.status = status_value
    fields = ["status", "updated_at"]
    if status_value == "APPROVED" and user is not None:
        document.approved_by = user
        fields.append("approved_by")
    if posting:
        document.posting_date = timezone.localdate()
        document.posted_by = user
        fields.extend(["posting_date", "posted_by"])
    document.save(update_fields=fields)


class ERPCommandView(GenericAPIView):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = ERPEmptyCommandSerializer

    def ok(self, data=None, message="Operasi berhasil.", http_status=status.HTTP_200_OK):
        return Response({"success": True, "message": message, "data": data}, status=http_status)


# ---------------------------------------------------------------------------
# Core document lifecycle
# ---------------------------------------------------------------------------


class DocumentSubmitView(ERPCommandView):
    @command_schema(
        tag="Commands — Core",
        summary="Submit business document",
        request_serializer=None,
        success_status=status.HTTP_200_OK,
        parameters=None,
    )
    @transaction.atomic
    def post(self, request, id):
        from apps.core.models import BusinessDocument, WorkflowInstance

        document = get_object_or_404(BusinessDocument, pk=id)
        if document.status not in {"", "DRAFT", "REJECTED", "RETURNED"}:
            raise ValidationError({"status": f"Dokumen berstatus {document.status} tidak dapat diajukan."})
        before = snapshot(document)
        document.status = "SUBMITTED"
        document.save(update_fields=["status", "updated_at"])
        workflow, _ = WorkflowInstance.objects.get_or_create(
            document=document,
            defaults={
                "workflow_code": document.document_type or "DEFAULT",
                "current_state": "SUBMITTED",
                "status": "ACTIVE",
                "started_at": timezone.now(),
            },
        )
        if not _:
            workflow.current_state = "SUBMITTED"
            workflow.status = "ACTIVE"
            workflow.completed_at = None
            workflow.save(update_fields=["current_state", "status", "completed_at"])
        create_audit_event(request=request, instance=document, event_type="SUBMIT", before=before, after=snapshot(document))
        return self.ok(model_payload(document), "Dokumen berhasil diajukan.")


class DocumentApproveView(ERPCommandView):
    @command_schema(
        tag="Commands — Core",
        summary="Approve business document",
        request_serializer=inline_serializer(
            name="DocumentApproveCommandRequest",
            fields={
                "approval_level": serializers.CharField(required=False, default="FINAL"),
                "remarks": serializers.CharField(required=False, allow_blank=True)
            },
        ),
        success_status=status.HTTP_200_OK,
        parameters=None,
    )
    @transaction.atomic
    def post(self, request, id):
        from apps.core.models import BusinessDocument, WorkflowApproval, WorkflowInstance

        document = get_object_or_404(BusinessDocument, pk=id)
        if document.status not in {"SUBMITTED", "IN_REVIEW", "PENDING_APPROVAL"}:
            raise ValidationError({"status": f"Dokumen berstatus {document.status} tidak dapat disetujui."})
        before = snapshot(document)
        workflow, _ = WorkflowInstance.objects.get_or_create(
            document=document,
            defaults={"workflow_code": document.document_type or "DEFAULT", "started_at": timezone.now()},
        )
        WorkflowApproval.objects.create(
            workflow_instance=workflow,
            approver_user=request.user,
            approval_level=str(request.data.get("approval_level", "FINAL")),
            decision="APPROVED",
            remarks=str(request.data.get("remarks", "")),
            decided_at=timezone.now(),
        )
        workflow.current_state = "APPROVED"
        workflow.status = "COMPLETED"
        workflow.completed_at = timezone.now()
        workflow.save(update_fields=["current_state", "status", "completed_at"])
        document.status = "APPROVED"
        document.approved_by = request.user
        document.save(update_fields=["status", "approved_by", "updated_at"])
        create_audit_event(request=request, instance=document, event_type="APPROVE", before=before, after=snapshot(document))
        return self.ok(model_payload(document), "Dokumen berhasil disetujui.")


class DocumentRejectView(ERPCommandView):
    @command_schema(
        tag="Commands — Core",
        summary="Reject business document",
        request_serializer=inline_serializer(
            name="DocumentRejectCommandRequest",
            fields={
                "approval_level": serializers.CharField(required=False, default="CURRENT"),
                "remarks": serializers.CharField(required=False, allow_blank=True)
            },
        ),
        success_status=status.HTTP_200_OK,
        parameters=None,
    )
    @transaction.atomic
    def post(self, request, id):
        from apps.core.models import BusinessDocument, WorkflowApproval, WorkflowInstance

        document = get_object_or_404(BusinessDocument, pk=id)
        if document.status in {"POSTED", "REVERSED", "CANCELLED"}:
            raise ValidationError({"status": "Dokumen yang sudah diposting/dibatalkan tidak dapat ditolak."})
        before = snapshot(document)
        workflow, _ = WorkflowInstance.objects.get_or_create(
            document=document,
            defaults={"workflow_code": document.document_type or "DEFAULT", "started_at": timezone.now()},
        )
        WorkflowApproval.objects.create(
            workflow_instance=workflow,
            approver_user=request.user,
            approval_level=str(request.data.get("approval_level", "CURRENT")),
            decision="REJECTED",
            remarks=str(request.data.get("remarks", "")),
            decided_at=timezone.now(),
        )
        workflow.current_state = "REJECTED"
        workflow.status = "COMPLETED"
        workflow.completed_at = timezone.now()
        workflow.save(update_fields=["current_state", "status", "completed_at"])
        document.status = "REJECTED"
        document.save(update_fields=["status", "updated_at"])
        create_audit_event(request=request, instance=document, event_type="REJECT", before=before, after=snapshot(document))
        return self.ok(model_payload(document), "Dokumen berhasil ditolak.")


class DocumentPostView(ERPCommandView):
    @command_schema(
        tag="Commands — Core",
        summary="Post business document",
        request_serializer=None,
        success_status=status.HTTP_200_OK,
        parameters=None,
    )
    @transaction.atomic
    def post(self, request, id):
        from apps.core.models import BusinessDocument

        document = get_object_or_404(BusinessDocument, pk=id)
        if document.status not in {"APPROVED", "CONFIRMED", "COMPLETED"}:
            raise ValidationError({"status": "Dokumen harus disetujui sebelum diposting."})
        before = snapshot(document)
        update_document(document, status_value="POSTED", user=request.user, posting=True)
        create_audit_event(request=request, instance=document, event_type="POST", before=before, after=snapshot(document))
        return self.ok(model_payload(document), "Dokumen berhasil diposting.")


class DocumentCancelView(ERPCommandView):
    @command_schema(
        tag="Commands — Core",
        summary="Cancel business document",
        request_serializer=None,
        success_status=status.HTTP_200_OK,
        parameters=None,
    )
    @transaction.atomic
    def post(self, request, id):
        from apps.core.models import BusinessDocument

        document = get_object_or_404(BusinessDocument, pk=id)
        if document.status in {"POSTED", "REVERSED"}:
            raise ValidationError({"status": "Dokumen posted harus direversal, bukan dibatalkan."})
        before = snapshot(document)
        document.status = "CANCELLED"
        document.save(update_fields=["status", "updated_at"])
        create_audit_event(request=request, instance=document, event_type="CANCEL", before=before, after=snapshot(document))
        return self.ok(model_payload(document), "Dokumen berhasil dibatalkan.")


class DocumentReverseView(ERPCommandView):
    @command_schema(
        tag="Commands — Core",
        summary="Create document reversal",
        request_serializer=None,
        success_status=status.HTTP_201_CREATED,
        parameters=None,
    )
    @transaction.atomic
    def post(self, request, id):
        from apps.core.models import BusinessDocument, DocumentLink

        original = get_object_or_404(BusinessDocument, pk=id)
        if original.status != "POSTED":
            raise ValidationError({"status": "Hanya dokumen POSTED yang dapat direversal."})
        if BusinessDocument.objects.filter(reversal_of=original).exists():
            raise ValidationError({"reversal": "Dokumen reversal sudah pernah dibuat."})
        reversal = BusinessDocument.objects.create(
            tenant=original.tenant,
            company=original.company,
            document_type=f"REVERSAL_{original.document_type}",
            document_number=document_number("REV"),
            status="DRAFT",
            document_date=timezone.localdate(),
            version=1,
            created_by=request.user,
            reversal_of=original,
        )
        DocumentLink.objects.create(source_document=original, target_document=reversal, link_type="REVERSED_BY", created_at=timezone.now())
        before = snapshot(original)
        original.status = "REVERSED"
        original.save(update_fields=["status", "updated_at"])
        create_audit_event(request=request, instance=original, event_type="REVERSE", before=before, after=snapshot(original))
        return self.ok({"original": model_payload(original), "reversal": model_payload(reversal)}, "Dokumen reversal berhasil dibuat.", status.HTTP_201_CREATED)


class DocumentHistoryView(ERPCommandView):
    @command_schema(
        tag="Commands — Core",
        summary="Get document lifecycle history",
        request_serializer=None,
        success_status=status.HTTP_200_OK,
        parameters=None,
    )
    def get(self, request, id):
        from apps.core.models import AuditEvent, BusinessDocument, WorkflowApproval

        document = get_object_or_404(BusinessDocument, pk=id)
        audits = AuditEvent.objects.filter(Q(document=document) | Q(entity_id=document.id)).order_by("occurred_at")
        approvals = WorkflowApproval.objects.filter(workflow_instance__document=document).select_related("approver_user").order_by("decided_at")
        return self.ok(
            {
                "document": model_payload(document),
                "audit_events": [model_payload(item) for item in audits],
                "approvals": [model_payload(item) for item in approvals],
            }
        )


# ---------------------------------------------------------------------------
# Sales
# ---------------------------------------------------------------------------


class QuotationConvertToOrderView(ERPCommandView):
    @command_schema(
        tag="Commands — Sales",
        summary="Convert quotation to sales order",
        request_serializer=inline_serializer(
            name="QuotationConvertToOrderCommandRequest",
            fields={
                "requested_delivery_date": serializers.DateField(required=False, allow_null=True),
                "fulfillment_method": serializers.CharField(required=False, default="PROJECT")
            },
        ),
        success_status=status.HTTP_201_CREATED,
        parameters=None,
    )
    @transaction.atomic
    def post(self, request, id):
        from apps.sales.models import Order, OrderLine, Quotation, QuotationLine

        quotation = get_object_or_404(Quotation, pk=id)
        if quotation.status not in {"APPROVED", "ACCEPTED", "WON"}:
            raise ValidationError({"status": "Quotation harus APPROVED/ACCEPTED sebelum dikonversi."})
        existing = Order.objects.filter(quotation=quotation).first()
        if existing:
            return self.ok(model_payload(existing), "Quotation sudah pernah dikonversi.")
        document = create_business_document(source=quotation, document_type="SALES_ORDER", prefix="SO", user=request.user)
        order = Order.objects.create(
            document=document,
            quotation=quotation,
            customer_party=quotation.customer_party,
            currency=quotation.currency,
            payment_term=quotation.payment_term,
            order_date=timezone.localdate(),
            requested_delivery_date=request.data.get("requested_delivery_date"),
            subtotal=quotation.subtotal,
            tax_amount=quotation.tax_amount,
            total_amount=quotation.total_amount,
            status="DRAFT",
        )
        for line in QuotationLine.objects.filter(quotation=quotation):
            OrderLine.objects.create(
                sales_order=order,
                product=line.product,
                ordered_quantity=line.quantity,
                delivered_quantity=ZERO,
                invoiced_quantity=ZERO,
                uom=line.uom,
                unit_price=line.unit_price,
                tax_code=line.tax_code,
                fulfillment_method=str(request.data.get("fulfillment_method", "PROJECT")),
            )
        quotation.status = "CONVERTED"
        quotation.save(update_fields=["status"])
        create_audit_event(request=request, instance=order, event_type="CREATE_FROM_QUOTATION", after=snapshot(order))
        return self.ok(model_payload(order), "Sales order berhasil dibuat.", status.HTTP_201_CREATED)


class SalesOrderConfirmView(ERPCommandView):
    @command_schema(
        tag="Commands — Sales",
        summary="Confirm sales order",
        request_serializer=None,
        success_status=status.HTTP_200_OK,
        parameters=None,
    )
    @transaction.atomic
    def post(self, request, id):
        from apps.sales.models import Order

        order = get_object_or_404(Order, pk=id)
        before = snapshot(order)
        order.status = "CONFIRMED"
        order.save(update_fields=["status"])
        update_document(order.document, status_value="APPROVED", user=request.user)
        create_audit_event(request=request, instance=order, event_type="CONFIRM", before=before, after=snapshot(order))
        return self.ok(model_payload(order), "Sales order berhasil dikonfirmasi.")


class SalesOrderAllocateView(ERPCommandView):
    @command_schema(
        tag="Commands — Sales",
        summary="Allocate sales order demand",
        request_serializer=inline_serializer(
            name="SalesOrderAllocateCommandRequest",
            fields={
                "allocations": serializers.JSONField(required=False, help_text="Daftar alokasi per sales_order_line_id.")
            },
        ),
        success_status=status.HTTP_200_OK,
        parameters=None,
    )
    @transaction.atomic
    def post(self, request, id):
        from apps.sales.models import DemandSupplyLink, Order, OrderLine

        order = get_object_or_404(Order, pk=id)
        allocations = {str(item.get("sales_order_line_id")): item for item in request.data.get("allocations", [])}
        created = []
        for line in OrderLine.objects.filter(sales_order=order):
            payload = allocations.get(str(line.id), {})
            link, _ = DemandSupplyLink.objects.update_or_create(
                sales_order_line=line,
                defaults={
                    "project_id": payload.get("project_id") or line.project_id,
                    "production_order_id": payload.get("production_order_id"),
                    "purchase_order_line_id": payload.get("purchase_order_line_id"),
                    "stock_reservation_id": payload.get("stock_reservation_id"),
                    "demand_quantity": line.ordered_quantity or ZERO,
                    "allocated_quantity": dec(payload.get("allocated_quantity", line.ordered_quantity)),
                    "fulfilled_quantity": dec(payload.get("fulfilled_quantity", ZERO)),
                    "status": str(payload.get("status", "ALLOCATED")),
                },
            )
            created.append(model_payload(link))
        order.status = "ALLOCATED"
        order.save(update_fields=["status"])
        return self.ok(created, "Demand-supply allocation berhasil dibuat.")


class SalesOrderConvertToProjectView(ERPCommandView):
    @command_schema(
        tag="Commands â€” Projects",
        summary="Convert sales order to project",
        request_serializer=inline_serializer(
            name="SalesOrderConvertToProjectCommandRequest",
            fields={
                "project_code": serializers.CharField(required=False, allow_blank=True),
                "project_name": serializers.CharField(required=False, allow_blank=True),
                "warehouse_id": optional_uuid_field(),
                "budget_amount": optional_decimal_field(),
                "planned_start_date": serializers.DateField(required=False, allow_null=True),
                "planned_end_date": serializers.DateField(required=False, allow_null=True),
            },
        ),
        success_status=status.HTTP_201_CREATED,
        parameters=None,
    )
    @transaction.atomic
    def post(self, request, id):
        from apps.core.models import DocumentLink
        from apps.master_data.models import Warehouse
        from apps.projects.models import MaterialRequirement, Member, Project, Requirement, TechnicalBrief
        from apps.sales.models import DemandSupplyLink, Order, OrderLine

        order = get_object_or_404(Order.objects.select_for_update(), pk=id)
        existing = Project.objects.filter(sales_order=order).first()
        if existing:
            update_fields = []
            if existing.project_manager_id is None:
                existing.project_manager = request.user
                update_fields.append("project_manager")
            if update_fields:
                existing.save(update_fields=update_fields)
            from apps.projects.models import Member
            Member.objects.get_or_create(
                project=existing,
                user=request.user,
                defaults={"project_role": "PROJECT_MANAGER", "status": "ACTIVE", "assigned_at": timezone.now()},
            )
            return self.ok(project_flow_data(existing), "Sales order sudah terhubung ke project.")
        if order.status not in {"CONFIRMED", "ALLOCATED"}:
            raise ValidationError({"status": "Sales order harus CONFIRMED atau ALLOCATED sebelum menjadi project."})

        company_id = get_scope_value(order, "company") or request.headers.get("X-Company-ID")
        tenant_id = get_scope_value(order, "tenant") or getattr(request.user, "tenant_id", None)
        warehouse = None
        if request.data.get("warehouse_id"):
            warehouse = get_object_or_404(Warehouse, pk=request.data["warehouse_id"], company_id=company_id)
        elif company_id:
            warehouse = Warehouse.objects.filter(company_id=company_id, status__in=["ACTIVE", "OPEN", ""]).first()

        document = create_business_document(source=order, document_type="PROJECT", prefix="PRJ", user=request.user)
        project = Project.objects.create(
            document=document,
            tenant_id=tenant_id,
            company_id=company_id,
            customer_party=order.customer_party,
            sales_order=order,
            project_manager=request.user,
            project_code=str(request.data.get("project_code") or document.document_number),
            project_name=str(request.data.get("project_name") or f"Project {order.document.document_number if order.document else order.id}"),
            planned_start_date=request.data.get("planned_start_date"),
            planned_end_date=request.data.get("planned_end_date"),
            budget_amount=dec(request.data.get("budget_amount")),
            progress_percent=ZERO,
            status="DRAFT",
            lifecycle_status="DRAFT",
            source_type="SALES_ORDER",
        )
        Member.objects.get_or_create(
            project=project,
            user=request.user,
            defaults={
                "project_role": "PROJECT_MANAGER",
                "status": "ACTIVE",
                "assigned_at": timezone.now(),
            },
        )
        if order.document:
            DocumentLink.objects.get_or_create(
                source_document=order.document,
                target_document=document,
                link_type="ORDER_TO_PROJECT",
                defaults={"created_at": timezone.now()},
            )
        brief = TechnicalBrief.objects.create(
            document=create_business_document(source=project, document_type="TECHNICAL_BRIEF", prefix="BRF", user=request.user),
            project=project,
            sales_order=order,
            brief_number=f"BRF-{project.project_code}",
            brief_title=project.project_name,
            objective=f"Pemenuhan sales order {order.document.document_number if order.document else order.id}",
            scope_summary="Scope awal dibentuk otomatis dari line sales order.",
            owner_user=request.user,
            approval_status="PENDING",
            status="DRAFT",
        )
        for index, line in enumerate(OrderLine.objects.filter(sales_order=order).select_related("product"), start=1):
            Requirement.objects.create(
                technical_brief=brief,
                requirement_code=f"REQ-{index:03d}",
                requirement_type="PRODUCT",
                requirement_text=f"{line.product or 'Produk'} sejumlah {line.ordered_quantity or ZERO}",
                priority="HIGH",
                verification_method="DELIVERY_AND_QA",
                status="DRAFT",
            )
            MaterialRequirement.objects.create(
                project=project,
                product=line.product,
                warehouse=warehouse,
                required_quantity=line.ordered_quantity or ZERO,
                reserved_quantity=ZERO,
                issued_quantity=ZERO,
                required_date=order.requested_delivery_date,
                status="PLANNED",
            )
            line.project = project
            line.fulfillment_method = "PROJECT"
            line.save(update_fields=["project", "fulfillment_method"])
            DemandSupplyLink.objects.update_or_create(
                sales_order_line=line,
                defaults={
                    "project": project,
                    "demand_quantity": line.ordered_quantity or ZERO,
                    "allocated_quantity": ZERO,
                    "fulfilled_quantity": ZERO,
                    "status": "PROJECT_CREATED",
                },
            )
        order.status = "PROJECT_CREATED"
        order.save(update_fields=["status"])
        create_audit_event(request=request, instance=project, event_type="CREATE_FROM_ORDER", after=snapshot(project))
        return self.ok(project_flow_data(project), "Project dan data awal berhasil dibuat dari sales order.", status.HTTP_201_CREATED)


class SalesDeliveryDispatchView(ERPCommandView):
    @command_schema(
        tag="Commands — Sales",
        summary="Dispatch sales delivery",
        request_serializer=None,
        success_status=status.HTTP_200_OK,
        parameters=None,
    )
    @transaction.atomic
    def post(self, request, id):
        from apps.sales.models import Delivery, DeliveryLine

        delivery = get_object_or_404(Delivery, pk=id)
        delivery.delivery_status = "DISPATCHED"
        delivery.save(update_fields=["delivery_status"])
        update_document(delivery.document, status_value="POSTED", user=request.user, posting=True)
        for line in DeliveryLine.objects.filter(delivery=delivery).select_related("sales_order_line"):
            if line.sales_order_line:
                line.sales_order_line.delivered_quantity = (line.sales_order_line.delivered_quantity or ZERO) + (line.quantity or ZERO)
                line.sales_order_line.save(update_fields=["delivered_quantity"])
        return self.ok(model_payload(delivery), "Delivery berhasil didispatch.")


# ---------------------------------------------------------------------------
# Projects
# ---------------------------------------------------------------------------


def project_cost_data(project):
    from apps.manufacturing.models import ProductionMaterial
    from apps.projects.models import BudgetLine, EquipmentUsage, ProjectExpense, Timesheet

    budget = BudgetLine.objects.filter(project=project).aggregate(v=Coalesce(Sum("budget_amount"), ZERO))["v"]
    labor = Timesheet.objects.filter(project=project, approval_status="APPROVED").aggregate(v=Coalesce(Sum("amount"), ZERO))["v"]
    equipment = EquipmentUsage.objects.filter(project=project).aggregate(v=Coalesce(Sum("total_cost"), ZERO))["v"]
    material = ProductionMaterial.objects.filter(production_order__project=project).aggregate(v=Coalesce(Sum("actual_cost"), ZERO))["v"]
    registered_expense = ProjectExpense.objects.filter(project=project).aggregate(v=Coalesce(Sum("amount"), ZERO))["v"]
    operational_cost = labor + equipment + material
    actual = registered_expense if registered_expense > ZERO else operational_cost
    return {
        "budget_amount": budget or project.budget_amount or ZERO,
        "labor_cost": labor,
        "equipment_cost": equipment,
        "material_cost": material,
        "registered_expense": registered_expense,
        "operational_cost": operational_cost,
        "actual_cost": actual,
        "remaining_budget": (budget or project.budget_amount or ZERO) - actual,
    }


def project_flow_data(project):
    """Return the authoritative backend gate status for the incoming-order flow."""
    from apps.inventory.models import StockBalance, StockReservation
    from apps.projects.models import BudgetLine, MaterialRequirement, Requirement, TechnicalBrief

    briefs = TechnicalBrief.objects.filter(project=project)
    requirements = Requirement.objects.filter(technical_brief__project=project)
    materials = MaterialRequirement.objects.filter(project=project).select_related("product", "warehouse")
    budget_total = BudgetLine.objects.filter(project=project).aggregate(v=Coalesce(Sum("budget_amount"), ZERO))["v"] or project.budget_amount or ZERO
    shortages = []
    material_rows = []
    for item in materials:
        required = item.required_quantity or ZERO
        reserved = item.reserved_quantity or ZERO
        available = ZERO
        if item.product_id and item.warehouse_id:
            available = StockBalance.objects.filter(
                company=project.company,
                product=item.product,
                warehouse_location__warehouse=item.warehouse,
                warehouse_location__active=True,
                warehouse_location__quality_hold=False,
            ).aggregate(v=Coalesce(Sum("available_quantity"), ZERO))["v"]
        shortage = max(ZERO, required - reserved - available)
        row = {
            "material_requirement_id": str(item.id),
            "product_id": str(item.product_id) if item.product_id else None,
            "warehouse_id": str(item.warehouse_id) if item.warehouse_id else None,
            "required_quantity": str(required),
            "reserved_quantity": str(reserved),
            "available_quantity": str(available),
            "shortage_quantity": str(shortage),
        }
        material_rows.append(row)
        if not item.product_id or not item.warehouse_id or shortage > ZERO:
            shortages.append(row)
    funding_project = project.source_type == "FUNDING_REQUEST"
    has_order = bool(project.sales_order_id) or funding_project
    scope_ready = (briefs.exists() and requirements.exists()) or (funding_project and bool(project.description.strip()))
    material_defined = materials.exists() or funding_project
    budget_ready = budget_total > ZERO
    stock_ready = material_defined and not shortages
    lifecycle = project.lifecycle_status or project.status or "DRAFT"
    verified = lifecycle in {"VERIFIED", "RESOURCE_RESERVED", "IN_PROGRESS", "QA_REVIEW", "COMPLETED", "CLOSED"}
    reservation_ready = funding_project and not materials.exists()
    if materials.exists():
        reservation_ready = all(
            (item.reserved_quantity or ZERO) >= (item.required_quantity or ZERO) for item in materials
        ) and StockReservation.objects.filter(project=project, status="ACTIVE").exists()
    started = lifecycle in {"IN_PROGRESS", "QA_REVIEW", "COMPLETED", "CLOSED"}
    checks = {
        "incoming_order": has_order,
        "technical_scope": scope_ready,
        "material_requirements": material_defined,
        "budget": budget_ready,
        "stock_availability": stock_ready,
        "verified": verified,
        "material_reserved": reservation_ready,
        "project_started": started,
    }
    missing = [key for key in ["incoming_order", "technical_scope", "material_requirements", "budget", "stock_availability"] if not checks[key]]
    from apps.projects.models import ProjectReadinessCheck
    messages = {"incoming_order": "Sales order atau project charter wajib tersedia.", "technical_scope": "Technical brief dan requirement wajib tersedia.", "material_requirements": "Material/resource requirement belum didefinisikan.", "budget": "Baseline budget wajib lebih besar dari nol.", "stock_availability": "Stok tidak cukup; buat resource/procurement request."}
    now = timezone.now()
    for key in ["incoming_order", "technical_scope", "material_requirements", "budget", "stock_availability"]:
        ProjectReadinessCheck.objects.update_or_create(project=project, check_type=key, defaults={"status": "PASSED" if checks[key] else "FAILED", "message": "Siap." if checks[key] else messages[key], "blocking": not checks[key], "checked_at": now, "details_json": {"shortages": shortages} if key == "stock_availability" else {}})
    return {
        "project": model_payload(project),
        "flow_status": lifecycle,
        "checks": checks,
        "can_verify": not missing,
        "can_reserve": verified and stock_ready,
        "can_start": verified and reservation_ready,
        "missing_prerequisites": missing,
        "budget_amount": str(budget_total),
        "materials": material_rows,
        "shortages": shortages,
    }


def transition_project(project, to_status, action, user, payload=None, note=""):
    from apps.projects.models import ProjectLifecycleEvent
    before = project.lifecycle_status or "DRAFT"
    project.lifecycle_status = to_status
    project.save(update_fields=["lifecycle_status"])
    ProjectLifecycleEvent.objects.create(project=project, from_status=before, to_status=to_status, action=action, actor=user, note=note, payload_json=payload or {})


class ProjectFlowStatusView(ERPCommandView):
    @command_schema(tag="Commands â€” Projects", summary="Get project flow status", request_serializer=None)
    def get(self, request, id):
        from apps.projects.models import Project, ProjectDispatch

        return self.ok(project_flow_data(get_object_or_404(Project, pk=id)))


class ProjectVerifyView(ERPCommandView):
    @command_schema(tag="Commands â€” Projects", summary="Verify project prerequisites", request_serializer=None)
    @transaction.atomic
    def post(self, request, id):
        from apps.projects.models import Project, Requirement, ResourceRequest, ResourceRequestLine, TechnicalBrief

        project = get_object_or_404(Project.objects.select_for_update(), pk=id)
        result = project_flow_data(project)
        if not result["can_verify"]:
            project.status = "VERIFICATION_FAILED"
            project.save(update_fields=["status"])
            if result["shortages"]:
                from apps.projects.workflow_services import ensure_shortage_procurement
                resource_request = ResourceRequest.objects.filter(project=project, status="PENDING_STOCK").first()
                if resource_request is None:
                    resource_request = ResourceRequest.objects.create(
                        document=create_business_document(source=project, document_type="RESOURCE_REQUEST", prefix="RR", user=request.user),
                        project=project,
                        requested_by=request.user,
                        request_date=timezone.localdate(),
                        required_date=project.planned_start_date,
                        request_type="MATERIAL",
                        priority="HIGH",
                        approval_status="PENDING",
                        status="PENDING_STOCK",
                    )
                for shortage in result["shortages"]:
                    if shortage["product_id"]:
                        ResourceRequestLine.objects.update_or_create(
                            resource_request=resource_request,
                            product_id=shortage["product_id"],
                            defaults={"resource_type": "MATERIAL", "requested_quantity": dec(shortage["shortage_quantity"])},
                        )
                ensure_shortage_procurement(project, result["shortages"], request.user)
            result = project_flow_data(project)
            return Response(
                {"success": False, "errors": {"code": "PROJECT_PREREQUISITES_MISSING", "message": "Project belum dapat diverifikasi.", **result}},
                status=status.HTTP_400_BAD_REQUEST,
            )
        TechnicalBrief.objects.filter(project=project).update(approval_status="APPROVED", status="APPROVED")
        Requirement.objects.filter(technical_brief__project=project).update(status="APPROVED")
        project.status = "VERIFIED"
        project.verified_at = timezone.now()
        project.verified_by = request.user
        project.save(update_fields=["status", "verified_at", "verified_by"])
        transition_project(project, "VERIFIED", "VERIFY", request.user)
        update_document(project.document, status_value="APPROVED", user=request.user)
        create_audit_event(request=request, instance=project, event_type="VERIFY", after=snapshot(project))
        return self.ok(project_flow_data(project), "Project berhasil diverifikasi.")


class ProjectReserveMaterialsView(ERPCommandView):
    @command_schema(tag="Commands â€” Projects", summary="Reserve project materials", request_serializer=None)
    @transaction.atomic
    def post(self, request, id):
        from apps.inventory.models import StockBalance, StockReservation
        from apps.projects.models import MaterialRequirement, Project
        from apps.sales.models import DemandSupplyLink, OrderLine

        project = get_object_or_404(Project.objects.select_for_update(), pk=id)
        if project.status not in {"VERIFIED", "MATERIAL_RESERVED"}:
            raise ValidationError({"status": "Project harus VERIFIED sebelum material di-reserve."})
        # Lock only material requirement rows. PostgreSQL rejects FOR UPDATE
        # when select_related adds an outer join for nullable product/warehouse.
        materials = list(MaterialRequirement.objects.select_for_update().filter(project=project))
        if not materials and project.source_type != "FUNDING_REQUEST":
            raise ValidationError({"materials": "Material requirement belum tersedia."})
        if project_flow_data(project)["shortages"]:
            raise ValidationError({"code": "PROJECT_STOCK_INSUFFICIENT", "materials": project_flow_data(project)["shortages"]})
        created = []
        for item in materials:
            remaining = max(ZERO, (item.required_quantity or ZERO) - (item.reserved_quantity or ZERO))
            if remaining <= ZERO:
                continue
            balances = StockBalance.objects.select_for_update().filter(
                company=project.company,
                product=item.product,
                warehouse_location__warehouse=item.warehouse,
                warehouse_location__active=True,
                warehouse_location__quality_hold=False,
                available_quantity__gt=ZERO,
            ).order_by("warehouse_location_id")
            order_line = OrderLine.objects.filter(sales_order=project.sales_order, project=project, product=item.product).first()
            for balance in balances:
                quantity = min(remaining, balance.available_quantity or ZERO)
                if quantity <= ZERO:
                    continue
                reservation = StockReservation.objects.create(
                    product=item.product,
                    warehouse_location=balance.warehouse_location,
                    project=project,
                    sales_order_line=order_line,
                    reserved_quantity=quantity,
                    required_date=item.required_date,
                    status="ACTIVE",
                )
                balance.reserved_quantity = (balance.reserved_quantity or ZERO) + quantity
                balance.available_quantity = (balance.on_hand_quantity or ZERO) - balance.reserved_quantity
                balance.save(update_fields=["reserved_quantity", "available_quantity"])
                if order_line:
                    DemandSupplyLink.objects.filter(sales_order_line=order_line, project=project).update(
                        stock_reservation=reservation,
                        allocated_quantity=Coalesce(F("allocated_quantity"), ZERO) + quantity,
                        status="RESERVED",
                    )
                item.reserved_quantity = (item.reserved_quantity or ZERO) + quantity
                remaining -= quantity
                created.append(model_payload(reservation))
                if remaining <= ZERO:
                    break
            item.status = "RESERVED" if remaining <= ZERO else "PARTIALLY_RESERVED"
            item.save(update_fields=["reserved_quantity", "status"])
            if remaining > ZERO:
                raise ValidationError({"code": "PROJECT_STOCK_CHANGED", "material_requirement_id": str(item.id), "remaining_quantity": str(remaining)})
        project.status = "MATERIAL_RESERVED"
        project.save(update_fields=["status"])
        transition_project(project, "RESOURCE_RESERVED", "RESERVE_MATERIALS", request.user, {"reservation_count": len(created)})
        create_audit_event(request=request, instance=project, event_type="RESERVE_MATERIALS", after={"reservation_count": len(created), **snapshot(project)})
        return self.ok({**project_flow_data(project), "reservations": created}, "Material project berhasil di-reserve.")


class ProjectStartView(ERPCommandView):
    @command_schema(
        tag="Commands — Projects",
        summary="Start project",
        request_serializer=None,
        success_status=status.HTTP_200_OK,
        parameters=None,
    )
    @transaction.atomic
    def post(self, request, id):
        from apps.projects.models import Project, ProjectDispatch

        from apps.core.models import Notification

        project = get_object_or_404(Project.objects.select_for_update(), pk=id)
        flow = project_flow_data(project)
        if project.lifecycle_status == "IN_PROGRESS" or project.status == "IN_PROGRESS":
            return self.ok(flow, "Project sudah berjalan.")
        if not flow["can_start"] or project.status != "MATERIAL_RESERVED":
            raise ValidationError({
                "code": "PROJECT_START_PREREQUISITES_MISSING",
                "message": "Project harus VERIFIED dan seluruh material harus di-reserve sebelum dimulai.",
                "flow": flow,
            })
        project.status = "IN_PROGRESS"
        project.started_at = timezone.now()
        if not project.actual_start_date:
            project.actual_start_date = timezone.localdate()
        project.save(update_fields=["status", "actual_start_date", "started_at"])
        transition_project(project, "IN_PROGRESS", "START", request.user)
        from apps.projects.workflow_services import ensure_project_start_handoffs
        production_orders = ensure_project_start_handoffs(project, request.user)
        update_document(project.document, status_value="APPROVED", user=request.user)
        dispatches = []
        for target, title, action_url in [
            ("FINANCE", "Project dimulai: siapkan kontrol biaya", "/api/v1/projects/budget-lines/"),
            ("WAREHOUSE", "Project dimulai: siapkan material reserved", "/api/v1/inventory/stock-reservations/"),
            ("PRODUCTION", "Project dimulai: siapkan work order", "/api/v1/manufacturing/work-orders/"),
        ]:
            notification, _ = Notification.objects.get_or_create(
                source_document=project.document,
                notification_type=f"PROJECT_START_{target}",
                defaults={
                    "tenant": project.tenant,
                    "company": project.company,
                    "title": title,
                    "message": f"{project.project_code} - {project.project_name}",
                    "action_url": action_url,
                    "priority": "HIGH",
                    "created_at": timezone.now(),
                },
            )
            ProjectDispatch.objects.update_or_create(
                project=project,
                target_department=target,
                dispatch_type="PROJECT_START_REPORT" if target == "FINANCE" else "PROJECT_START_INSTRUCTION",
                defaults={
                    "subject": title,
                    "payload_json": {
                        "project_code": project.project_code,
                        "project_name": project.project_name,
                        "material_requirements": [
                            {
                                "id": str(row.id),
                                "product_id": str(row.product_id) if row.product_id else None,
                                "required_quantity": str(row.required_quantity or 0),
                                "reserved_quantity": str(row.reserved_quantity or 0),
                                "status": row.status,
                            }
                            for row in project.projects_materialrequirement_project_set.all()
                        ],
                        "budget_amount": str(project.budget_amount or 0),
                    },
                    "status": "SENT",
                    "sent_by": request.user,
                },
            )
            dispatches.append(model_payload(notification))
        create_audit_event(request=request, instance=project, event_type="START", after=snapshot(project))
        return self.ok({**project_flow_data(project), "dispatches": dispatches, "production_order_ids": [str(item.id) for item in production_orders]}, "Project berhasil dimulai dan instruksi dikirim.")


class ProjectCloseView(ERPCommandView):
    @command_schema(tag="Commands â€” Projects", summary="Close completed project", request_serializer=None)
    @transaction.atomic
    def post(self, request, id):
        from apps.projects.models import AcceptanceCriteria, Issue, Project, ProjectLifecycleEvent
        project = get_object_or_404(Project.objects.select_for_update(), pk=id)
        blockers = []
        if dec(project.progress_percent) < Decimal("100"):
            blockers.append("progress_not_100")
        if Issue.objects.filter(project=project).exclude(status__in=["CLOSED", "RESOLVED"]).exists():
            blockers.append("open_issues")
        criteria = AcceptanceCriteria.objects.filter(requirement__technical_brief__project=project)
        if criteria.exists() and criteria.filter(passed=False).exists():
            blockers.append("acceptance_criteria_failed")
        if blockers:
            raise ValidationError({"code": "PROJECT_CLOSE_PREREQUISITES_MISSING", "blockers": blockers})
        project.status = "CLOSED"
        project.lifecycle_status = "CLOSED"
        project.health_status = "HEALTHY"
        project.actual_end_date = timezone.localdate()
        project.closed_at = timezone.now()
        project.closed_by = request.user
        project.save(update_fields=["status", "lifecycle_status", "health_status", "actual_end_date", "closed_at", "closed_by"])
        ProjectLifecycleEvent.objects.create(project=project, from_status="COMPLETED", to_status="CLOSED", action="CLOSE", actor=request.user)
        from apps.finance.workflow_services import collect_project_operational_costs, ensure_completion_billing_proposal
        costs = collect_project_operational_costs(project, request.user)
        proposal, proposal_created = ensure_completion_billing_proposal(project, request.user)
        payload = model_payload(project)
        payload.update({"captured_cost_count": len(costs), "billing_proposal_id": str(proposal.id), "billing_proposal_created": proposal_created})
        return self.ok(payload, "Project ditutup; biaya dikumpulkan dan final billing dikirim ke Finance.")


class ProjectHealthView(ERPCommandView):
    @command_schema(
        tag="Commands — Projects",
        summary="Calculate project health",
        request_serializer=None,
        success_status=status.HTTP_200_OK,
        parameters=None,
    )
    @transaction.atomic
    def get(self, request, id):
        from apps.projects.models import HealthSnapshot, Issue, Project, Risk, Task

        project = get_object_or_404(Project, pk=id)
        now = timezone.now()
        total_tasks = Task.objects.filter(project=project).count()
        overdue = Task.objects.filter(project=project, planned_end_at__lt=now).exclude(status__in=["DONE", "COMPLETED", "CANCELLED"]).count()
        schedule_score = Decimal("100") if total_tasks == 0 else max(ZERO, Decimal("100") - Decimal(overdue * 100) / Decimal(total_tasks))
        costs = project_cost_data(project)
        budget = dec(costs["budget_amount"])
        actual = dec(costs["actual_cost"])
        cost_score = Decimal("100") if budget <= 0 or actual <= budget else max(ZERO, Decimal("100") - ((actual - budget) / budget * Decimal("100")))
        open_risks = Risk.objects.filter(project=project).exclude(status__in=["CLOSED", "MITIGATED"]).count()
        open_issues = Issue.objects.filter(project=project).exclude(status__in=["CLOSED", "RESOLVED"]).count()
        risk_score = max(ZERO, Decimal("100") - Decimal(open_risks * 10 + open_issues * 10))
        quality_score = Decimal("100")
        resource_score = Decimal("100")
        overall = (schedule_score + cost_score + quality_score + resource_score + risk_score) / Decimal("5")
        health_status = "HEALTHY" if overall >= 80 else "WARNING" if overall >= 60 else "CRITICAL"
        result = HealthSnapshot.objects.create(
            project=project,
            snapshot_at=now,
            schedule_score=schedule_score,
            cost_score=cost_score,
            quality_score=quality_score,
            resource_score=resource_score,
            risk_score=risk_score,
            overall_score=overall,
            health_status=health_status,
            explanation_json={"overdue_tasks": overdue, "open_risks": open_risks, "open_issues": open_issues, "costs": {k: str(v) for k, v in costs.items()}},
        )
        return self.ok(model_payload(result))


class ProjectCostsView(ERPCommandView):
    @command_schema(
        tag="Commands — Projects",
        summary="Get project cost summary",
        request_serializer=None,
        success_status=status.HTTP_200_OK,
        parameters=None,
    )
    def get(self, request, id):
        from apps.projects.models import Project

        project = get_object_or_404(Project, pk=id)
        return self.ok({key: str(value) for key, value in project_cost_data(project).items()})


class ProjectProgressView(ERPCommandView):
    @command_schema(
        tag="Commands — Projects",
        summary="Record project progress",
        request_serializer=inline_serializer(
            name="ProjectProgressCommandRequest",
            fields={
                "work_order_id": optional_uuid_field(),
                "planned_progress_percent": optional_decimal_field(),
                "actual_progress_percent": optional_decimal_field(),
                "earned_value": optional_decimal_field(),
                "planned_value": optional_decimal_field(),
                "actual_cost": optional_decimal_field(),
                "progress_status": serializers.CharField(required=False, allow_blank=True)
            },
        ),
        success_status=status.HTTP_201_CREATED,
        parameters=None,
    )
    @transaction.atomic
    def post(self, request, id):
        from apps.projects.models import ProgressSnapshot, Project

        project = get_object_or_404(Project, pk=id)
        actual = dec(request.data.get("actual_progress_percent", project.progress_percent or ZERO))
        planned = dec(request.data.get("planned_progress_percent", actual))
        result = ProgressSnapshot.objects.create(
            project=project,
            work_order_id=request.data.get("work_order_id"),
            snapshot_at=timezone.now(),
            planned_progress_percent=planned,
            actual_progress_percent=actual,
            earned_value=dec(request.data.get("earned_value")),
            planned_value=dec(request.data.get("planned_value")),
            actual_cost=dec(request.data.get("actual_cost", project_cost_data(project)["actual_cost"])),
            progress_status=str(request.data.get("progress_status", "ON_TRACK" if actual >= planned else "BEHIND")),
        )
        project.progress_percent = actual
        project.save(update_fields=["progress_percent"])
        return self.ok(model_payload(result), "Progress snapshot berhasil dicatat.", status.HTTP_201_CREATED)


class ProjectRecalculateProgressView(ERPCommandView):
    @command_schema(tag="Commands â€” Projects", summary="Recalculate weighted project progress", request_serializer=None)
    @transaction.atomic
    def post(self, request, id):
        from apps.projects.models import Project, ProjectLifecycleEvent, Task
        project = get_object_or_404(Project.objects.select_for_update(), pk=id)
        tasks = list(Task.objects.filter(project=project))
        if not tasks:
            raise ValidationError({"tasks": "Minimal satu task diperlukan untuk menghitung progress."})
        explicit = sum((dec(task.weight_percent) for task in tasks), ZERO)
        if explicit > Decimal("100.0001"):
            raise ValidationError({"weight_percent": "Total bobot task tidak boleh melebihi 100%."})
        fallback = Decimal("100") / Decimal(len(tasks)) if explicit <= ZERO else ZERO
        weighted = sum(((dec(task.weight_percent) if explicit > ZERO else fallback) * dec(task.progress_percent) / Decimal("100") for task in tasks), ZERO)
        denominator = explicit if explicit > ZERO else Decimal("100")
        progress = min(Decimal("100"), weighted * Decimal("100") / denominator)
        before = project.progress_percent or ZERO
        project.progress_percent = progress
        if progress >= Decimal("100") and project.lifecycle_status == "IN_PROGRESS":
            project.lifecycle_status = "COMPLETED"
            project.status = "COMPLETED"
        project.save(update_fields=["progress_percent", "lifecycle_status", "status"])
        ProjectLifecycleEvent.objects.create(project=project, from_status=project.lifecycle_status, to_status=project.lifecycle_status, action="RECALCULATE_PROGRESS", actor=request.user, payload_json={"before": str(before), "after": str(progress), "task_count": len(tasks)})
        return self.ok({"project": model_payload(project), "task_count": len(tasks), "weight_total": str(explicit or Decimal("100")), "progress_percent": str(progress)}, "Progress project dihitung ulang dari task.")


class ProjectTaskMoveView(ERPCommandView):
    @command_schema(
        tag="Commands — Projects",
        summary="Move task between board columns",
        request_serializer=inline_serializer(
            name="ProjectTaskMoveCommandRequest",
            fields={
                "board_column_id": optional_uuid_field(required=True),
                "position_order": optional_decimal_field()
            },
        ),
        success_status=status.HTTP_200_OK,
        parameters=None,
    )
    @transaction.atomic
    def post(self, request, id):
        from apps.projects.models import BoardColumn, Task, TaskBoardPosition

        task = get_object_or_404(Task, pk=id)
        column = get_object_or_404(BoardColumn, pk=request.data.get("board_column_id"))
        position, _ = TaskBoardPosition.objects.update_or_create(
            task=task,
            defaults={
                "board_column": column,
                "position_order": dec(request.data.get("position_order", 1)),
                "moved_at": timezone.now(),
                "moved_by": request.user,
            },
        )
        if column.mapped_task_status:
            task.status = column.mapped_task_status
            task.save(update_fields=["status"])
        return self.ok(model_payload(position), "Task berhasil dipindahkan.")


class TimesheetApproveView(ERPCommandView):
    @command_schema(
        tag="Commands — Projects",
        summary="Approve timesheet",
        request_serializer=None,
        success_status=status.HTTP_200_OK,
        parameters=None,
    )
    @transaction.atomic
    def post(self, request, id):
        from apps.projects.models import Timesheet

        timesheet = get_object_or_404(Timesheet, pk=id)
        timesheet.approval_status = "APPROVED"
        if timesheet.amount is None:
            timesheet.amount = (timesheet.hours or ZERO) * (timesheet.hourly_rate or ZERO)
        timesheet.save(update_fields=["approval_status", "amount"])
        return self.ok(model_payload(timesheet), "Timesheet berhasil disetujui.")


# ---------------------------------------------------------------------------
# Procurement
# ---------------------------------------------------------------------------


class PurchaseRequisitionConvertToRFQView(ERPCommandView):
    @command_schema(
        tag="Commands — Procurement",
        summary="Convert purchase requisition to RFQ",
        request_serializer=inline_serializer(
            name="PurchaseRequisitionConvertToRFQCommandRequest",
            fields={
                "closing_date": serializers.DateField(required=False, allow_null=True)
            },
        ),
        success_status=status.HTTP_201_CREATED,
        parameters=None,
    )
    @transaction.atomic
    def post(self, request, id):
        from apps.procurement.models import PurchaseRequisition, RFQ

        requisition = get_object_or_404(PurchaseRequisition, pk=id)
        existing = RFQ.objects.filter(requisition=requisition).first()
        if existing:
            return self.ok(model_payload(existing), "RFQ sudah tersedia.")
        document = create_business_document(source=requisition, document_type="RFQ", prefix="RFQ", user=request.user)
        rfq = RFQ.objects.create(
            document=document,
            requisition=requisition,
            issue_date=timezone.localdate(),
            closing_date=request.data.get("closing_date"),
            status="OPEN",
        )
        requisition.status = "CONVERTED_TO_RFQ"
        requisition.save(update_fields=["status"])
        return self.ok(model_payload(rfq), "RFQ berhasil dibuat.", status.HTTP_201_CREATED)


class SupplierQuotationSelectView(ERPCommandView):
    @command_schema(
        tag="Commands — Procurement",
        summary="Select supplier quotation",
        request_serializer=None,
        success_status=status.HTTP_200_OK,
        parameters=None,
    )
    @transaction.atomic
    def post(self, request, id):
        from apps.procurement.models import SupplierQuotation

        quotation = get_object_or_404(SupplierQuotation, pk=id)
        SupplierQuotation.objects.filter(rfq=quotation.rfq).exclude(pk=quotation.pk).update(evaluation_status="NOT_SELECTED")
        quotation.evaluation_status = "SELECTED"
        quotation.save(update_fields=["evaluation_status"])
        return self.ok(model_payload(quotation), "Supplier quotation berhasil dipilih.")


class PurchaseOrderSendView(ERPCommandView):
    @command_schema(
        tag="Commands — Procurement",
        summary="Issue purchase order",
        request_serializer=None,
        success_status=status.HTTP_200_OK,
        parameters=None,
    )
    @transaction.atomic
    def post(self, request, id):
        from apps.procurement.models import PurchaseOrder

        purchase_order = get_object_or_404(PurchaseOrder, pk=id)
        purchase_order.status = "SENT"
        purchase_order.save(update_fields=["status"])
        update_document(purchase_order.document, status_value="APPROVED", user=request.user)
        return self.ok(model_payload(purchase_order), "Purchase order berhasil diterbitkan.")


class GoodsReceiptInspectView(ERPCommandView):
    @command_schema(
        tag="Commands — Procurement",
        summary="Start goods receipt inspection",
        request_serializer=None,
        success_status=status.HTTP_200_OK,
        parameters=None,
    )
    @transaction.atomic
    def post(self, request, id):
        from apps.procurement.models import GoodsReceipt, GoodsReceiptLine
        from apps.quality.models import Inspection

        receipt = get_object_or_404(GoodsReceipt, pk=id)
        receipt.inspection_status = "IN_PROGRESS"
        receipt.save(update_fields=["inspection_status"])
        inspections = []
        for line in GoodsReceiptLine.objects.filter(goods_receipt=receipt):
            inspection = Inspection.objects.filter(goods_receipt=receipt, product=line.product, lot=line.lot).first()
            if not inspection:
                document = create_business_document(source=receipt, document_type="QA_INSPECTION", prefix="QI", user=request.user)
                inspection = Inspection.objects.create(
                    document=document,
                    product=line.product,
                    lot=line.lot,
                    goods_receipt=receipt,
                    inspector_user=request.user,
                    inspection_type="INCOMING",
                    quantity_inspected=line.received_quantity,
                    quantity_accepted=ZERO,
                    quantity_rejected=ZERO,
                    inspection_at=timezone.now(),
                    result="PENDING",
                    status="IN_PROGRESS",
                )
            inspections.append(model_payload(inspection))
        return self.ok(inspections, "Incoming inspection berhasil dimulai.")


class PurchaseOrderThreeWayMatchView(ERPCommandView):
    @command_schema(
        tag="Commands — Procurement",
        summary="Run purchase order three-way match",
        request_serializer=inline_serializer(
            name="PurchaseOrderThreeWayMatchRequest",
            fields={"supplier_invoice_id": serializers.UUIDField(required=False)},
        ),
        success_status=status.HTTP_200_OK,
        parameters=None,
    )
    @transaction.atomic
    def post(self, request, id):
        from apps.finance.models import BillingDocument, BillingDocumentLine
        from apps.procurement.models import GoodsReceipt, GoodsReceiptLine, PurchaseOrder, PurchaseOrderLine, ThreeWayMatch

        purchase_order = get_object_or_404(PurchaseOrder.objects.select_for_update(), pk=id)
        receipts = GoodsReceipt.objects.filter(purchase_order=purchase_order).order_by("-receipt_date", "-id")
        invoice_id = request.data.get("supplier_invoice_id")
        invoices = BillingDocument.objects.filter(
            purchase_order=purchase_order,
            billing_type__in={"SUPPLIER_BILL", "VENDOR_INVOICE"},
        )
        invoice = (
            invoices.filter(pk=invoice_id).first()
            if invoice_id
            else invoices.order_by("-invoice_date", "-id").first()
        )
        missing_documents = []
        if not receipts.exists():
            missing_documents.append("goods_receipt")
        if invoice is None:
            missing_documents.append("supplier_invoice")
        if missing_documents:
            raise ValidationError({
                "code": "THREE_WAY_MATCH_PREREQUISITES_MISSING",
                "match": "Three-way match belum dapat dijalankan.",
                "missing_documents": missing_documents,
                "purchase_order_id": str(purchase_order.id),
            })
        if invoice.party_id and purchase_order.supplier_party_id and invoice.party_id != purchase_order.supplier_party_id:
            raise ValidationError({"supplier_invoice": "Supplier invoice harus berasal dari supplier pada purchase order yang sama."})
        if invoice.currency_id and purchase_order.currency_id and invoice.currency_id != purchase_order.currency_id:
            raise ValidationError({"supplier_invoice": "Mata uang supplier invoice harus sama dengan purchase order."})

        ordered = PurchaseOrderLine.objects.filter(purchase_order=purchase_order).aggregate(v=Coalesce(Sum("ordered_quantity"), ZERO))["v"]
        received = GoodsReceiptLine.objects.filter(goods_receipt__in=receipts).aggregate(
            v=Coalesce(Sum(Coalesce("accepted_quantity", "received_quantity", ZERO)), ZERO)
        )["v"]
        invoice_subtotal = BillingDocumentLine.objects.filter(billing_document=invoice).aggregate(
            v=Coalesce(Sum("line_total"), ZERO)
        )["v"]
        quantity_variance = received - ordered
        price_variance = invoice_subtotal - (purchase_order.subtotal or ZERO)
        tax_variance = (invoice.tax_amount or ZERO) - (purchase_order.tax_amount or ZERO)
        match_status = "MATCHED" if quantity_variance == 0 and price_variance == 0 and tax_variance == 0 else "VARIANCE"
        match, _ = ThreeWayMatch.objects.update_or_create(
            purchase_order=purchase_order,
            goods_receipt=receipts.first(),
            supplier_invoice=invoice,
            defaults={
                "quantity_variance": quantity_variance,
                "price_variance": price_variance,
                "tax_variance": tax_variance,
                "match_status": match_status,
                "reviewed_by": request.user,
                "reviewed_at": timezone.now(),
            },
        )
        from apps.finance.models import InvoiceVarianceCase
        if match_status == "VARIANCE":
            kinds = [name for name, value in (("QUANTITY", quantity_variance), ("PRICE", price_variance), ("TAX", tax_variance)) if value != 0]
            InvoiceVarianceCase.objects.update_or_create(
                three_way_match=match,
                defaults={"company": invoice.company, "billing_document": invoice, "variance_type": kinds[0] if len(kinds) == 1 else "MIXED", "total_variance": abs(quantity_variance) + abs(price_variance) + abs(tax_variance), "status": "OPEN"},
            )
        else:
            InvoiceVarianceCase.objects.filter(three_way_match=match, status="OPEN").update(status="AUTO_RESOLVED", resolution="Three-way match is now balanced", resolved_by=request.user, resolved_at=timezone.now())
        return self.ok(model_payload(match), "Three-way match selesai.")


# ---------------------------------------------------------------------------
# Inventory
# ---------------------------------------------------------------------------


def apply_stock_delta(*, company, product, location, lot=None, serial_number=None, quantity_delta=ZERO, value_delta=ZERO, source_document=None, source_line=None, project=None, production_order=None, user=None):
    from apps.inventory.models import StockBalance, StockLedgerEntry

    balance, _ = StockBalance.objects.select_for_update().get_or_create(
        company=company,
        product=product,
        warehouse_location=location,
        lot=lot,
        serial_number=serial_number,
        defaults={"on_hand_quantity": ZERO, "reserved_quantity": ZERO, "available_quantity": ZERO, "inventory_value": ZERO},
    )
    new_qty = (balance.on_hand_quantity or ZERO) + quantity_delta
    new_value = (balance.inventory_value or ZERO) + value_delta
    if new_qty < 0:
        raise ValidationError({"stock": f"Stok {product} di lokasi {location} tidak mencukupi."})
    unit_cost = ZERO if quantity_delta == 0 else abs(value_delta / quantity_delta)
    ledger = StockLedgerEntry.objects.create(
        tenant_id=company.tenant_id if company else None,
        company=company,
        product=product,
        warehouse_location=location,
        lot=lot,
        serial_number=serial_number,
        source_document=source_document,
        source_line=source_line,
        project=project,
        production_order=production_order,
        posting_at=timezone.now(),
        quantity_delta=quantity_delta,
        value_delta=value_delta,
        unit_cost=unit_cost,
        balance_quantity=new_qty,
        balance_value=new_value,
    )
    balance.on_hand_quantity = new_qty
    balance.inventory_value = new_value
    balance.available_quantity = new_qty - (balance.reserved_quantity or ZERO)
    balance.last_ledger_entry = ledger
    balance.save(update_fields=["on_hand_quantity", "inventory_value", "available_quantity", "last_ledger_entry"])
    return ledger


class StockMoveCompleteView(ERPCommandView):
    @command_schema(
        tag="Commands — Inventory",
        summary="Complete stock movement",
        request_serializer=None,
        success_status=status.HTTP_200_OK,
        parameters=None,
    )
    @transaction.atomic
    def post(self, request, id):
        from apps.inventory.models import StockMove, StockMoveLine

        move = get_object_or_404(StockMove.objects.select_for_update(), pk=id)
        if move.status == "COMPLETED":
            return self.ok(model_payload(move), "Stock move sudah selesai.")
        if not move.company:
            raise ValidationError({"company": "Stock move wajib memiliki company."})
        ledgers = []
        for line in StockMoveLine.objects.filter(stock_move=move):
            quantity = line.quantity or ZERO
            value = line.total_value if line.total_value is not None else quantity * (line.unit_cost or ZERO)
            if move.source_location:
                ledgers.append(
                    apply_stock_delta(
                        company=move.company,
                        product=line.product,
                        location=move.source_location,
                        lot=line.lot,
                        serial_number=line.serial_number,
                        quantity_delta=-quantity,
                        value_delta=-value,
                        source_document=move.document,
                        source_line=move.document,
                        project=move.project,
                        production_order=move.production_order,
                        user=request.user,
                    )
                )
            if move.destination_location:
                ledgers.append(
                    apply_stock_delta(
                        company=move.company,
                        product=line.product,
                        location=move.destination_location,
                        lot=line.lot,
                        serial_number=line.serial_number,
                        quantity_delta=quantity,
                        value_delta=value,
                        source_document=move.document,
                        source_line=move.document,
                        project=move.project,
                        production_order=move.production_order,
                        user=request.user,
                    )
                )
        move.status = "COMPLETED"
        move.completed_at = timezone.now()
        move.save(update_fields=["status", "completed_at"])
        update_document(move.document, status_value="POSTED", user=request.user, posting=True)
        return self.ok({"stock_move": model_payload(move), "ledger_entries": [model_payload(item) for item in ledgers]}, "Stock movement berhasil diposting.")


class StockReservationReleaseView(ERPCommandView):
    @command_schema(
        tag="Commands — Inventory",
        summary="Release stock reservation",
        request_serializer=None,
        success_status=status.HTTP_200_OK,
        parameters=None,
    )
    @transaction.atomic
    def post(self, request, id):
        from apps.inventory.models import StockBalance, StockReservation

        reservation = get_object_or_404(StockReservation.objects.select_for_update(), pk=id)
        quantity = reservation.reserved_quantity or ZERO
        balance = StockBalance.objects.filter(
            product=reservation.product,
            warehouse_location=reservation.warehouse_location,
        ).select_for_update().first()
        if balance:
            balance.reserved_quantity = max(ZERO, (balance.reserved_quantity or ZERO) - quantity)
            balance.available_quantity = (balance.on_hand_quantity or ZERO) - balance.reserved_quantity
            balance.save(update_fields=["reserved_quantity", "available_quantity"])
        reservation.reserved_quantity = ZERO
        reservation.status = "RELEASED"
        reservation.save(update_fields=["reserved_quantity", "status"])
        return self.ok(model_payload(reservation), "Reservasi stok berhasil dilepas.")


class StockCountPostAdjustmentView(ERPCommandView):
    @command_schema(
        tag="Commands — Inventory",
        summary="Post stock-count adjustment",
        request_serializer=None,
        success_status=status.HTTP_200_OK,
        parameters=None,
    )
    @transaction.atomic
    def post(self, request, id):
        from apps.inventory.models import StockCount, StockCountLine

        stock_count = get_object_or_404(StockCount, pk=id)
        company = stock_count.warehouse.company if stock_count.warehouse else None
        if not company:
            raise ValidationError({"warehouse": "Warehouse harus memiliki company."})
        entries = []
        for line in StockCountLine.objects.filter(stock_count=stock_count):
            variance = (line.counted_quantity or ZERO) - (line.system_quantity or ZERO)
            line.variance_quantity = variance
            line.save(update_fields=["variance_quantity"])
            if variance:
                entries.append(
                    apply_stock_delta(
                        company=company,
                        product=line.product,
                        location=line.location,
                        lot=line.lot,
                        quantity_delta=variance,
                        value_delta=line.variance_value or ZERO,
                        source_document=stock_count.document,
                        user=request.user,
                    )
                )
        stock_count.status = "POSTED"
        stock_count.save(update_fields=["status"])
        update_document(stock_count.document, status_value="POSTED", user=request.user, posting=True)
        return self.ok({"stock_count": model_payload(stock_count), "ledger_entries": [model_payload(item) for item in entries]}, "Adjustment stock count berhasil diposting.")


# ---------------------------------------------------------------------------
# Manufacturing
# ---------------------------------------------------------------------------


class ProductionOrderReleaseView(ERPCommandView):
    @command_schema(
        tag="Commands — Manufacturing",
        summary="Release production order",
        request_serializer=None,
        success_status=status.HTTP_200_OK,
        parameters=None,
    )
    @transaction.atomic
    def post(self, request, id):
        from apps.manufacturing.models import ProductionMaterial, ProductionOrder

        order = get_object_or_404(ProductionOrder, pk=id)
        shortages = ProductionMaterial.objects.filter(production_order=order).filter(Q(reserved_quantity__lt=F("required_quantity")) | Q(reserved_quantity__isnull=True)).count()
        order.status = "RELEASED"
        order.material_status = "SHORTAGE" if shortages else "READY"
        order.save(update_fields=["status", "material_status"])
        update_document(order.document, status_value="APPROVED", user=request.user)
        return self.ok({"production_order": model_payload(order), "material_shortage_count": shortages}, "Production order berhasil dirilis.")


class ProductionOrderIssueMaterialsView(ERPCommandView):
    @command_schema(
        tag="Commands — Manufacturing",
        summary="Issue production materials",
        request_serializer=inline_serializer(
            name="ProductionOrderIssueMaterialsCommandRequest",
            fields={
                "source_locations": serializers.JSONField(required=False, help_text="Mapping material/product UUID ke warehouse location UUID."),
                "quantities": serializers.JSONField(required=False, help_text="Mapping production material UUID ke quantity issue.")
            },
        ),
        success_status=status.HTTP_200_OK,
        parameters=None,
    )
    @transaction.atomic
    def post(self, request, id):
        from apps.inventory.models import StockBalance
        from apps.manufacturing.models import ProductionMaterial, ProductionOrder
        from apps.master_data.models import WarehouseLocation

        order = get_object_or_404(ProductionOrder, pk=id)
        location_map = request.data.get("source_locations", {})
        entries = []
        for material in ProductionMaterial.objects.filter(production_order=order):
            quantity = dec(request.data.get("quantities", {}).get(str(material.id), material.reserved_quantity or material.required_quantity or ZERO))
            if quantity <= 0:
                continue
            location_id = location_map.get(str(material.id)) or location_map.get(str(material.product_id))
            if location_id:
                location = get_object_or_404(WarehouseLocation, pk=location_id)
                balance = StockBalance.objects.filter(company=order.company, product=material.product, warehouse_location=location).first()
                unit_cost = ZERO if not balance or not balance.on_hand_quantity else (balance.inventory_value or ZERO) / balance.on_hand_quantity
                entries.append(
                    apply_stock_delta(
                        company=order.company,
                        product=material.product,
                        location=location,
                        quantity_delta=-quantity,
                        value_delta=-(quantity * unit_cost),
                        source_document=order.document,
                        project=order.project,
                        production_order=order,
                        user=request.user,
                    )
                )
                material.actual_cost = (material.actual_cost or ZERO) + quantity * unit_cost
            material.issued_quantity = (material.issued_quantity or ZERO) + quantity
            material.save(update_fields=["issued_quantity", "actual_cost"])
        order.material_status = "ISSUED"
        if not order.actual_start_at:
            order.actual_start_at = timezone.now()
        order.status = "IN_PROGRESS"
        order.save(update_fields=["material_status", "actual_start_at", "status"])
        return self.ok({"production_order": model_payload(order), "ledger_entries": [model_payload(item) for item in entries]}, "Material produksi berhasil di-issue.")


class WorkOrderStartView(ERPCommandView):
    @command_schema(
        tag="Commands — Manufacturing",
        summary="Start work order",
        request_serializer=None,
        success_status=status.HTTP_200_OK,
        parameters=None,
    )
    @transaction.atomic
    def post(self, request, id):
        from apps.manufacturing.models import WorkOrder

        work_order = get_object_or_404(WorkOrder, pk=id)
        work_order.status = "IN_PROGRESS"
        work_order.actual_start_at = work_order.actual_start_at or timezone.now()
        work_order.save(update_fields=["status", "actual_start_at"])
        return self.ok(model_payload(work_order), "Work order berhasil dimulai.")


class WorkOrderCompleteView(ERPCommandView):
    @command_schema(
        tag="Commands — Manufacturing",
        summary="Complete work order",
        request_serializer=inline_serializer(
            name="WorkOrderCompleteCommandRequest",
            fields={
                "completed_quantity": optional_decimal_field(),
                "rejected_quantity": optional_decimal_field()
            },
        ),
        success_status=status.HTTP_200_OK,
        parameters=None,
    )
    @transaction.atomic
    def post(self, request, id):
        from apps.manufacturing.models import WorkOrder

        work_order = get_object_or_404(WorkOrder, pk=id)
        work_order.completed_quantity = dec(request.data.get("completed_quantity", work_order.planned_quantity or ZERO))
        work_order.rejected_quantity = dec(request.data.get("rejected_quantity", work_order.rejected_quantity or ZERO))
        work_order.actual_end_at = timezone.now()
        work_order.status = "COMPLETED"
        work_order.save(update_fields=["completed_quantity", "rejected_quantity", "actual_end_at", "status"])
        update_document(work_order.document, status_value="COMPLETED", user=request.user)
        return self.ok(model_payload(work_order), "Work order berhasil diselesaikan.")


class ProductionOrderReceiveOutputView(ERPCommandView):
    @command_schema(
        tag="Commands — Manufacturing",
        summary="Receive production output",
        request_serializer=inline_serializer(
            name="ProductionOrderReceiveOutputCommandRequest",
            fields={
                "destination_location_id": optional_uuid_field(required=True),
                "lot_id": optional_uuid_field(),
                "output_quantity": optional_decimal_field(required=True),
                "unit_cost": optional_decimal_field(),
                "total_cost": optional_decimal_field()
            },
        ),
        success_status=status.HTTP_201_CREATED,
        parameters=None,
    )
    @transaction.atomic
    def post(self, request, id):
        from apps.manufacturing.models import ProductionOrder, ProductionOutput
        from apps.master_data.models import WarehouseLocation

        order = get_object_or_404(ProductionOrder, pk=id)
        quantity = dec(request.data.get("output_quantity"))
        if quantity <= 0:
            raise ValidationError({"output_quantity": "Harus lebih besar dari nol."})
        location = get_object_or_404(WarehouseLocation, pk=request.data.get("destination_location_id"))
        unit_cost = dec(request.data.get("unit_cost"))
        total_cost = dec(request.data.get("total_cost", quantity * unit_cost))
        output = ProductionOutput.objects.create(
            production_order=order,
            product=order.product,
            lot_id=request.data.get("lot_id"),
            output_quantity=quantity,
            unit_cost=unit_cost,
            total_cost=total_cost,
            destination_location=location,
            produced_at=timezone.now(),
        )
        ledger = apply_stock_delta(
            company=order.company,
            product=order.product,
            location=location,
            lot=output.lot,
            quantity_delta=quantity,
            value_delta=total_cost,
            source_document=order.document,
            project=order.project,
            production_order=order,
            user=request.user,
        )
        order.completed_quantity = (order.completed_quantity or ZERO) + quantity
        if order.completed_quantity >= (order.planned_quantity or ZERO):
            order.status = "COMPLETED"
            order.actual_end_at = timezone.now()
        order.save(update_fields=["completed_quantity", "status", "actual_end_at"])
        return self.ok({"output": model_payload(output), "ledger_entry": model_payload(ledger)}, "Production output berhasil diterima.", status.HTTP_201_CREATED)


# ---------------------------------------------------------------------------
# Quality
# ---------------------------------------------------------------------------


class InspectionCompleteView(ERPCommandView):
    @command_schema(
        tag="Commands — Quality",
        summary="Complete quality inspection",
        request_serializer=inline_serializer(
            name="InspectionCompleteCommandRequest",
            fields={
                "quantity_accepted": optional_decimal_field(),
                "quantity_rejected": optional_decimal_field(),
                "quantity_inspected": optional_decimal_field(),
                "result": serializers.CharField(required=False, allow_blank=True)
            },
        ),
        success_status=status.HTTP_200_OK,
        parameters=None,
    )
    @transaction.atomic
    def post(self, request, id):
        from apps.quality.models import Inspection

        inspection = get_object_or_404(Inspection, pk=id)
        inspection.quantity_accepted = dec(request.data.get("quantity_accepted", inspection.quantity_accepted or ZERO))
        inspection.quantity_rejected = dec(request.data.get("quantity_rejected", inspection.quantity_rejected or ZERO))
        inspection.quantity_inspected = dec(request.data.get("quantity_inspected", inspection.quantity_inspected or inspection.quantity_accepted + inspection.quantity_rejected))
        inspection.result = str(request.data.get("result", "PASS" if inspection.quantity_rejected == 0 else "FAIL"))
        inspection.status = "COMPLETED"
        inspection.inspection_at = inspection.inspection_at or timezone.now()
        inspection.save(update_fields=["quantity_accepted", "quantity_rejected", "quantity_inspected", "result", "status", "inspection_at"])
        update_document(inspection.document, status_value="COMPLETED", user=request.user)
        return self.ok(model_payload(inspection), "Inspection berhasil diselesaikan.")


class NonconformanceDispositionView(ERPCommandView):
    @command_schema(
        tag="Commands — Quality",
        summary="Set nonconformance disposition",
        request_serializer=inline_serializer(
            name="NonconformanceDispositionCommandRequest",
            fields={
                "disposition": serializers.CharField(required=False, default="REWORK"),
                "status": serializers.CharField(required=False, default="DISPOSITIONED")
            },
        ),
        success_status=status.HTTP_200_OK,
        parameters=None,
    )
    @transaction.atomic
    def post(self, request, id):
        from apps.quality.models import Nonconformance

        item = get_object_or_404(Nonconformance, pk=id)
        item.disposition = str(request.data.get("disposition", item.disposition or "REWORK"))
        item.status = str(request.data.get("status", "DISPOSITIONED"))
        item.save(update_fields=["disposition", "status"])
        return self.ok(model_payload(item), "Disposition berhasil dicatat.")


class CorrectiveActionVerifyView(ERPCommandView):
    @command_schema(
        tag="Commands — Quality",
        summary="Verify corrective action",
        request_serializer=inline_serializer(
            name="CorrectiveActionVerifyCommandRequest",
            fields={
                "verification_result": serializers.CharField(required=False, default="VERIFIED"),
                "completed_date": serializers.DateField(required=False, allow_null=True),
                "status": serializers.CharField(required=False, default="CLOSED")
            },
        ),
        success_status=status.HTTP_200_OK,
        parameters=None,
    )
    @transaction.atomic
    def post(self, request, id):
        from apps.quality.models import CorrectiveAction

        action = get_object_or_404(CorrectiveAction, pk=id)
        action.verification_result = str(request.data.get("verification_result", "VERIFIED"))
        action.completed_date = request.data.get("completed_date") or timezone.localdate()
        action.status = str(request.data.get("status", "CLOSED"))
        action.save(update_fields=["verification_result", "completed_date", "status"])
        return self.ok(model_payload(action), "Corrective action berhasil diverifikasi.")


# ---------------------------------------------------------------------------
# Finance
# ---------------------------------------------------------------------------


class JournalEntryPostView(ERPCommandView):
    @command_schema(
        tag="Commands — Finance",
        summary="Post journal entry",
        request_serializer=None,
        success_status=status.HTTP_200_OK,
        parameters=None,
    )
    @transaction.atomic
    def post(self, request, id):
        from apps.finance.models import JournalEntry, JournalLine

        entry = get_object_or_404(JournalEntry.objects.select_for_update(), pk=id)
        totals = JournalLine.objects.filter(journal_entry=entry).aggregate(
            debit=Coalesce(Sum("debit_base"), ZERO),
            credit=Coalesce(Sum("credit_base"), ZERO),
            lines=Count("id"),
        )
        if totals["lines"] < 2:
            raise ValidationError({"journal_lines": "Jurnal minimal memiliki dua baris."})
        if totals["debit"] != totals["credit"]:
            raise ValidationError({"balance": {"debit": str(totals["debit"]), "credit": str(totals["credit"])}})
        entry.status = "POSTED"
        entry.posting_date = entry.posting_date or timezone.localdate()
        entry.save(update_fields=["status", "posting_date"])
        update_document(entry.document, status_value="POSTED", user=request.user, posting=True)
        return self.ok({"journal_entry": model_payload(entry), "debit": str(totals["debit"]), "credit": str(totals["credit"])}, "Journal entry berhasil diposting.")


def validate_supplier_billing_for_payment(billing, *, payment=None):
    if billing.billing_type not in {"SUPPLIER_BILL", "VENDOR_INVOICE"}:
        raise ValidationError({"billing_document_id": f"{billing.invoice_number} bukan tagihan supplier."})
    if billing.status != "POSTED":
        raise ValidationError({"billing_document_id": f"Tagihan {billing.invoice_number} belum POSTED."})
    if (billing.outstanding_amount or ZERO) <= ZERO:
        raise ValidationError({"billing_document_id": f"Tagihan {billing.invoice_number} tidak memiliki saldo terutang."})
    if payment is not None:
        mismatches = []
        if payment.company_id != billing.company_id:
            mismatches.append("company")
        if payment.party_id != billing.party_id:
            mismatches.append("party/vendor")
        if payment.currency_id != billing.currency_id:
            mismatches.append("currency")
        if mismatches:
            raise ValidationError({"billing_document_id": f"Tagihan tidak cocok dengan payment: {', '.join(mismatches)}."})


def apply_payment_allocations(payment, allocations):
    from apps.finance.models import ARAPSchedule, BillingDocument, PaymentAllocation

    already_allocated = PaymentAllocation.objects.filter(payment=payment).aggregate(
        total=Coalesce(Sum("allocated_amount"), ZERO)
    )["total"]
    requested_total = sum((dec(item.get("allocated_amount")) for item in allocations), ZERO)
    if already_allocated + requested_total > (payment.amount or ZERO):
        raise ValidationError({"allocations": "Total alokasi kumulatif melebihi nilai payment."})

    results = []
    for item in allocations:
        billing = get_object_or_404(BillingDocument.objects.select_for_update(), pk=item.get("billing_document_id"))
        validate_supplier_billing_for_payment(billing, payment=payment)
        schedule = None
        if item.get("schedule_id"):
            schedule = get_object_or_404(ARAPSchedule.objects.select_for_update(), pk=item["schedule_id"], billing_document=billing)
        else:
            schedule = ARAPSchedule.objects.select_for_update().filter(
                billing_document=billing, status__in=["OPEN", "PARTIAL"]
            ).order_by("installment_number").first()
        amount = dec(item.get("allocated_amount"))
        discount = dec(item.get("discount_amount"))
        write_off = dec(item.get("write_off_amount"))
        exchange = dec(item.get("exchange_difference"))
        if amount <= ZERO or min(discount, write_off) < ZERO:
            raise ValidationError({"allocated_amount": "Alokasi harus positif dan potongan/write-off tidak boleh negatif."})
        applied = amount + discount + write_off
        if applied > (billing.outstanding_amount or ZERO):
            raise ValidationError({"allocated_amount": f"Alokasi melebihi saldo tagihan {billing.invoice_number}."})
        allocation = PaymentAllocation.objects.create(
            payment=payment, billing_document=billing, schedule=schedule,
            allocated_amount=amount, discount_amount=discount,
            write_off_amount=write_off, exchange_difference=exchange,
        )
        billing.paid_amount = (billing.paid_amount or ZERO) + amount
        billing.outstanding_amount = (billing.outstanding_amount or ZERO) - applied
        billing.payment_status = "PAID" if billing.outstanding_amount == ZERO else "PARTIAL"
        billing.save(update_fields=["paid_amount", "outstanding_amount", "payment_status"])
        if schedule:
            if applied > (schedule.outstanding_amount or ZERO):
                raise ValidationError({"schedule_id": "Alokasi melebihi saldo jadwal hutang."})
            schedule.paid_amount = (schedule.paid_amount or ZERO) + amount
            schedule.outstanding_amount = (schedule.outstanding_amount or ZERO) - applied
            schedule.status = "PAID" if schedule.outstanding_amount == ZERO else "PARTIAL"
            schedule.save(update_fields=["paid_amount", "outstanding_amount", "status"])
        results.append(model_payload(allocation))
    total = already_allocated + requested_total
    payment.status = "ALLOCATED" if total == (payment.amount or ZERO) else "PARTIALLY_ALLOCATED"
    payment.save(update_fields=["status"])
    return results, total


class BillingDocumentVerifyView(ERPCommandView):
    @command_schema(tag="Commands — Finance", summary="Verify supplier billing", request_serializer=None)
    @transaction.atomic
    def post(self, request, id):
        from apps.finance.models import BillingDocument, BillingDocumentLine
        from apps.procurement.models import ThreeWayMatch

        billing = get_object_or_404(BillingDocument.objects.select_for_update(), pk=id)
        if billing.status not in {"", "DRAFT", "REJECTED"}:
            raise ValidationError({"status": f"Billing berstatus {billing.status} tidak dapat diverifikasi."})
        if not BillingDocumentLine.objects.filter(billing_document=billing).exists():
            raise ValidationError({"lines": "Billing wajib memiliki minimal satu baris."})
        if billing.billing_type in {"SUPPLIER_BILL", "VENDOR_INVOICE"} and billing.purchase_order_id:
            match = ThreeWayMatch.objects.filter(
                purchase_order=billing.purchase_order,
                supplier_invoice=billing,
            ).order_by("-reviewed_at").first()
            if match is None or match.match_status not in {"MATCHED", "MATCHED_WITH_OVERRIDE"}:
                raise ValidationError({"three_way_match": "Tagihan PO harus MATCHED atau variance-nya telah diselesaikan."})
        billing.status = "VERIFIED"
        billing.verified_by = request.user
        billing.verified_at = timezone.now()
        billing.rejection_reason = ""
        billing.save(update_fields=["status", "verified_by", "verified_at", "rejection_reason"])
        update_document(billing.document, status_value="VERIFIED", user=request.user)
        return self.ok(model_payload(billing), "Billing berhasil diverifikasi.")


class BillingDocumentApproveView(ERPCommandView):
    @command_schema(tag="Commands — Finance", summary="Approve verified billing", request_serializer=None)
    @transaction.atomic
    def post(self, request, id):
        from apps.finance.models import BillingDocument

        billing = get_object_or_404(BillingDocument.objects.select_for_update(), pk=id)
        if billing.status != "VERIFIED":
            raise ValidationError({"status": "Hanya billing VERIFIED yang dapat disetujui."})
        if billing.verified_by_id == request.user.id:
            raise ValidationError({"approval": "Verifier dan approver harus pengguna yang berbeda."})
        billing.status = "APPROVED"
        billing.approved_by = request.user
        billing.approved_at = timezone.now()
        billing.save(update_fields=["status", "approved_by", "approved_at"])
        update_document(billing.document, status_value="APPROVED", user=request.user)
        return self.ok(model_payload(billing), "Billing berhasil disetujui.")


class BillingDocumentRejectView(ERPCommandView):
    @command_schema(
        tag="Commands — Finance", summary="Reject billing",
        request_serializer=inline_serializer(name="BillingRejectRequest", fields={"reason": serializers.CharField()}),
    )
    @transaction.atomic
    def post(self, request, id):
        from apps.finance.models import BillingDocument

        billing = get_object_or_404(BillingDocument.objects.select_for_update(), pk=id)
        if billing.status not in {"VERIFIED", "APPROVED"}:
            raise ValidationError({"status": "Hanya billing VERIFIED/APPROVED yang dapat ditolak."})
        reason = str(request.data.get("reason", "")).strip()
        if not reason:
            raise ValidationError({"reason": "Alasan penolakan wajib diisi."})
        billing.status = "REJECTED"
        billing.rejection_reason = reason
        billing.save(update_fields=["status", "rejection_reason"])
        update_document(billing.document, status_value="REJECTED", user=request.user)
        return self.ok(model_payload(billing), "Billing ditolak.")


class BillingDocumentPostView(ERPCommandView):
    @command_schema(
        tag="Commands — Finance",
        summary="Post billing document",
        request_serializer=None,
        success_status=status.HTTP_200_OK,
        parameters=None,
    )
    @transaction.atomic
    def post(self, request, id):
        from apps.finance.models import ARAPSchedule, BillingDocument, BillingDocumentLine, TaxTransaction

        billing = get_object_or_404(BillingDocument.objects.select_for_update(), pk=id)
        if billing.status != "APPROVED":
            raise ValidationError({"status": "Hanya billing APPROVED yang dapat diposting."})
        lines = BillingDocumentLine.objects.filter(billing_document=billing)
        subtotal = sum((line.line_total if line.line_total is not None else (line.quantity or ZERO) * (line.unit_price or ZERO) - (line.discount_amount or ZERO)) for line in lines)
        billing.subtotal = dec(subtotal)
        billing.total_amount = billing.subtotal + (billing.tax_amount or ZERO)
        billing.paid_amount = billing.paid_amount or ZERO
        billing.outstanding_amount = billing.total_amount - billing.paid_amount
        billing.payment_status = "UNPAID" if billing.outstanding_amount > 0 else "PAID"
        billing.status = "POSTED"
        billing.posting_date = billing.posting_date or timezone.localdate()
        billing.save(update_fields=["subtotal", "total_amount", "paid_amount", "outstanding_amount", "payment_status", "status", "posting_date"])
        if billing.due_date and not ARAPSchedule.objects.filter(billing_document=billing).exists():
            ARAPSchedule.objects.create(
                billing_document=billing,
                installment_number=1,
                due_date=billing.due_date,
                original_amount=billing.total_amount,
                paid_amount=ZERO,
                outstanding_amount=billing.total_amount,
                status="OPEN",
            )
        if (billing.tax_amount or ZERO) > 0:
            TaxTransaction.objects.get_or_create(
                billing_document=billing,
                billing_document_line=None,
                defaults={
                    "company": billing.company,
                    "taxable_amount": billing.subtotal,
                    "tax_amount": billing.tax_amount,
                    "tax_direction": "INPUT" if billing.billing_type in {"SUPPLIER_BILL", "VENDOR_INVOICE"} else "OUTPUT",
                    "tax_date": billing.posting_date,
                    "status": "DRAFT",
                },
            )
        update_document(billing.document, status_value="POSTED", user=request.user, posting=True)
        return self.ok(model_payload(billing), "Billing document berhasil diposting.")


class PaymentBatchCreateView(ERPCommandView):
    @command_schema(
        tag="Commands — Finance", summary="Create outgoing payment from supplier bills",
        request_serializer=inline_serializer(
            name="PaymentBatchCreateRequest",
            fields={
                "bank_account_id": serializers.UUIDField(),
                "payment_date": serializers.DateField(),
                "payment_method": serializers.CharField(),
                "allocations": serializers.ListField(child=serializers.DictField()),
            },
        ), success_status=status.HTTP_201_CREATED,
    )
    @transaction.atomic
    def post(self, request):
        from apps.finance.models import BankAccount, BillingDocument, Payment

        allocations = request.data.get("allocations") or []
        if not allocations:
            raise ValidationError({"allocations": "Pilih minimal satu tagihan."})
        first = get_object_or_404(BillingDocument.objects.select_for_update(), pk=allocations[0].get("billing_document_id"))
        validate_supplier_billing_for_payment(first)
        bank = get_object_or_404(BankAccount, pk=request.data.get("bank_account_id"), company=first.company)
        normalized, total = [], ZERO
        seen = set()
        for item in allocations:
            billing = get_object_or_404(BillingDocument.objects.select_for_update(), pk=item.get("billing_document_id"))
            validate_supplier_billing_for_payment(billing)
            if billing.id in seen:
                raise ValidationError({"allocations": "Tagihan yang sama tidak boleh dipilih dua kali."})
            seen.add(billing.id)
            if (billing.company_id, billing.party_id, billing.currency_id) != (first.company_id, first.party_id, first.currency_id):
                raise ValidationError({"allocations": "Satu payment hanya boleh berisi company, vendor, dan currency yang sama."})
            amount = dec(item.get("allocated_amount"), billing.outstanding_amount or ZERO)
            if amount <= ZERO or amount > (billing.outstanding_amount or ZERO):
                raise ValidationError({"allocated_amount": f"Nilai tagihan {billing.invoice_number} tidak valid."})
            normalized.append({
                "billing_document_id": str(billing.id), "schedule_id": item.get("schedule_id"),
                "allocated_amount": str(amount), "discount_amount": str(dec(item.get("discount_amount"))),
                "write_off_amount": str(dec(item.get("write_off_amount"))), "exchange_difference": str(dec(item.get("exchange_difference"))),
            })
            total += amount
        document = create_business_document(source=first, document_type="OUTGOING_PAYMENT", prefix="PAY", user=request.user)
        payment = Payment.objects.create(
            document=document, company=first.company, party=first.party, currency=first.currency,
            bank_account=bank, payment_type="OUTGOING", payment_date=request.data.get("payment_date") or timezone.localdate(),
            amount=total, payment_method=request.data.get("payment_method", "BANK_TRANSFER"),
            reference_number=document.document_number, allocation_plan=normalized, status="DRAFT",
        )
        return self.ok(model_payload(payment), "Draft payment berhasil dibuat.", status.HTTP_201_CREATED)


class PaymentSubmitView(ERPCommandView):
    @command_schema(tag="Commands — Finance", summary="Submit payment for approval", request_serializer=None)
    @transaction.atomic
    def post(self, request, id):
        from apps.finance.models import Payment
        payment = get_object_or_404(Payment.objects.select_for_update(), pk=id)
        if payment.status != "DRAFT" or not payment.allocation_plan:
            raise ValidationError({"status": "Hanya draft payment dengan rencana alokasi yang dapat diajukan."})
        payment.status, payment.submitted_by, payment.submitted_at = "SUBMITTED", request.user, timezone.now()
        payment.save(update_fields=["status", "submitted_by", "submitted_at"])
        update_document(payment.document, status_value="SUBMITTED", user=request.user)
        return self.ok(model_payload(payment), "Payment diajukan untuk persetujuan.")


class PaymentApproveView(ERPCommandView):
    @command_schema(tag="Commands — Finance", summary="Approve submitted payment", request_serializer=None)
    @transaction.atomic
    def post(self, request, id):
        from apps.finance.models import Payment
        payment = get_object_or_404(Payment.objects.select_for_update(), pk=id)
        if payment.status != "SUBMITTED":
            raise ValidationError({"status": "Hanya payment SUBMITTED yang dapat disetujui."})
        if payment.submitted_by_id == request.user.id:
            raise ValidationError({"approval": "Pembuat/pengaju dan approver harus pengguna yang berbeda."})
        payment.status, payment.approved_by, payment.approved_at = "APPROVED", request.user, timezone.now()
        payment.save(update_fields=["status", "approved_by", "approved_at"])
        update_document(payment.document, status_value="APPROVED", user=request.user)
        return self.ok(model_payload(payment), "Payment disetujui.")


class PaymentExecuteView(ERPCommandView):
    @command_schema(
        tag="Commands — Finance", summary="Record outgoing payment execution and post journal",
        request_serializer=inline_serializer(name="PaymentExecuteRequest", fields={"execution_reference": serializers.CharField(), "note": serializers.CharField(required=False, allow_blank=True)}),
    )
    @transaction.atomic
    def post(self, request, id):
        from apps.finance.models import Journal, JournalEntry, JournalLine, Payment
        from apps.master_data.models import SupplierProfile

        payment = get_object_or_404(Payment.objects.select_for_update(), pk=id)
        if payment.status != "APPROVED":
            raise ValidationError({"status": "Hanya payment APPROVED yang dapat dieksekusi."})
        execution_reference = str(request.data.get("execution_reference", "")).strip()
        if not execution_reference:
            raise ValidationError({"execution_reference": "Referensi bank/kas wajib diisi."})
        if Payment.objects.exclude(pk=payment.pk).filter(execution_reference=execution_reference).exists():
            raise ValidationError({"execution_reference": "Referensi eksekusi sudah pernah digunakan."})
        if not payment.bank_account_id or not payment.bank_account.ledger_account_id:
            raise ValidationError({"bank_account": "Rekening bank wajib memiliki ledger account."})
        supplier = SupplierProfile.objects.filter(party=payment.party).first()
        if supplier is None or not supplier.payable_account_id:
            raise ValidationError({"party": "Supplier wajib memiliki payable account."})
        journal = Journal.objects.filter(company=payment.company, journal_type__in=["BANK", "CASH", "PAYMENT"], status__in=["ACTIVE", "OPEN"]).first()
        if journal is None:
            raise ValidationError({"journal": "Journal BANK/CASH/PAYMENT aktif belum dikonfigurasi."})
        entry = JournalEntry.objects.create(
            document=payment.document, source_document=payment.document, journal=journal,
            currency=payment.currency, entry_number=document_number("JE-PAY"), posting_date=payment.payment_date or timezone.localdate(),
            exchange_rate=Decimal("1"), description=f"Outgoing payment {payment.reference_number}", status="POSTED",
        )
        JournalLine.objects.create(journal_entry=entry, account=supplier.payable_account, party=payment.party, debit_base=payment.amount, credit_base=ZERO, transaction_currency=payment.currency, transaction_amount=payment.amount)
        JournalLine.objects.create(journal_entry=entry, account=payment.bank_account.ledger_account, party=payment.party, debit_base=ZERO, credit_base=payment.amount, transaction_currency=payment.currency, transaction_amount=payment.amount)
        payment.journal_entry = entry
        payment.executed_by = request.user
        payment.executed_at = timezone.now()
        payment.execution_reference = execution_reference
        payment.execution_note = str(request.data.get("note", ""))
        payment.status = "EXECUTED"
        payment.save(update_fields=["journal_entry", "executed_by", "executed_at", "execution_reference", "execution_note", "status"])
        allocations, total = apply_payment_allocations(payment, payment.allocation_plan)
        update_document(payment.document, status_value="POSTED", user=request.user, posting=True)
        return self.ok({"payment": model_payload(payment), "journal_entry": model_payload(entry), "allocations": allocations, "total_allocated": str(total)}, "Pengeluaran berhasil dicatat, dijurnal, dan dialokasikan.")


class PaymentAllocateView(ERPCommandView):
    @command_schema(
        tag="Commands — Finance",
        summary="Allocate payment",
        request_serializer=inline_serializer(
            name="PaymentAllocateCommandRequest",
            fields={
                "allocations": serializers.JSONField(required=True, help_text="Daftar alokasi payment ke billing document/schedule.")
            },
        ),
        success_status=status.HTTP_200_OK,
        parameters=None,
    )
    @transaction.atomic
    def post(self, request, id):
        from apps.finance.models import Payment

        payment = get_object_or_404(Payment.objects.select_for_update(), pk=id)
        if payment.status not in {"EXECUTED", "PARTIALLY_ALLOCATED"}:
            raise ValidationError({"status": "Payment harus EXECUTED sebelum dialokasikan."})
        allocations = request.data.get("allocations", [])
        if not allocations:
            raise ValidationError({"allocations": "Daftar alokasi wajib diisi."})
        results, total_allocated = apply_payment_allocations(payment, allocations)
        return self.ok({"payment": model_payload(payment), "allocations": results, "total_allocated": str(total_allocated)}, "Payment berhasil dialokasikan.")


class BankStatementReconcileView(ERPCommandView):
    @command_schema(
        tag="Commands — Finance",
        summary="Reconcile bank statement",
        request_serializer=inline_serializer(
            name="BankStatementReconcileCommandRequest",
            fields={
                "matches": serializers.JSONField(required=False, help_text="Daftar pencocokan manual. Kosongkan untuk auto-match.")
            },
        ),
        success_status=status.HTTP_200_OK,
        parameters=None,
    )
    @transaction.atomic
    def post(self, request, id):
        from apps.finance.models import BankReconciliation, BankStatement, BankStatementLine, Payment

        statement = get_object_or_404(BankStatement, pk=id)
        explicit = request.data.get("matches", [])
        reconciliations = []
        if explicit:
            for item in explicit:
                line = get_object_or_404(BankStatementLine, pk=item.get("bank_statement_line_id"), bank_statement=statement)
                payment = get_object_or_404(Payment, pk=item.get("payment_id")) if item.get("payment_id") else None
                rec, _ = BankReconciliation.objects.update_or_create(
                    bank_statement_line=line,
                    payment=payment,
                    defaults={
                        "journal_line_id": item.get("journal_line_id"),
                        "matched_amount": dec(item.get("matched_amount")),
                        "match_type": str(item.get("match_type", "MANUAL")),
                        "status": "MATCHED",
                    },
                )
                reconciliations.append(rec)
        else:
            for line in BankStatementLine.objects.filter(bank_statement=statement):
                amount = abs((line.credit_amount or ZERO) - (line.debit_amount or ZERO))
                payment = Payment.objects.filter(
                    bank_account=statement.bank_account,
                    reference_number=line.reference_number,
                    amount=amount,
                ).first()
                if payment:
                    rec, _ = BankReconciliation.objects.update_or_create(
                        bank_statement_line=line,
                        payment=payment,
                        defaults={"matched_amount": amount, "match_type": "AUTO_REFERENCE_AMOUNT", "status": "MATCHED"},
                    )
                    reconciliations.append(rec)
        statement.status = "RECONCILED" if reconciliations else "UNMATCHED"
        statement.save(update_fields=["status"])
        return self.ok({"bank_statement": model_payload(statement), "reconciliations": [model_payload(item) for item in reconciliations]}, "Rekonsiliasi bank selesai.")


class FiscalPeriodCloseView(ERPCommandView):
    @command_schema(
        tag="Commands — Finance",
        summary="Close fiscal period",
        request_serializer=inline_serializer(
            name="FiscalPeriodCloseCommandRequest",
            fields={
                "force": serializers.BooleanField(required=False, default=False),
                "closing_type": serializers.CharField(required=False, default="MONTHLY")
            },
        ),
        success_status=status.HTTP_200_OK,
        parameters=None,
    )
    @transaction.atomic
    def post(self, request, id):
        from apps.finance.models import FiscalPeriod, JournalEntry, PeriodClosing

        period = get_object_or_404(FiscalPeriod.objects.select_for_update(), pk=id)
        drafts = JournalEntry.objects.filter(fiscal_period=period).exclude(status__in=["POSTED", "REVERSED", "CANCELLED"]).count()
        if drafts and not request.data.get("force"):
            raise ValidationError({"open_journals": drafts, "detail": "Masih ada jurnal yang belum diposting."})
        period.status = "CLOSED"
        period.save(update_fields=["status"])
        closing = PeriodClosing.objects.create(
            fiscal_period=period,
            executed_by=request.user,
            started_at=timezone.now(),
            completed_at=timezone.now(),
            closing_type=str(request.data.get("closing_type", "MONTHLY")),
            status="COMPLETED",
        )
        return self.ok({"fiscal_period": model_payload(period), "closing": model_payload(closing)}, "Fiscal period berhasil ditutup.")


class FiscalPeriodReopenView(ERPCommandView):
    @command_schema(
        tag="Commands — Finance",
        summary="Reopen fiscal period",
        request_serializer=inline_serializer(
            name="FiscalPeriodReopenCommandRequest",
            fields={
                "reason": serializers.CharField(required=True)
            },
        ),
        success_status=status.HTTP_200_OK,
        parameters=None,
    )
    @transaction.atomic
    def post(self, request, id):
        from apps.finance.models import FiscalPeriod

        period = get_object_or_404(FiscalPeriod.objects.select_for_update(), pk=id)
        if not request.data.get("reason"):
            raise ValidationError({"reason": "Alasan pembukaan kembali wajib diisi."})
        period.status = "OPEN"
        period.save(update_fields=["status"])
        create_audit_event(request=request, instance=period, event_type="REOPEN_PERIOD", after={"reason": request.data.get("reason"), **snapshot(period)})
        return self.ok(model_payload(period), "Fiscal period berhasil dibuka kembali.")


class BudgetCheckView(ERPCommandView):
    @command_schema(
        tag="Commands — Finance",
        summary="Check budget availability",
        request_serializer=inline_serializer(
            name="BudgetCheckCommandRequest",
            fields={
                "account_id": optional_uuid_field(),
                "project_id": optional_uuid_field(),
                "cost_center_id": optional_uuid_field(),
                "department_id": optional_uuid_field(),
                "period_number": serializers.IntegerField(required=False, allow_null=True),
                "requested_amount": optional_decimal_field()
            },
        ),
        success_status=status.HTTP_200_OK,
        parameters=None,
    )
    def post(self, request, id):
        from apps.finance.models import Budget, BudgetLine, JournalLine

        budget = get_object_or_404(Budget, pk=id)
        filters = {"budget": budget}
        for field in ["account_id", "project_id", "cost_center_id", "department_id", "period_number"]:
            if request.data.get(field) is not None:
                filters[field] = request.data.get(field)
        available_budget = BudgetLine.objects.filter(**filters).aggregate(v=Coalesce(Sum("budget_amount"), ZERO))["v"]
        actual_filters = {"journal_entry__status": "POSTED", "journal_entry__fiscal_period__fiscal_year": budget.fiscal_year}
        for field in ["account_id", "project_id", "cost_center_id", "department_id"]:
            if request.data.get(field) is not None:
                actual_filters[field] = request.data.get(field)
        if request.data.get("period_number") is not None:
            actual_filters["journal_entry__fiscal_period__period_number"] = request.data.get("period_number")
        actual = JournalLine.objects.filter(**actual_filters).aggregate(v=Coalesce(Sum(F("debit_base") - F("credit_base")), ZERO))["v"]
        requested = dec(request.data.get("requested_amount"))
        remaining = available_budget - actual
        return self.ok(
            {
                "budget_amount": str(available_budget),
                "actual_amount": str(actual),
                "remaining_amount": str(remaining),
                "requested_amount": str(requested),
                "allowed": requested <= remaining,
            }
        )


# ---------------------------------------------------------------------------
# Assets
# ---------------------------------------------------------------------------


class FinanceFlowStatusView(ERPCommandView):
    @command_schema(tag="Commands — Finance", summary="Get finance capability flow status", request_serializer=None, parameters=COMPANY_SCOPE_PARAMETERS)
    def get(self, request):
        from apps.assets.models import Asset, Maintenance
        from apps.finance.models import (Account, BillingDocument, CreditFacility, FinancialSnapshot, FiscalPeriod,
                                         JournalEntry, OverheadRule, Payment, ProjectFunding, RecurringPaymentRule)

        company_id = request.headers.get("X-Company-ID") or request.query_params.get("company_id")
        if not company_id:
            raise ValidationError({"company_id": "X-Company-ID atau company_id wajib diisi."})
        counts = {
            "accounts": Account.objects.filter(company_id=company_id).count(),
            "draft_journals": JournalEntry.objects.filter(journal__company_id=company_id, status="DRAFT").count(),
            "open_periods": FiscalPeriod.objects.filter(fiscal_year__company_id=company_id, status="OPEN").count(),
            "billing_attention": BillingDocument.objects.filter(company_id=company_id, status__in=["DRAFT", "VERIFIED", "APPROVED"]).count(),
            "payment_attention": Payment.objects.filter(company_id=company_id, status__in=["DRAFT", "SUBMITTED", "APPROVED"]).count(),
            "active_recurring_rules": RecurringPaymentRule.objects.filter(company_id=company_id, status="ACTIVE").count(),
            "active_credit_facilities": CreditFacility.objects.filter(company_id=company_id, status="ACTIVE").count(),
            "active_fundings": ProjectFunding.objects.filter(project__company_id=company_id, status="ACTIVE").count(),
            "active_overhead_rules": OverheadRule.objects.filter(company_id=company_id, status="ACTIVE").count(),
            "assets": Asset.objects.filter(company_id=company_id).count(),
            "maintenance_due": Maintenance.objects.filter(asset__company_id=company_id, status__in=["PLANNED", "SCHEDULED", "IN_PROGRESS"]).count(),
            "financial_snapshots": FinancialSnapshot.objects.filter(company_id=company_id).count(),
        }
        readiness = {
            "dashboard": counts["financial_snapshots"] > 0,
            "general_ledger": counts["accounts"] > 0 and counts["open_periods"] > 0,
            "accounts_payable": counts["accounts"] > 0,
            "debt": counts["active_credit_facilities"] > 0 or counts["active_recurring_rules"] > 0,
            "project_finance": counts["active_fundings"] > 0 or counts["active_overhead_rules"] > 0,
            "assets": counts["assets"] > 0,
        }
        return self.ok({"company_id": str(company_id), "readiness": readiness, "counts": counts, "safe_to_operate": readiness["general_ledger"]})


class FinancialSnapshotCalculateView(ERPCommandView):
    @command_schema(tag="Commands — Finance", summary="Calculate financial dashboard snapshot")
    @transaction.atomic
    def post(self, request):
        from apps.finance.models import FinancialSnapshot, FiscalPeriod, JournalLine, Payment

        company_id = request.headers.get("X-Company-ID") or request.data.get("company_id")
        period = get_object_or_404(FiscalPeriod, pk=request.data.get("fiscal_period_id"), fiscal_year__company_id=company_id)
        lines = JournalLine.objects.filter(journal_entry__journal__company_id=company_id, journal_entry__status="POSTED", journal_entry__posting_date__range=(period.start_date, period.end_date)).select_related("account")
        revenue = sum((dec(x.credit_base) - dec(x.debit_base) for x in lines if x.account and str(x.account.account_type).upper() in {"REVENUE", "INCOME"}), ZERO)
        expense = sum((dec(x.debit_base) - dec(x.credit_base) for x in lines if x.account and str(x.account.account_type).upper() in {"EXPENSE", "COST"}), ZERO)
        payments = Payment.objects.filter(company_id=company_id, status__in=["ALLOCATED", "PARTIALLY_ALLOCATED", "EXECUTED"], payment_date__range=(period.start_date, period.end_date))
        cashflow = sum((dec(x.amount) if str(x.payment_type).upper() in {"INCOMING", "RECEIPT"} else -dec(x.amount) for x in payments), ZERO)
        row = FinancialSnapshot.objects.filter(company_id=company_id, fiscal_period=period).order_by("-snapshot_at", "-id").first()
        values = {"snapshot_at": timezone.now(), "revenue_amount": revenue, "expense_amount": expense, "profit_loss_amount": revenue - expense,
                  "operating_cashflow": cashflow, "investing_cashflow": ZERO, "financing_cashflow": ZERO, "cash_balance": cashflow, "snapshot_status": "CALCULATED"}
        if row:
            for field, value in values.items(): setattr(row, field, value)
            row.save(update_fields=list(values))
        else:
            row = FinancialSnapshot.objects.create(company_id=company_id, fiscal_period=period, **values)
        return self.ok(model_payload(row), "Financial snapshot berhasil dihitung.")


class UnitCostCalculateView(ERPCommandView):
    @command_schema(tag="Commands — Finance", summary="Calculate production unit cost")
    @transaction.atomic
    def post(self, request, id):
        from apps.finance.models import OverheadAllocation, UnitCostSnapshot
        from apps.manufacturing.models import LaborLog, MachineLog, ProductionMaterial, ProductionOrder, ProductionOutput

        production = get_object_or_404(ProductionOrder, pk=id)
        material = ProductionMaterial.objects.filter(production_order=production).aggregate(v=Coalesce(Sum("actual_cost"), ZERO))["v"]
        labor = LaborLog.objects.filter(work_order__production_order=production).aggregate(v=Coalesce(Sum("labor_cost"), ZERO))["v"]
        machine = MachineLog.objects.filter(work_order__production_order=production).aggregate(v=Coalesce(Sum("machine_cost"), ZERO))["v"]
        overhead = OverheadAllocation.objects.filter(production_order=production, status__in=["CALCULATED", "POSTED"]).aggregate(v=Coalesce(Sum("allocated_amount"), ZERO))["v"]
        output = ProductionOutput.objects.filter(production_order=production).aggregate(v=Coalesce(Sum("output_quantity"), ZERO))["v"] or dec(production.completed_quantity)
        if output <= ZERO:
            raise ValidationError({"output_quantity": "Output quantity harus positif untuk menghitung unit cost."})
        total = material + labor + machine + overhead
        row = UnitCostSnapshot.objects.create(company=production.company, project=production.project, production_order=production, product=production.product,
                                               cost_unit_code=f"PO-{production.id}", snapshot_at=timezone.now(), material_cost=material, labor_cost=labor,
                                               machine_cost=machine, overhead_cost=overhead, total_cost=total, output_quantity=output, unit_cost=total/output)
        return self.ok(model_payload(row), "Unit cost/HPP berhasil dihitung.", status.HTTP_201_CREATED)


class CostVarianceCalculateView(ERPCommandView):
    @command_schema(tag="Commands — Finance", summary="Calculate project cost variance")
    @transaction.atomic
    def post(self, request, id):
        from apps.finance.models import CostBaseline, CostBaselineLine, CostVariance, FiscalPeriod
        from apps.projects.models import Project

        project = get_object_or_404(Project, pk=id)
        period = get_object_or_404(FiscalPeriod, pk=request.data.get("fiscal_period_id"), fiscal_year__company=project.company)
        baseline = CostBaseline.objects.filter(project=project, status="APPROVED").order_by("-baseline_version", "-effective_date").first()
        if not baseline:
            raise ValidationError({"baseline": "Cost baseline APPROVED belum tersedia."})
        lines = list(CostBaselineLine.objects.filter(cost_baseline=baseline))
        ideal_total = sum((dec(x.ideal_amount) for x in lines), ZERO)
        if not lines or ideal_total <= ZERO:
            raise ValidationError({"baseline": "Baseline line dengan ideal amount positif wajib tersedia."})
        actual_total = project_cost_data(project)["actual_cost"]
        results = []
        for line in lines:
            ideal = dec(line.ideal_amount)
            actual = actual_total * ideal / ideal_total
            variance = actual - ideal
            row = CostVariance.objects.filter(project=project, cost_baseline_line=line, fiscal_period=period).first()
            values = {"actual_amount": actual, "ideal_amount": ideal, "variance_amount": variance, "variance_percent": variance*Decimal("100")/ideal if ideal else ZERO, "calculated_at": timezone.now()}
            if row:
                for field, value in values.items(): setattr(row, field, value)
                row.save(update_fields=list(values))
            else:
                row = CostVariance.objects.create(project=project, cost_baseline_line=line, fiscal_period=period, **values)
            results.append(model_payload(row))
        return self.ok({"baseline_id": str(baseline.id), "actual_total": str(actual_total), "ideal_total": str(ideal_total), "variances": results}, "Cost variance berhasil dihitung.")


class RecurringPaymentRunView(ERPCommandView):
    @command_schema(tag="Commands — Finance", summary="Generate recurring payment run")
    @transaction.atomic
    def post(self, request, id):
        from datetime import timedelta
        from apps.finance.models import Payment, RecurringPaymentRule, RecurringPaymentRun

        rule = get_object_or_404(RecurringPaymentRule.objects.select_for_update(), pk=id)
        try:
            run_date = date.fromisoformat(str(request.data.get("scheduled_date") or rule.next_run_date or timezone.localdate()))
        except ValueError as exc:
            raise ValidationError({"scheduled_date": "Format tanggal harus YYYY-MM-DD."}) from exc
        if str(rule.status).upper() != "ACTIVE":
            raise ValidationError({"status": "Recurring payment rule harus ACTIVE."})
        if rule.end_date and run_date > rule.end_date:
            raise ValidationError({"scheduled_date": "Tanggal run melewati end date rule."})
        if dec(rule.amount) <= ZERO or not all((rule.company_id, rule.party_id, rule.currency_id, rule.bank_account_id)):
            raise ValidationError({"rule": "Company, party, currency, bank account, dan amount positif wajib tersedia."})
        if RecurringPaymentRun.objects.filter(recurring_rule=rule, scheduled_date=run_date).exists():
            raise ValidationError({"scheduled_date": "Recurring payment untuk tanggal ini sudah dibuat."})
        payment = Payment.objects.create(
            company=rule.company, party=rule.party, bank_account=rule.bank_account, currency=rule.currency,
            payment_type="OUTGOING", payment_date=run_date, amount=rule.amount,
            payment_method="BANK_TRANSFER", reference_number=document_number("RECUR"), status="DRAFT",
        )
        run = RecurringPaymentRun.objects.create(
            recurring_rule=rule, payment=payment, scheduled_date=run_date, executed_at=timezone.now(), run_status="GENERATED",
        )
        recurrence = str(rule.recurrence_rule).upper()
        rule.next_run_date = run_date + (timedelta(days=7) if "WEEK" in recurrence else timedelta(days=365) if "YEAR" in recurrence else timedelta(days=30))
        rule.save(update_fields=["next_run_date"])
        create_audit_event(request=request, instance=run, event_type="GENERATE_RECURRING_PAYMENT", after=snapshot(run))
        return self.ok({"run": model_payload(run), "payment": model_payload(payment)}, "Draft recurring payment berhasil dibuat.", status.HTTP_201_CREATED)


class CreditFacilityCheckView(ERPCommandView):
    @command_schema(tag="Commands — Finance", summary="Check credit facility availability")
    @transaction.atomic
    def post(self, request, id):
        from apps.finance.models import CreditFacility

        facility = get_object_or_404(CreditFacility.objects.select_for_update(), pk=id)
        requested = dec(request.data.get("requested_amount"))
        today = timezone.localdate()
        active = str(facility.status).upper() == "ACTIVE" and (not facility.effective_from or facility.effective_from <= today) and (not facility.effective_to or today <= facility.effective_to)
        available = max(ZERO, dec(facility.credit_limit) - dec(facility.utilized_amount))
        facility.available_amount = available
        facility.save(update_fields=["available_amount"])
        return self.ok({"facility_id": str(facility.id), "requested_amount": str(requested), "available_amount": str(available), "approved": active and requested > ZERO and requested <= available, "active": active})


class ProjectWIPCalculateView(ERPCommandView):
    @command_schema(tag="Commands — Finance", summary="Calculate project WIP snapshot")
    @transaction.atomic
    def post(self, request, id):
        from apps.finance.models import BillingDocument, FiscalPeriod, ProjectWIPSnapshot
        from apps.projects.models import Project

        project = get_object_or_404(Project, pk=id)
        period = get_object_or_404(FiscalPeriod, pk=request.data.get("fiscal_period_id"))
        if period.fiscal_year_id and period.fiscal_year.company_id and project.company_id != period.fiscal_year.company_id:
            raise ValidationError({"fiscal_period_id": "Fiscal period berasal dari company yang berbeda."})
        completion = min(Decimal("100"), max(ZERO, dec(project.progress_percent)))
        contract_value = dec(request.data.get("contract_value", project.budget_amount))
        if contract_value < ZERO:
            raise ValidationError({"contract_value": "Contract value tidak boleh negatif."})
        recognized_revenue = contract_value * completion / Decimal("100")
        recognized_cost = project_cost_data(project)["actual_cost"]
        billed = BillingDocument.objects.filter(project=project, status="POSTED").aggregate(v=Coalesce(Sum("total_amount"), ZERO))["v"]
        values = {"snapshot_date": timezone.localdate(), "completion_percent": completion, "recognized_revenue": recognized_revenue,
                  "recognized_cost": recognized_cost, "wip_asset_amount": max(ZERO, recognized_cost - billed),
                  "accrued_billing_amount": billed, "unbilled_amount": max(ZERO, recognized_revenue - billed), "status": "CALCULATED"}
        snapshot_row = ProjectWIPSnapshot.objects.filter(project=project, fiscal_period=period).order_by("-snapshot_date", "-id").first()
        if snapshot_row:
            for field, value in values.items():
                setattr(snapshot_row, field, value)
            snapshot_row.save(update_fields=list(values))
        else:
            snapshot_row = ProjectWIPSnapshot.objects.create(project=project, fiscal_period=period, **values)
        return self.ok(model_payload(snapshot_row), "WIP project berhasil dihitung.")


class ProjectFundingDrawView(ERPCommandView):
    @command_schema(tag="Commands — Finance", summary="Record project funding draw")
    @transaction.atomic
    def post(self, request, id):
        from apps.finance.models import ProjectFunding, ProjectFundingTransaction

        funding = get_object_or_404(ProjectFunding.objects.select_for_update(), pk=id)
        amount = dec(request.data.get("amount"))
        if str(funding.status).upper() != "ACTIVE" or amount <= ZERO:
            raise ValidationError({"funding": "Funding harus ACTIVE dan amount harus positif."})
        utilized = ProjectFundingTransaction.objects.filter(project_funding=funding, transaction_type="DRAW").aggregate(v=Coalesce(Sum("amount"), ZERO))["v"]
        if utilized + amount > dec(funding.approved_limit):
            raise ValidationError({"amount": "Penarikan melebihi approved funding limit."})
        row = ProjectFundingTransaction.objects.create(project_funding=funding, transaction_type="DRAW", transaction_date=request.data.get("transaction_date") or timezone.localdate(), amount=amount, outstanding_balance=utilized + amount)
        create_audit_event(request=request, instance=row, event_type="PROJECT_FUNDING_DRAW", after=snapshot(row))
        return self.ok(model_payload(row), "Penarikan funding berhasil dicatat.", status.HTTP_201_CREATED)


class OverheadAllocateView(ERPCommandView):
    @command_schema(tag="Commands — Finance", summary="Calculate project overhead allocation")
    @transaction.atomic
    def post(self, request, id):
        from apps.finance.models import FiscalPeriod, OverheadAllocation, OverheadRule
        from apps.projects.models import Project

        rule = get_object_or_404(OverheadRule, pk=id)
        project = get_object_or_404(Project, pk=request.data.get("project_id"))
        period = get_object_or_404(FiscalPeriod, pk=request.data.get("fiscal_period_id"))
        basis = dec(request.data.get("basis_quantity"))
        today = timezone.localdate()
        if rule.company_id != project.company_id or (period.fiscal_year_id and period.fiscal_year.company_id != project.company_id):
            raise ValidationError({"company": "Rule, project, dan fiscal period harus berasal dari company yang sama."})
        if str(rule.status).upper() != "ACTIVE" or basis < ZERO or (rule.effective_from and today < rule.effective_from) or (rule.effective_to and today > rule.effective_to):
            raise ValidationError({"rule": "Overhead rule tidak aktif/efektif atau basis tidak valid."})
        row, created = OverheadAllocation.objects.get_or_create(
            overhead_rule=rule, project=project, fiscal_period=period,
            defaults={"basis_quantity": basis, "allocated_amount": basis * dec(rule.rate_percent) / Decimal("100"), "status": "CALCULATED"},
        )
        if not created:
            raise ValidationError({"allocation": "Overhead project untuk rule dan period ini sudah dihitung."})
        return self.ok(model_payload(row), "Overhead berhasil dihitung.", status.HTTP_201_CREATED)


class MaintenanceCompleteView(ERPCommandView):
    @command_schema(tag="Commands — Assets", summary="Complete asset maintenance")
    @transaction.atomic
    def post(self, request, id):
        from apps.assets.models import Maintenance

        maintenance = get_object_or_404(Maintenance.objects.select_for_update(), pk=id)
        if str(maintenance.status).upper() in {"COMPLETED", "CANCELLED"}:
            raise ValidationError({"status": "Maintenance sudah completed/cancelled."})
        maintenance.completed_date = request.data.get("completed_date") or timezone.localdate()
        maintenance.maintenance_cost = dec(request.data.get("maintenance_cost", maintenance.maintenance_cost))
        if maintenance.maintenance_cost < ZERO:
            raise ValidationError({"maintenance_cost": "Biaya maintenance tidak boleh negatif."})
        maintenance.status = "COMPLETED"
        maintenance.save(update_fields=["completed_date", "maintenance_cost", "status"])
        create_audit_event(request=request, instance=maintenance, event_type="COMPLETE_MAINTENANCE", after=snapshot(maintenance))
        return self.ok(model_payload(maintenance), "Maintenance berhasil diselesaikan.")


class AssetRunDepreciationView(ERPCommandView):
    @command_schema(
        tag="Commands — Assets",
        summary="Run asset depreciation",
        request_serializer=inline_serializer(
            name="AssetRunDepreciationCommandRequest",
            fields={
                "fiscal_period_id": optional_uuid_field(required=True),
                "depreciation_date": serializers.DateField(required=False, allow_null=True)
            },
        ),
        success_status=status.HTTP_200_OK,
        parameters=None,
    )
    @transaction.atomic
    def post(self, request, id):
        from apps.assets.models import Asset, Book, DepreciationLine
        from apps.finance.models import FiscalPeriod

        asset = get_object_or_404(Asset, pk=id)
        period = get_object_or_404(FiscalPeriod, pk=request.data.get("fiscal_period_id"))
        lines = []
        for book in Book.objects.select_for_update().filter(asset=asset):
            if DepreciationLine.objects.filter(asset_book=book, fiscal_period=period).exists():
                continue
            periods = book.useful_life_periods or asset.useful_life_months or 1
            amount = ((book.cost_basis or asset.acquisition_cost or ZERO) - (book.salvage_value or asset.salvage_value or ZERO)) / Decimal(periods)
            opening = book.net_book_value if book.net_book_value is not None else (book.cost_basis or asset.acquisition_cost or ZERO)
            closing = max(book.salvage_value or ZERO, opening - amount)
            line = DepreciationLine.objects.create(
                asset_book=book,
                fiscal_period=period,
                depreciation_date=request.data.get("depreciation_date") or period.end_date,
                opening_book_value=opening,
                depreciation_amount=amount,
                accumulated_depreciation=(book.accumulated_depreciation or ZERO) + amount,
                closing_book_value=closing,
                status="POSTED",
            )
            book.accumulated_depreciation = line.accumulated_depreciation
            book.net_book_value = closing
            book.save(update_fields=["accumulated_depreciation", "net_book_value"])
            lines.append(model_payload(line))
        return self.ok(lines, "Depresiasi aset berhasil dihitung.")


class AssetDisposeView(ERPCommandView):
    @command_schema(
        tag="Commands — Assets",
        summary="Dispose asset",
        request_serializer=inline_serializer(
            name="AssetDisposeCommandRequest",
            fields={
                "disposal_date": serializers.DateField(required=False, allow_null=True),
                "disposal_proceeds": optional_decimal_field(),
                "journal_entry_id": optional_uuid_field()
            },
        ),
        success_status=status.HTTP_201_CREATED,
        parameters=None,
    )
    @transaction.atomic
    def post(self, request, id):
        from apps.assets.models import Asset, Book, Disposal

        asset = get_object_or_404(Asset, pk=id)
        proceeds = dec(request.data.get("disposal_proceeds"))
        net_book_value = Book.objects.filter(asset=asset).aggregate(v=Coalesce(Sum("net_book_value"), ZERO))["v"]
        document = create_business_document(source=asset, document_type="ASSET_DISPOSAL", prefix="AD", user=request.user)
        disposal = Disposal.objects.create(
            document=document,
            asset=asset,
            disposal_date=request.data.get("disposal_date") or timezone.localdate(),
            disposal_proceeds=proceeds,
            net_book_value=net_book_value,
            gain_or_loss=proceeds - net_book_value,
            journal_entry_id=request.data.get("journal_entry_id"),
            status="COMPLETED",
        )
        asset.status = "DISPOSED"
        asset.save(update_fields=["status"])
        return self.ok(model_payload(disposal), "Aset berhasil didisposal.", status.HTTP_201_CREATED)


# ---------------------------------------------------------------------------
# Service and logistics
# ---------------------------------------------------------------------------


class ServiceCaseResolveView(ERPCommandView):
    @command_schema(
        tag="Commands — Service",
        summary="Resolve service case",
        request_serializer=inline_serializer(
            name="ServiceCaseResolveCommandRequest",
            fields={
                "resolution_type": serializers.CharField(required=False, default="RESOLVED"),
                "resolution_notes": serializers.CharField(required=False, allow_blank=True),
                "credit_note_id": optional_uuid_field(),
                "replacement_delivery_id": optional_uuid_field()
            },
        ),
        success_status=status.HTTP_200_OK,
        parameters=None,
    )
    @transaction.atomic
    def post(self, request, id):
        from apps.service.models import Case, Resolution

        case = get_object_or_404(Case, pk=id)
        resolution, _ = Resolution.objects.update_or_create(
            service_case=case,
            defaults={
                "resolution_type": str(request.data.get("resolution_type", "RESOLVED")),
                "resolution_notes": str(request.data.get("resolution_notes", "")),
                "credit_note_id": request.data.get("credit_note_id"),
                "replacement_delivery_id": request.data.get("replacement_delivery_id"),
                "resolved_at": timezone.now(),
            },
        )
        case.status = "RESOLVED"
        case.resolved_at = timezone.now()
        case.save(update_fields=["status", "resolved_at"])
        return self.ok({"case": model_payload(case), "resolution": model_payload(resolution)}, "Service case berhasil diselesaikan.")


class ShipmentEventsView(ERPCommandView):
    @command_schema(
        tag="Commands — Logistics",
        summary="List shipment tracking events",
        request_serializer=None,
        success_status=status.HTTP_200_OK,
        parameters=None,
    )
    def get(self, request, id):
        from apps.logistics.models import Shipment, TrackingEvent

        shipment = get_object_or_404(Shipment, pk=id)
        events = TrackingEvent.objects.filter(shipment=shipment).order_by("event_at")
        return self.ok([model_payload(item) for item in events])

    @command_schema(
        tag="Commands — Logistics",
        summary="Create shipment tracking event",
        request_serializer=inline_serializer(
            name="ShipmentTrackingEventCommandRequest",
            fields={
                "event_code": serializers.CharField(required=False, default="UPDATE"),
                "event_description": serializers.CharField(required=False, allow_blank=True),
                "location_text": serializers.CharField(required=False, allow_blank=True),
                "latitude": optional_decimal_field(),
                "longitude": optional_decimal_field(),
                "event_at": serializers.DateTimeField(required=False, allow_null=True),
                "source_system": serializers.CharField(required=False, default="ERP"),
                "shipment_status": serializers.CharField(required=False, allow_blank=True)
            },
        ),
        success_status=status.HTTP_201_CREATED,
        parameters=None,
    )
    @transaction.atomic
    def post(self, request, id):
        from apps.logistics.models import Shipment, TrackingEvent

        shipment = get_object_or_404(Shipment, pk=id)
        event = TrackingEvent.objects.create(
            shipment=shipment,
            event_code=str(request.data.get("event_code", "UPDATE")),
            event_description=str(request.data.get("event_description", "")),
            location_text=str(request.data.get("location_text", "")),
            latitude=request.data.get("latitude"),
            longitude=request.data.get("longitude"),
            event_at=request.data.get("event_at") or timezone.now(),
            source_system=str(request.data.get("source_system", "ERP")),
        )
        if request.data.get("shipment_status"):
            shipment.shipment_status = request.data["shipment_status"]
            shipment.save(update_fields=["shipment_status"])
        return self.ok(model_payload(event), "Tracking event berhasil dicatat.", status.HTTP_201_CREATED)


class ShipmentProofOfDeliveryView(ERPCommandView):
    @command_schema(
        tag="Commands — Logistics",
        summary="Record proof of delivery",
        request_serializer=inline_serializer(
            name="ShipmentProofOfDeliveryCommandRequest",
            fields={
                "received_by_party_id": optional_uuid_field(),
                "signature_file_id": optional_uuid_field(),
                "photo_file_id": optional_uuid_field(),
                "receiver_name": serializers.CharField(required=False, allow_blank=True),
                "received_at": serializers.DateTimeField(required=False, allow_null=True),
                "remarks": serializers.CharField(required=False, allow_blank=True),
                "verification_status": serializers.CharField(required=False, default="VERIFIED")
            },
        ),
        success_status=status.HTTP_200_OK,
        parameters=None,
    )
    @transaction.atomic
    def post(self, request, id):
        from apps.logistics.models import ProofOfDelivery, Shipment

        shipment = get_object_or_404(Shipment, pk=id)
        proof, _ = ProofOfDelivery.objects.update_or_create(
            shipment=shipment,
            defaults={
                "received_by_party_id": request.data.get("received_by_party_id"),
                "signature_file_id": request.data.get("signature_file_id"),
                "photo_file_id": request.data.get("photo_file_id"),
                "receiver_name": str(request.data.get("receiver_name", "")),
                "received_at": request.data.get("received_at") or timezone.now(),
                "remarks": str(request.data.get("remarks", "")),
                "verification_status": str(request.data.get("verification_status", "VERIFIED")),
            },
        )
        shipment.shipment_status = "DELIVERED"
        shipment.delivered_at = proof.received_at
        shipment.save(update_fields=["shipment_status", "delivered_at"])
        return self.ok(model_payload(proof), "Proof of delivery berhasil dicatat.")


# ---------------------------------------------------------------------------
# Analytics and reporting
# ---------------------------------------------------------------------------


def resolve_kpi_queryset(definition, request):
    source = definition.source_entity or ""
    if "." not in source:
        raise ValidationError({"source_entity": "Gunakan format app_label.ModelName."})
    app_label, model_name = source.split(".", 1)
    model = apps.get_model(app_label, model_name)
    if model is None:
        raise ValidationError({"source_entity": "Model sumber tidak ditemukan."})
    queryset = model.objects.all()
    filters_payload = request.data.get("filters", {})
    if filters_payload:
        queryset = queryset.filter(**filters_payload)
    return queryset


class KPIRecalculateView(ERPCommandView):
    @command_schema(
        tag="Commands — Analytics",
        summary="Recalculate KPI",
        request_serializer=inline_serializer(
            name="KPIRecalculateCommandRequest",
            fields={
                "kpi_definition_id": optional_uuid_field(),
                "company_id": optional_uuid_field(),
                "organization_id": optional_uuid_field(),
                "project_id": optional_uuid_field(),
                "owner_user_id": optional_uuid_field(),
                "actual_value": optional_decimal_field(),
                "target_value": optional_decimal_field(),
                "filters": serializers.JSONField(required=False),
                "dimension_json": serializers.JSONField(required=False)
            },
        ),
        success_status=status.HTTP_200_OK,
        parameters=None,
    )
    @transaction.atomic
    def post(self, request):
        from apps.analytics.models import KPIDefinition, KPIResult, KPITarget

        definitions = KPIDefinition.objects.filter(active=True)
        if request.data.get("kpi_definition_id"):
            definitions = definitions.filter(pk=request.data["kpi_definition_id"])
        results = []
        for definition in definitions:
            if request.data.get("actual_value") is not None and definitions.count() == 1:
                actual = dec(request.data["actual_value"])
            else:
                queryset = resolve_kpi_queryset(definition, request)
                formula = (definition.formula_expression or "COUNT").strip()
                if formula.upper() == "COUNT":
                    actual = Decimal(queryset.count())
                elif formula.upper().startswith("SUM:"):
                    field = formula.split(":", 1)[1]
                    actual = dec(queryset.aggregate(v=Coalesce(Sum(field), ZERO))["v"])
                elif formula.upper().startswith("AVG:"):
                    field = formula.split(":", 1)[1]
                    actual = dec(queryset.aggregate(v=Coalesce(Avg(field), ZERO))["v"])
                else:
                    raise ValidationError({"formula_expression": f"Formula {formula} belum didukung. Gunakan COUNT, SUM:field, atau AVG:field."})
            target = KPITarget.objects.filter(
                kpi_definition=definition,
                company_id=request.data.get("company_id"),
                organization_id=request.data.get("organization_id"),
                project_id=request.data.get("project_id"),
                owner_user_id=request.data.get("owner_user_id"),
            ).order_by("-period_end").first()
            target_value = target.target_value if target else dec(request.data.get("target_value"))
            health = "ON_TARGET" if target_value in {None, ZERO} or actual >= target_value else "BELOW_TARGET"
            result = KPIResult.objects.create(
                kpi_definition=definition,
                company_id=request.data.get("company_id"),
                organization_id=request.data.get("organization_id"),
                project_id=request.data.get("project_id"),
                owner_user_id=request.data.get("owner_user_id"),
                measured_at=timezone.now(),
                actual_value=actual,
                target_value=target_value,
                health_status=health,
                dimension_json=request.data.get("dimension_json", {}),
            )
            results.append(model_payload(result))
        return self.ok(results, "KPI berhasil dihitung ulang.")


OPERATORS = {
    ">": lambda a, b: a > b,
    ">=": lambda a, b: a >= b,
    "<": lambda a, b: a < b,
    "<=": lambda a, b: a <= b,
    "==": lambda a, b: a == b,
    "!=": lambda a, b: a != b,
}


class AlertEvaluateView(ERPCommandView):
    @command_schema(
        tag="Commands — Analytics",
        summary="Evaluate alert rules",
        request_serializer=inline_serializer(
            name="AlertEvaluateCommandRequest",
            fields={
                "alert_rule_id": optional_uuid_field()
            },
        ),
        success_status=status.HTTP_200_OK,
        parameters=None,
    )
    @transaction.atomic
    def post(self, request):
        from apps.analytics.models import AlertEvent, AlertRule, KPIResult

        rules = AlertRule.objects.filter(active=True).select_related("kpi_definition")
        if request.data.get("alert_rule_id"):
            rules = rules.filter(pk=request.data["alert_rule_id"])
        events = []
        for rule in rules:
            result = KPIResult.objects.filter(kpi_definition=rule.kpi_definition).order_by("-measured_at").first()
            if not result:
                continue
            operator = OPERATORS.get(rule.operator)
            if not operator:
                continue
            if operator(result.actual_value or ZERO, rule.threshold_value or ZERO):
                event = AlertEvent.objects.create(
                    alert_rule=rule,
                    company=result.company,
                    project=result.project,
                    measured_value=result.actual_value,
                    severity=rule.severity,
                    message=f"{rule.rule_code}: {result.actual_value} {rule.operator} {rule.threshold_value}",
                    triggered_at=timezone.now(),
                    status="OPEN",
                )
                events.append(model_payload(event))
        return self.ok(events, "Evaluasi alert selesai.")


class FinanceMainDashboardView(ERPCommandView):
    @command_schema(
        tag="Dashboards",
        summary="Get finance main dashboard",
        request_serializer=None,
        success_status=status.HTTP_200_OK,
        parameters=COMPANY_SCOPE_PARAMETERS,
    )
    def get(self, request):
        from apps.analytics.models import AlertEvent, KPIResult
        from apps.finance.models import FinancialSnapshot, UnitCostSnapshot

        company_id = request.headers.get("X-Company-ID") or request.query_params.get("company_id")
        if not company_id:
            raise ValidationError({"company_id": "Gunakan header X-Company-ID atau query company_id."})
        snapshot_item = FinancialSnapshot.objects.filter(company_id=company_id).order_by("-snapshot_at").first()
        return self.ok(
            {
                "company_id": company_id,
                "calculated_at": timezone.now(),
                "profit_loss_amount": str(snapshot_item.profit_loss_amount if snapshot_item else ZERO),
                "net_cashflow_amount": str((snapshot_item.operating_cashflow or ZERO) + (snapshot_item.investing_cashflow or ZERO) + (snapshot_item.financing_cashflow or ZERO)) if snapshot_item else "0",
                "total_unit_hpp": str(UnitCostSnapshot.objects.filter(company_id=company_id).aggregate(v=Coalesce(Sum("total_cost"), ZERO))["v"]),
                "active_alert_count": AlertEvent.objects.filter(company_id=company_id, status="OPEN").count(),
                "periodic_kpi_count": KPIResult.objects.filter(company_id=company_id).count(),
            }
        )


class ProjectDashboardView(ERPCommandView):
    @command_schema(
        tag="Dashboards",
        summary="Get project dashboard",
        request_serializer=None,
        success_status=status.HTTP_200_OK,
        parameters=None,
    )
    def get(self, request, project_id):
        from apps.analytics.models import KPIResult
        from apps.core.models import NotificationRecipient
        from apps.projects.models import HealthSnapshot, ProgressSnapshot, Project, Task

        project = get_object_or_404(Project, pk=project_id)
        progress = ProgressSnapshot.objects.filter(project=project).order_by("-snapshot_at").first()
        health = HealthSnapshot.objects.filter(project=project).order_by("-snapshot_at").first()
        overdue = Task.objects.filter(project=project, planned_end_at__lt=timezone.now()).exclude(status__in=["DONE", "COMPLETED", "CANCELLED"]).count()
        kpi = KPIResult.objects.filter(project=project).aggregate(v=Coalesce(Avg("actual_value"), ZERO))["v"]
        unread = NotificationRecipient.objects.filter(recipient_user=request.user, read_at__isnull=True).count()
        return self.ok(
            {
                "project_id": str(project.id),
                "calculated_at": timezone.now(),
                "overall_kpi_score": str(kpi),
                "planned_progress_percent": str(progress.planned_progress_percent if progress else ZERO),
                "actual_progress_percent": str(progress.actual_progress_percent if progress else project.progress_percent or ZERO),
                "project_health_status": health.health_status if health else "UNKNOWN",
                "overdue_task_count": overdue,
                "unread_notification_count": unread,
                "costs": {key: str(value) for key, value in project_cost_data(project).items()},
            }
        )


class CRMSalesDashboardView(ERPCommandView):
    @command_schema(
        tag="Dashboards",
        summary="Get CRM and sales dashboard",
        request_serializer=None,
        success_status=status.HTTP_200_OK,
        parameters=COMPANY_SCOPE_PARAMETERS,
    )
    def get(self, request):
        from apps.crm.models import CustomerInquiry, Opportunity
        from apps.sales.models import Contract, Quotation

        company_id = request.headers.get("X-Company-ID") or request.query_params.get("company_id")
        opportunities = Opportunity.objects.all()
        if company_id:
            opportunities = opportunities.filter(company_id=company_id)
        total_closed = opportunities.filter(status__in=["WON", "LOST", "CLOSED_WON", "CLOSED_LOST"]).count()
        won = opportunities.filter(status__in=["WON", "CLOSED_WON"]).count()
        win_rate = ZERO if total_closed == 0 else Decimal(won * 100) / Decimal(total_closed)
        weighted = sum(((item.expected_amount or ZERO) * (item.probability_percent or ZERO) / Decimal("100")) for item in opportunities)
        margin = Quotation.objects.filter(document__company_id=company_id).aggregate(v=Coalesce(Avg("estimated_margin"), ZERO))["v"] if company_id else ZERO
        closed_with_dates = list(opportunities.filter(opened_at__isnull=False, closed_at__isnull=False))
        average_cycle_days = ZERO if not closed_with_dates else sum(Decimal(str((item.closed_at - item.opened_at).total_seconds() / 86400)) for item in closed_with_dates) / len(closed_with_dates)
        return self.ok(
            {
                "company_id": company_id,
                "calculated_at": timezone.now(),
                "weighted_project_value": str(weighted),
                "win_rate_percent": str(win_rate),
                "prospect_count": opportunities.filter(pipeline_stage__icontains="PROSPECT").count(),
                "pitch_count": opportunities.filter(pipeline_stage__icontains="PITCH").count(),
                "closing_count": won,
                "offering_margin_percent": str(margin),
                "average_sales_cycle_days": str(average_cycle_days),
                "open_inquiry_count": CustomerInquiry.objects.filter(company_id=company_id).exclude(status__in=["CLOSED_LOST", "WON"]).count() if company_id else 0,
                "quotation_pending_approval_count": Quotation.objects.filter(document__company_id=company_id, status="PENDING_APPROVAL").count() if company_id else 0,
                "active_contract_count": Contract.objects.filter(document__company_id=company_id, status="ACTIVE").count() if company_id else 0,
            }
        )

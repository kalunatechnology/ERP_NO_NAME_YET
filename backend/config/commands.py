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
from rest_framework import permissions, status
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.api_common.audit import create_audit_event, snapshot
from apps.api_common.scoping import get_scope_value


ZERO = Decimal("0")


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


class ERPCommandView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def ok(self, data=None, message="Operasi berhasil.", http_status=status.HTTP_200_OK):
        return Response({"success": True, "message": message, "data": data}, status=http_status)


# ---------------------------------------------------------------------------
# Core document lifecycle
# ---------------------------------------------------------------------------


class DocumentSubmitView(ERPCommandView):
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


class SalesDeliveryDispatchView(ERPCommandView):
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
    from apps.projects.models import BudgetLine, EquipmentUsage, Timesheet

    budget = BudgetLine.objects.filter(project=project).aggregate(v=Coalesce(Sum("budget_amount"), ZERO))["v"]
    labor = Timesheet.objects.filter(project=project, approval_status="APPROVED").aggregate(v=Coalesce(Sum("amount"), ZERO))["v"]
    equipment = EquipmentUsage.objects.filter(project=project).aggregate(v=Coalesce(Sum("total_cost"), ZERO))["v"]
    material = ProductionMaterial.objects.filter(production_order__project=project).aggregate(v=Coalesce(Sum("actual_cost"), ZERO))["v"]
    actual = labor + equipment + material
    return {
        "budget_amount": budget or project.budget_amount or ZERO,
        "labor_cost": labor,
        "equipment_cost": equipment,
        "material_cost": material,
        "actual_cost": actual,
        "remaining_budget": (budget or project.budget_amount or ZERO) - actual,
    }


class ProjectStartView(ERPCommandView):
    @transaction.atomic
    def post(self, request, id):
        from apps.projects.models import Project

        project = get_object_or_404(Project, pk=id)
        project.status = "IN_PROGRESS"
        if not project.actual_start_date:
            project.actual_start_date = timezone.localdate()
        project.save(update_fields=["status", "actual_start_date"])
        update_document(project.document, status_value="APPROVED", user=request.user)
        return self.ok(model_payload(project), "Project berhasil dimulai.")


class ProjectHealthView(ERPCommandView):
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
    def get(self, request, id):
        from apps.projects.models import Project

        project = get_object_or_404(Project, pk=id)
        return self.ok({key: str(value) for key, value in project_cost_data(project).items()})


class ProjectProgressView(ERPCommandView):
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


class ProjectTaskMoveView(ERPCommandView):
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
    @transaction.atomic
    def post(self, request, id):
        from apps.procurement.models import SupplierQuotation

        quotation = get_object_or_404(SupplierQuotation, pk=id)
        SupplierQuotation.objects.filter(rfq=quotation.rfq).exclude(pk=quotation.pk).update(evaluation_status="NOT_SELECTED")
        quotation.evaluation_status = "SELECTED"
        quotation.save(update_fields=["evaluation_status"])
        return self.ok(model_payload(quotation), "Supplier quotation berhasil dipilih.")


class PurchaseOrderSendView(ERPCommandView):
    @transaction.atomic
    def post(self, request, id):
        from apps.procurement.models import PurchaseOrder

        purchase_order = get_object_or_404(PurchaseOrder, pk=id)
        purchase_order.status = "SENT"
        purchase_order.save(update_fields=["status"])
        update_document(purchase_order.document, status_value="APPROVED", user=request.user)
        return self.ok(model_payload(purchase_order), "Purchase order berhasil diterbitkan.")


class GoodsReceiptInspectView(ERPCommandView):
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
    @transaction.atomic
    def post(self, request, id):
        from apps.finance.models import BillingDocument
        from apps.procurement.models import GoodsReceipt, GoodsReceiptLine, PurchaseOrder, PurchaseOrderLine, ThreeWayMatch

        purchase_order = get_object_or_404(PurchaseOrder, pk=id)
        receipt = GoodsReceipt.objects.filter(purchase_order=purchase_order).order_by("-receipt_date").first()
        invoice = BillingDocument.objects.filter(purchase_order=purchase_order).order_by("-invoice_date").first()
        if receipt is None or invoice is None:
            raise ValidationError({"match": "Goods receipt dan supplier invoice wajib tersedia."})
        ordered = PurchaseOrderLine.objects.filter(purchase_order=purchase_order).aggregate(v=Coalesce(Sum("ordered_quantity"), ZERO))["v"]
        received = GoodsReceiptLine.objects.filter(goods_receipt=receipt).aggregate(v=Coalesce(Sum("received_quantity"), ZERO))["v"]
        quantity_variance = received - ordered
        price_variance = (invoice.subtotal or ZERO) - (purchase_order.subtotal or ZERO)
        tax_variance = (invoice.tax_amount or ZERO) - (purchase_order.tax_amount or ZERO)
        match_status = "MATCHED" if quantity_variance == 0 and price_variance == 0 and tax_variance == 0 else "VARIANCE"
        match, _ = ThreeWayMatch.objects.update_or_create(
            purchase_order=purchase_order,
            goods_receipt=receipt,
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
    @transaction.atomic
    def post(self, request, id):
        from apps.manufacturing.models import WorkOrder

        work_order = get_object_or_404(WorkOrder, pk=id)
        work_order.status = "IN_PROGRESS"
        work_order.actual_start_at = work_order.actual_start_at or timezone.now()
        work_order.save(update_fields=["status", "actual_start_at"])
        return self.ok(model_payload(work_order), "Work order berhasil dimulai.")


class WorkOrderCompleteView(ERPCommandView):
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
    @transaction.atomic
    def post(self, request, id):
        from apps.quality.models import Nonconformance

        item = get_object_or_404(Nonconformance, pk=id)
        item.disposition = str(request.data.get("disposition", item.disposition or "REWORK"))
        item.status = str(request.data.get("status", "DISPOSITIONED"))
        item.save(update_fields=["disposition", "status"])
        return self.ok(model_payload(item), "Disposition berhasil dicatat.")


class CorrectiveActionVerifyView(ERPCommandView):
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


class BillingDocumentPostView(ERPCommandView):
    @transaction.atomic
    def post(self, request, id):
        from apps.finance.models import ARAPSchedule, BillingDocument, BillingDocumentLine

        billing = get_object_or_404(BillingDocument.objects.select_for_update(), pk=id)
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
        update_document(billing.document, status_value="POSTED", user=request.user, posting=True)
        return self.ok(model_payload(billing), "Billing document berhasil diposting.")


class PaymentAllocateView(ERPCommandView):
    @transaction.atomic
    def post(self, request, id):
        from apps.finance.models import ARAPSchedule, BillingDocument, Payment, PaymentAllocation

        payment = get_object_or_404(Payment.objects.select_for_update(), pk=id)
        allocations = request.data.get("allocations", [])
        if not allocations:
            raise ValidationError({"allocations": "Daftar alokasi wajib diisi."})
        total_allocated = ZERO
        results = []
        for item in allocations:
            billing = get_object_or_404(BillingDocument.objects.select_for_update(), pk=item.get("billing_document_id"))
            schedule = None
            if item.get("schedule_id"):
                schedule = get_object_or_404(ARAPSchedule.objects.select_for_update(), pk=item.get("schedule_id"), billing_document=billing)
            amount = dec(item.get("allocated_amount"))
            discount = dec(item.get("discount_amount"))
            write_off = dec(item.get("write_off_amount"))
            exchange = dec(item.get("exchange_difference"))
            if amount <= 0:
                raise ValidationError({"allocated_amount": "Nilai alokasi harus lebih besar dari nol."})
            allocation = PaymentAllocation.objects.create(
                payment=payment,
                billing_document=billing,
                schedule=schedule,
                allocated_amount=amount,
                discount_amount=discount,
                write_off_amount=write_off,
                exchange_difference=exchange,
            )
            applied = amount + discount + write_off
            billing.paid_amount = (billing.paid_amount or ZERO) + amount
            billing.outstanding_amount = max(ZERO, (billing.total_amount or ZERO) - billing.paid_amount - discount - write_off)
            billing.payment_status = "PAID" if billing.outstanding_amount == 0 else "PARTIAL"
            billing.save(update_fields=["paid_amount", "outstanding_amount", "payment_status"])
            if schedule:
                schedule.paid_amount = (schedule.paid_amount or ZERO) + amount
                schedule.outstanding_amount = max(ZERO, (schedule.original_amount or ZERO) - schedule.paid_amount - discount - write_off)
                schedule.status = "PAID" if schedule.outstanding_amount == 0 else "PARTIAL"
                schedule.save(update_fields=["paid_amount", "outstanding_amount", "status"])
            total_allocated += amount
            results.append(model_payload(allocation))
        if total_allocated > (payment.amount or ZERO):
            raise ValidationError({"allocations": "Total alokasi melebihi nilai payment."})
        payment.status = "ALLOCATED" if total_allocated == (payment.amount or ZERO) else "PARTIALLY_ALLOCATED"
        payment.save(update_fields=["status"])
        return self.ok({"payment": model_payload(payment), "allocations": results, "total_allocated": str(total_allocated)}, "Payment berhasil dialokasikan.")


class BankStatementReconcileView(ERPCommandView):
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


class AssetRunDepreciationView(ERPCommandView):
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
    def get(self, request, id):
        from apps.logistics.models import Shipment, TrackingEvent

        shipment = get_object_or_404(Shipment, pk=id)
        events = TrackingEvent.objects.filter(shipment=shipment).order_by("event_at")
        return self.ok([model_payload(item) for item in events])

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
    def get(self, request):
        from apps.crm.models import Opportunity
        from apps.projects.models import WeightIndicator
        from apps.sales.models import Quotation

        company_id = request.headers.get("X-Company-ID") or request.query_params.get("company_id")
        opportunities = Opportunity.objects.all()
        if company_id:
            opportunities = opportunities.filter(document__company_id=company_id)
        total_closed = opportunities.filter(status__in=["WON", "LOST", "CLOSED_WON", "CLOSED_LOST"]).count()
        won = opportunities.filter(status__in=["WON", "CLOSED_WON"]).count()
        win_rate = ZERO if total_closed == 0 else Decimal(won * 100) / Decimal(total_closed)
        weighted = WeightIndicator.objects.filter(sales_order__document__company_id=company_id).aggregate(v=Coalesce(Sum("weighted_project_value"), ZERO))["v"] if company_id else ZERO
        margin = Quotation.objects.filter(document__company_id=company_id).aggregate(v=Coalesce(Avg("estimated_margin"), ZERO))["v"] if company_id else ZERO
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
            }
        )

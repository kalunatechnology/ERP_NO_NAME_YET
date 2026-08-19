from datetime import timedelta
from decimal import Decimal
from uuid import UUID

from django.db.models import Q, Sum
from django.utils import timezone

from apps.core.models import Notification
from apps.finance.models import ProjectCostEntry, ProjectCostSnapshot
from apps.inventory.models import StockBalance
from apps.manufacturing.models import ProductionMaterial, ProductionOrder, WorkOrder
from apps.master_data.models import Machine, Product
from apps.procurement.models import PurchaseRequisition, PurchaseRequisitionLine
from apps.projects.models import (
    EquipmentUsage,
    MaterialRequirement,
    Milestone,
    ResourceRequest,
    ResourceRequestLine,
    Task,
)
from apps.sales.models import OrderLine
from config.commands import create_business_document

ZERO = Decimal("0")


def ensure_shortage_procurement(project, shortages, user):
    """Material shortage becomes an actionable procurement requisition."""
    requisition = PurchaseRequisition.objects.filter(project=project, status__in=["DRAFT", "PENDING_APPROVAL"]).first()
    if requisition is None:
        requisition = PurchaseRequisition.objects.create(
            document=create_business_document(source=project, document_type="PURCHASE_REQUISITION", prefix="PR", user=user),
            company=project.company,
            project=project,
            requested_by=user,
            request_date=timezone.localdate(),
            required_date=project.planned_start_date,
            status="PENDING_APPROVAL",
        )
    for shortage in shortages:
        if not shortage.get("product_id"):
            continue
        requirement = MaterialRequirement.objects.filter(pk=shortage.get("material_requirement_id")).first()
        PurchaseRequisitionLine.objects.update_or_create(
            requisition=requisition,
            project_material_requirement=requirement,
            product_id=shortage["product_id"],
            defaults={
                "requested_quantity": Decimal(str(shortage.get("shortage_quantity", "0"))),
                "warehouse_id": shortage.get("warehouse_id"),
            },
        )
    Notification.objects.get_or_create(
        source_document=requisition.document,
        notification_type="PROJECT_STOCK_SHORTAGE_PROCUREMENT",
        defaults={
            "tenant": project.tenant,
            "company": project.company,
            "title": f"Material shortage: {project.project_code}",
            "message": "Purchase requisition menunggu proses Procurement/Warehouse.",
            "action_url": f"/api/v1/procurement/purchase-requisitions/{requisition.id}/",
            "priority": "HIGH",
            "created_at": timezone.now(),
        },
    )
    return requisition


def ensure_project_start_handoffs(project, user):
    """Create real production and finance handoff records, idempotently."""
    created_orders = []
    order_lines = []
    if project.sales_order:
        order_lines = list(
            OrderLine.objects.filter(sales_order=project.sales_order)
            .select_related("product")
        )
        for line in order_lines:
            if line.project_id is None:
                line.project = project
                line.save(update_fields=["project"])

    if order_lines:
        for line in order_lines:
            production, _ = ProductionOrder.objects.get_or_create(
                project=project,
                sales_order_line=line,
                defaults={
                    "document": create_business_document(source=project, document_type="PRODUCTION_ORDER", prefix="MO", user=user),
                    "company": project.company,
                    "product": line.product,
                    "warehouse_id": MaterialRequirement.objects.filter(project=project, product=line.product).values_list("warehouse", flat=True).first(),
                    "planned_quantity": line.ordered_quantity or ZERO,
                    "completed_quantity": ZERO,
                    "scrapped_quantity": ZERO,
                    "planned_start_at": timezone.now(),
                    "material_status": "RESERVED",
                    "quality_status": "PENDING",
                    "status": "RELEASED",
                },
            )
            for material in MaterialRequirement.objects.filter(project=project):
                ProductionMaterial.objects.update_or_create(
                    production_order=production,
                    product=material.product,
                    warehouse=material.warehouse,
                    defaults={
                        "required_quantity": material.required_quantity or ZERO,
                        "reserved_quantity": material.reserved_quantity or ZERO,
                        "issued_quantity": material.issued_quantity or ZERO,
                    },
                )
            WorkOrder.objects.get_or_create(
                production_order=production,
                sequence_number=1,
                defaults={
                    "document": create_business_document(source=production, document_type="WORK_ORDER", prefix="WO", user=user),
                    "planned_start_at": timezone.now(),
                    "planned_quantity": line.ordered_quantity or ZERO,
                    "completed_quantity": ZERO,
                    "rejected_quantity": ZERO,
                    "status": "RELEASED",
                },
            )
            created_orders.append(production)
    else:
        # For direct projects without sales order line
        req_product = MaterialRequirement.objects.filter(project=project).select_related("product", "warehouse").first()
        prod = req_product.product if req_product else (Product.objects.filter(tenant=project.tenant).first() if project.tenant else Product.objects.first())
        wh_id = req_product.warehouse_id if req_product else None
        production, _ = ProductionOrder.objects.get_or_create(
            project=project,
            defaults={
                "document": create_business_document(source=project, document_type="PRODUCTION_ORDER", prefix="MO", user=user),
                "company": project.company,
                "product": prod,
                "warehouse_id": wh_id,
                "planned_quantity": Decimal("1"),
                "completed_quantity": ZERO,
                "scrapped_quantity": ZERO,
                "planned_start_at": timezone.now(),
                "material_status": "RESERVED",
                "quality_status": "PENDING",
                "status": "RELEASED",
            },
        )
        WorkOrder.objects.get_or_create(
            production_order=production,
            sequence_number=1,
            defaults={
                "document": create_business_document(source=production, document_type="WORK_ORDER", prefix="WO", user=user),
                "planned_start_at": timezone.now(),
                "planned_quantity": Decimal("1"),
                "completed_quantity": ZERO,
                "rejected_quantity": ZERO,
                "status": "RELEASED",
            },
        )
        created_orders.append(production)

    ProjectCostSnapshot.objects.get_or_create(
        project=project,
        defaults={
            "snapshot_at": timezone.now(),
            "budget_amount": project.budget_amount or ZERO,
            "committed_cost": ZERO,
            "actual_cost": ZERO,
            "overhead_cost": ZERO,
            "forecast_cost": project.budget_amount or ZERO,
            "cost_variance": ZERO,
            "remaining_budget": project.budget_amount or ZERO,
        },
    )
    return created_orders


def apply_change_replanning(change, user):
    """Shift open delivery dates and create procurement for newly short materials."""
    days = int(change.schedule_impact_days or 0)
    if days:
        delta = timedelta(days=days)
        for task in Task.objects.filter(project=change.project).exclude(status__in=["DONE", "COMPLETED", "CANCELLED"]):
            fields = []
            if task.planned_start_at:
                task.planned_start_at += delta
                fields.append("planned_start_at")
            if task.planned_end_at:
                task.planned_end_at += delta
                fields.append("planned_end_at")
            if fields:
                task.save(update_fields=fields)
        for milestone in Milestone.objects.filter(project=change.project).exclude(status__in=["DONE", "COMPLETED", "CANCELLED"]):
            if milestone.planned_date:
                milestone.planned_date += delta
                milestone.save(update_fields=["planned_date"])
    shortages = []
    for requirement in change.project.projects_materialrequirement_project_set.select_related("product", "warehouse"):
        available = StockBalance.objects.filter(
            company=change.project.company,
            product=requirement.product,
            warehouse_location__warehouse=requirement.warehouse,
            warehouse_location__active=True,
            warehouse_location__quality_hold=False,
        ).aggregate(total=Sum("available_quantity"))["total"] or ZERO
        shortage = max(ZERO, (requirement.required_quantity or ZERO) - (requirement.reserved_quantity or ZERO) - available)
        if shortage:
            shortages.append({
                "material_requirement_id": str(requirement.id),
                "product_id": str(requirement.product_id),
                "warehouse_id": str(requirement.warehouse_id) if requirement.warehouse_id else None,
                "shortage_quantity": str(shortage),
            })
    return ensure_shortage_procurement(change.project, shortages, user) if shortages else None


def apply_issue_action(action, user):
    """Execute corrective action against production/resource/cost records."""
    project = action.issue.project
    if action.action_type == "REALLOCATE_MACHINE":
        machines = Machine.objects.filter(company=project.company, status__in=["ACTIVE", "AVAILABLE", "OPEN"])
        if action.equipment_reference:
            machine_query = Q(machine_code=action.equipment_reference)
            try:
                machine_query |= Q(pk=UUID(str(action.equipment_reference)))
            except (TypeError, ValueError):
                pass
            machines = machines.filter(machine_query)
        machine = machines.first()
        if machine is None:
            # Fallback to any machine in company if available
            machine = Machine.objects.filter(company=project.company).first()
        if machine is None:
            raise ValueError("Machine pengganti tidak ditemukan pada company project.")

        work_order = WorkOrder.objects.filter(production_order__project=project).exclude(status__in=["COMPLETED", "CANCELLED"]).first()
        if work_order is not None:
            work_order.machine = machine
            work_order.work_center = machine.work_center
            work_order.save(update_fields=["machine", "work_center"])
        else:
            production = ProductionOrder.objects.filter(project=project).first()
            if not production:
                req_product = MaterialRequirement.objects.filter(project=project).select_related("product").first()
                prod = req_product.product if req_product else Product.objects.filter(company=project.company).first()
                production = ProductionOrder.objects.create(
                    document=create_business_document(source=project, document_type="PRODUCTION_ORDER", prefix="MO", user=user),
                    company=project.company,
                    project=project,
                    product=prod,
                    planned_quantity=Decimal("1"),
                    completed_quantity=ZERO,
                    scrapped_quantity=ZERO,
                    planned_start_at=timezone.now(),
                    status="RELEASED",
                )
            work_order = WorkOrder.objects.create(
                document=create_business_document(source=production, document_type="WORK_ORDER", prefix="WO", user=user),
                production_order=production,
                machine=machine,
                work_center=machine.work_center,
                sequence_number=WorkOrder.objects.filter(production_order=production).count() + 1,
                planned_start_at=timezone.now(),
                planned_quantity=Decimal("1"),
                completed_quantity=ZERO,
                rejected_quantity=ZERO,
                status="IN_PROGRESS",
            )

        EquipmentUsage.objects.create(
            project=project,
            task=action.issue.task,
            machine=machine,
            asset=machine.asset,
            start_at=timezone.now(),
            usage_hours=ZERO,
            hourly_rate=machine.hourly_rate or ZERO,
            total_cost=ZERO,
            status="ALLOCATED",
        )
    elif action.action_type == "ADD_LABOR":
        hours = action.additional_labor_hours or ZERO
        request = ResourceRequest.objects.create(
            document=create_business_document(source=project, document_type="RESOURCE_REQUEST", prefix="RR", user=user),
            project=project,
            task=action.issue.task,
            requested_by=user,
            request_date=timezone.localdate(),
            request_type="LABOR",
            priority="HIGH",
            approval_status="PENDING",
            status="PENDING_ALLOCATION",
        )
        ResourceRequestLine.objects.create(
            resource_request=request,
            resource_type="LABOR",
            requested_hours=hours,
            specification=action.description,
        )
        ProjectCostEntry.objects.create(
            tenant=project.tenant,
            company=project.company,
            project=project,
            source_type="OPERATIONAL_ISSUE",
            source_reference=str(action.id),
            description=f"Additional labor: {action.description}",
            cost_element="LABOR",
            transaction_date=timezone.localdate(),
            quantity=hours,
            unit_cost=ZERO,
            total_cost=ZERO,
            status="CAPTURED",
            created_by=user,
        )


def ensure_project_readiness_prerequisites(project, user=None):
    """
    Ensure all prerequisites (warehouse, stock balances, technical brief, 
    requirements, budget lines, material requirements) are provisioned 
    so the project can be verified and executed smoothly.
    """
    from apps.master_data.models import Warehouse, WarehouseLocation, Product
    from apps.inventory.models import StockBalance
    from apps.projects.models import TechnicalBrief, Requirement, BudgetLine, MaterialRequirement
    from apps.sales.models import OrderLine

    company = project.company
    if not company and project.sales_order:
        company = getattr(project.sales_order.document, "company", None)
        if company:
            project.company = company
            project.save(update_fields=["company"])

    # 1. Warehouse & Location
    warehouse = None
    if company:
        warehouse, _ = Warehouse.objects.get_or_create(
            company=company,
            warehouse_code="WH-MAIN",
            defaults={"warehouse_name": "Gudang Utama Fabrikasi", "status": "ACTIVE"},
        )
    if not warehouse:
        warehouse = Warehouse.objects.filter(status__in=["ACTIVE", "OPEN", ""]).first() or Warehouse.objects.first()

    location = None
    if warehouse:
        location, _ = WarehouseLocation.objects.get_or_create(
            warehouse=warehouse,
            location_code="LOC-STOCK",
            defaults={"location_name": "Area Stok Fabrikasi", "active": True, "quality_hold": False},
        )

    # 2. Technical Brief & Requirement
    brief = TechnicalBrief.objects.filter(project=project).first()
    if not brief:
        brief = TechnicalBrief.objects.create(
            document=create_business_document(source=project, document_type="TECHNICAL_BRIEF", prefix="BRF", user=user),
            project=project,
            sales_order=project.sales_order,
            brief_number=f"BRF-{project.project_code}",
            brief_title=project.project_name or f"Technical Brief {project.project_code}",
            objective=f"Pemenuhan project {project.project_code}",
            scope_summary="Scope teknis dan spesifikasi operasional.",
            owner_user=user or project.project_manager,
            approval_status="APPROVED",
            status="APPROVED",
        )
    req = Requirement.objects.filter(technical_brief__project=project).first()
    if not req:
        Requirement.objects.create(
            technical_brief=brief,
            requirement_code=f"REQ-{project.project_code[:6]}-01",
            requirement_type="PRODUCT",
            requirement_text=f"Spesifikasi fabrikasi {project.project_name}",
            priority="HIGH",
            status="APPROVED",
        )

    # 3. Budget Line
    if not BudgetLine.objects.filter(project=project).exists():
        BudgetLine.objects.create(
            project=project,
            cost_element="MATERIAL",
            budget_amount=project.budget_amount or Decimal("100000000"),
        )

    # 4. Material Requirement & Stock Balance
    default_prod = Product.objects.first()
    if project.sales_order:
        lines = OrderLine.objects.filter(sales_order=project.sales_order).select_related("product")
        for line in lines:
            prod = line.product or default_prod
            if prod:
                mat, _ = MaterialRequirement.objects.get_or_create(
                    project=project,
                    product=prod,
                    defaults={
                        "warehouse": warehouse,
                        "required_quantity": line.ordered_quantity or Decimal("1"),
                        "reserved_quantity": Decimal("0"),
                        "issued_quantity": Decimal("0"),
                        "status": "PLANNED",
                    },
                )
                if not mat.warehouse and warehouse:
                    mat.warehouse = warehouse
                    mat.save(update_fields=["warehouse"])

    for mat in MaterialRequirement.objects.filter(project=project):
        if not mat.product and default_prod:
            mat.product = default_prod
            mat.save(update_fields=["product"])
        if not mat.warehouse and warehouse:
            mat.warehouse = warehouse
            mat.save(update_fields=["warehouse"])

    # If no MaterialRequirement exists and sales order had no lines, create a default requirement
    if not MaterialRequirement.objects.filter(project=project).exists():
        if default_prod and warehouse:
            MaterialRequirement.objects.create(
                project=project,
                product=default_prod,
                warehouse=warehouse,
                required_quantity=Decimal("10"),
                reserved_quantity=Decimal("0"),
                issued_quantity=Decimal("0"),
                status="PLANNED",
            )


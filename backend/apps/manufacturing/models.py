"""
Generated Django models for Manufacturing.

Source: ERP Database ERD — 100% Information Architecture, 3 August 2026.
Review nullability, choices, indexes, and on_delete policies before production rollout.
"""

import uuid

from django.db import models


class BOM(models.Model):
    """ERD entity: MFG_BOM."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey("core.Tenant", on_delete=models.PROTECT, db_column="tenant_id", related_name="manufacturing_bom_tenant_set", null=True, blank=True)
    product = models.ForeignKey("master_data.Product", on_delete=models.PROTECT, db_column="product_id", related_name="manufacturing_bom_product_set", null=True, blank=True)
    bom_code = models.CharField(max_length=255, blank=True, default="")
    status = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        db_table = "mfg_bom"

    def __str__(self):
        return str(self.status)


class BOMVersion(models.Model):
    """ERD entity: MFG_BOM_VERSION."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    bom = models.ForeignKey("manufacturing.BOM", on_delete=models.PROTECT, db_column="bom_id", related_name="manufacturing_bomversion_bom_set", null=True, blank=True)
    version_number = models.IntegerField(null=True, blank=True)
    effective_from = models.DateField(null=True, blank=True)
    effective_to = models.DateField(null=True, blank=True)
    output_quantity = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    output_uom = models.ForeignKey("master_data.UOM", on_delete=models.PROTECT, db_column="output_uom_id", related_name="manufacturing_bomversion_output_uom_set", null=True, blank=True)
    status = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        db_table = "mfg_bom_version"

    def __str__(self):
        return str(self.status)


class BOMLine(models.Model):
    """ERD entity: MFG_BOM_LINE."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    bom_version = models.ForeignKey("manufacturing.BOMVersion", on_delete=models.PROTECT, db_column="bom_version_id", related_name="manufacturing_bomline_bom_version_set", null=True, blank=True)
    component_product = models.ForeignKey("master_data.Product", on_delete=models.PROTECT, db_column="component_product_id", related_name="manufacturing_bomline_component_product_set", null=True, blank=True)
    operation = models.ForeignKey("manufacturing.RoutingOperation", on_delete=models.PROTECT, db_column="operation_id", related_name="manufacturing_bomline_operation_set", null=True, blank=True)
    quantity = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    uom = models.ForeignKey("master_data.UOM", on_delete=models.PROTECT, db_column="uom_id", related_name="manufacturing_bomline_uom_set", null=True, blank=True)
    scrap_percent = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    issue_method = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        db_table = "mfg_bom_line"

    def __str__(self):
        return str(self.id)


class Routing(models.Model):
    """ERD entity: MFG_ROUTING."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey("core.Tenant", on_delete=models.PROTECT, db_column="tenant_id", related_name="manufacturing_routing_tenant_set", null=True, blank=True)
    routing_code = models.CharField(max_length=255, blank=True, default="")
    routing_name = models.CharField(max_length=255, blank=True, default="")
    status = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        db_table = "mfg_routing"

    def __str__(self):
        return str(self.status)


class RoutingOperation(models.Model):
    """ERD entity: MFG_ROUTING_OPERATION."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    routing = models.ForeignKey("manufacturing.Routing", on_delete=models.PROTECT, db_column="routing_id", related_name="manufacturing_routingoperation_routing_set", null=True, blank=True)
    work_center = models.ForeignKey("master_data.WorkCenter", on_delete=models.PROTECT, db_column="work_center_id", related_name="manufacturing_routingoperation_work_center_set", null=True, blank=True)
    sequence_number = models.IntegerField(null=True, blank=True)
    operation_name = models.CharField(max_length=255, blank=True, default="")
    setup_minutes = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    run_minutes_per_unit = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)

    class Meta:
        db_table = "mfg_routing_operation"

    def __str__(self):
        return str(self.id)


class ProductionOrder(models.Model):
    """ERD entity: MFG_PRODUCTION_ORDER."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    document = models.ForeignKey("core.BusinessDocument", on_delete=models.PROTECT, db_column="document_id", related_name="manufacturing_productionorder_document_set", null=True, blank=True)
    company = models.ForeignKey("core.Company", on_delete=models.PROTECT, db_column="company_id", related_name="manufacturing_productionorder_company_set", null=True, blank=True)
    product = models.ForeignKey("master_data.Product", on_delete=models.PROTECT, db_column="product_id", related_name="manufacturing_productionorder_product_set", null=True, blank=True)
    bom_version = models.ForeignKey("manufacturing.BOMVersion", on_delete=models.PROTECT, db_column="bom_version_id", related_name="manufacturing_productionorder_bom_version_set", null=True, blank=True)
    routing = models.ForeignKey("manufacturing.Routing", on_delete=models.PROTECT, db_column="routing_id", related_name="manufacturing_productionorder_routing_set", null=True, blank=True)
    project = models.ForeignKey("projects.Project", on_delete=models.PROTECT, db_column="project_id", related_name="manufacturing_productionorder_project_set", null=True, blank=True)
    sales_order_line = models.ForeignKey("sales.OrderLine", on_delete=models.PROTECT, db_column="sales_order_line_id", related_name="manufacturing_productionorder_sales_order_line_set", null=True, blank=True)
    warehouse = models.ForeignKey("master_data.Warehouse", on_delete=models.PROTECT, db_column="warehouse_id", related_name="manufacturing_productionorder_warehouse_set", null=True, blank=True)
    planned_quantity = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    completed_quantity = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    scrapped_quantity = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    planned_start_at = models.DateTimeField(null=True, blank=True)
    planned_end_at = models.DateTimeField(null=True, blank=True)
    actual_start_at = models.DateTimeField(null=True, blank=True)
    actual_end_at = models.DateTimeField(null=True, blank=True)
    material_status = models.CharField(max_length=255, blank=True, default="")
    quality_status = models.CharField(max_length=255, blank=True, default="")
    status = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        db_table = "mfg_production_order"

    def __str__(self):
        return str(self.status)


class ProductionMaterial(models.Model):
    """ERD entity: MFG_PRODUCTION_MATERIAL."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    production_order = models.ForeignKey("manufacturing.ProductionOrder", on_delete=models.PROTECT, db_column="production_order_id", related_name="manufacturing_productionmaterial_production_order_set", null=True, blank=True)
    product = models.ForeignKey("master_data.Product", on_delete=models.PROTECT, db_column="product_id", related_name="manufacturing_productionmaterial_product_set", null=True, blank=True)
    warehouse = models.ForeignKey("master_data.Warehouse", on_delete=models.PROTECT, db_column="warehouse_id", related_name="manufacturing_productionmaterial_warehouse_set", null=True, blank=True)
    required_quantity = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    reserved_quantity = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    issued_quantity = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    returned_quantity = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    actual_cost = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)

    class Meta:
        db_table = "mfg_production_material"

    def __str__(self):
        return str(self.id)


class WorkOrder(models.Model):
    """ERD entity: MFG_WORK_ORDER."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    document = models.ForeignKey("core.BusinessDocument", on_delete=models.PROTECT, db_column="document_id", related_name="manufacturing_workorder_document_set", null=True, blank=True)
    production_order = models.ForeignKey("manufacturing.ProductionOrder", on_delete=models.PROTECT, db_column="production_order_id", related_name="manufacturing_workorder_production_order_set", null=True, blank=True)
    routing_operation = models.ForeignKey("manufacturing.RoutingOperation", on_delete=models.PROTECT, db_column="routing_operation_id", related_name="manufacturing_workorder_routing_operation_set", null=True, blank=True)
    work_center = models.ForeignKey("master_data.WorkCenter", on_delete=models.PROTECT, db_column="work_center_id", related_name="manufacturing_workorder_work_center_set", null=True, blank=True)
    machine = models.ForeignKey("master_data.Machine", on_delete=models.PROTECT, db_column="machine_id", related_name="manufacturing_workorder_machine_set", null=True, blank=True)
    sequence_number = models.IntegerField(null=True, blank=True)
    planned_start_at = models.DateTimeField(null=True, blank=True)
    planned_end_at = models.DateTimeField(null=True, blank=True)
    actual_start_at = models.DateTimeField(null=True, blank=True)
    actual_end_at = models.DateTimeField(null=True, blank=True)
    planned_quantity = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    completed_quantity = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    rejected_quantity = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    status = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        db_table = "mfg_work_order"

    def __str__(self):
        return str(self.status)


class LaborLog(models.Model):
    """ERD entity: MFG_LABOR_LOG."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    work_order = models.ForeignKey("manufacturing.WorkOrder", on_delete=models.PROTECT, db_column="work_order_id", related_name="manufacturing_laborlog_work_order_set", null=True, blank=True)
    employee = models.ForeignKey("master_data.Employee", on_delete=models.PROTECT, db_column="employee_id", related_name="manufacturing_laborlog_employee_set", null=True, blank=True)
    project = models.ForeignKey("projects.Project", on_delete=models.PROTECT, db_column="project_id", related_name="manufacturing_laborlog_project_set", null=True, blank=True)
    start_at = models.DateTimeField(null=True, blank=True)
    end_at = models.DateTimeField(null=True, blank=True)
    duration_hours = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    hourly_rate = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    labor_cost = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)

    class Meta:
        db_table = "mfg_labor_log"

    def __str__(self):
        return str(self.id)


class MachineLog(models.Model):
    """ERD entity: MFG_MACHINE_LOG."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    work_order = models.ForeignKey("manufacturing.WorkOrder", on_delete=models.PROTECT, db_column="work_order_id", related_name="manufacturing_machinelog_work_order_set", null=True, blank=True)
    machine = models.ForeignKey("master_data.Machine", on_delete=models.PROTECT, db_column="machine_id", related_name="manufacturing_machinelog_machine_set", null=True, blank=True)
    project = models.ForeignKey("projects.Project", on_delete=models.PROTECT, db_column="project_id", related_name="manufacturing_machinelog_project_set", null=True, blank=True)
    start_at = models.DateTimeField(null=True, blank=True)
    end_at = models.DateTimeField(null=True, blank=True)
    run_hours = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    setup_hours = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    downtime_hours = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    hourly_rate = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    machine_cost = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)

    class Meta:
        db_table = "mfg_machine_log"

    def __str__(self):
        return str(self.id)


class ProductionOutput(models.Model):
    """ERD entity: MFG_PRODUCTION_OUTPUT."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    production_order = models.ForeignKey("manufacturing.ProductionOrder", on_delete=models.PROTECT, db_column="production_order_id", related_name="manufacturing_productionoutput_production_order_set", null=True, blank=True)
    product = models.ForeignKey("master_data.Product", on_delete=models.PROTECT, db_column="product_id", related_name="manufacturing_productionoutput_product_set", null=True, blank=True)
    lot = models.ForeignKey("inventory.Lot", on_delete=models.PROTECT, db_column="lot_id", related_name="manufacturing_productionoutput_lot_set", null=True, blank=True)
    output_quantity = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    unit_cost = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    total_cost = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    destination_location = models.ForeignKey("master_data.WarehouseLocation", on_delete=models.PROTECT, db_column="destination_location_id", related_name="manufacturing_productionoutput_destination_location_set", null=True, blank=True)
    produced_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "mfg_production_output"

    def __str__(self):
        return str(self.id)


class Scrap(models.Model):
    """ERD entity: MFG_SCRAP."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    production_order = models.ForeignKey("manufacturing.ProductionOrder", on_delete=models.PROTECT, db_column="production_order_id", related_name="manufacturing_scrap_production_order_set", null=True, blank=True)
    work_order = models.ForeignKey("manufacturing.WorkOrder", on_delete=models.PROTECT, db_column="work_order_id", related_name="manufacturing_scrap_work_order_set", null=True, blank=True)
    product = models.ForeignKey("master_data.Product", on_delete=models.PROTECT, db_column="product_id", related_name="manufacturing_scrap_product_set", null=True, blank=True)
    scrap_quantity = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    scrap_value = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    reason_code = models.CharField(max_length=255, blank=True, default="")
    disposition = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        db_table = "mfg_scrap"

    def __str__(self):
        return str(self.id)


class CostLedgerEntry(models.Model):
    """ERD entity: MFG_COST_LEDGER_ENTRY."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey("core.Company", on_delete=models.PROTECT, db_column="company_id", related_name="manufacturing_costledgerentry_company_set", null=True, blank=True)
    project = models.ForeignKey("projects.Project", on_delete=models.PROTECT, db_column="project_id", related_name="manufacturing_costledgerentry_project_set", null=True, blank=True)
    production_order = models.ForeignKey("manufacturing.ProductionOrder", on_delete=models.PROTECT, db_column="production_order_id", related_name="manufacturing_costledgerentry_production_order_set", null=True, blank=True)
    work_order = models.ForeignKey("manufacturing.WorkOrder", on_delete=models.PROTECT, db_column="work_order_id", related_name="manufacturing_costledgerentry_work_order_set", null=True, blank=True)
    product = models.ForeignKey("master_data.Product", on_delete=models.PROTECT, db_column="product_id", related_name="manufacturing_costledgerentry_product_set", null=True, blank=True)
    cost_element = models.CharField(max_length=255, blank=True, default="")
    quantity = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    rate = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    amount = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    stock_ledger_entry = models.ForeignKey("inventory.StockLedgerEntry", on_delete=models.PROTECT, db_column="stock_ledger_entry_id", related_name="manufacturing_costledgerentry_stock_ledger_entry_set", null=True, blank=True)
    journal_line = models.ForeignKey("finance.JournalLine", on_delete=models.PROTECT, db_column="journal_line_id", related_name="manufacturing_costledgerentry_journal_line_set", null=True, blank=True)
    source_document = models.ForeignKey("core.BusinessDocument", on_delete=models.PROTECT, db_column="source_document_id", related_name="manufacturing_costledgerentry_source_document_set", null=True, blank=True)
    posting_at = models.DateTimeField(null=True, blank=True)
    reversal_of = models.ForeignKey("manufacturing.CostLedgerEntry", on_delete=models.PROTECT, db_column="reversal_of_id", related_name="manufacturing_costledgerentry_reversal_of_set", null=True, blank=True)

    class Meta:
        db_table = "mfg_cost_ledger_entry"

    def __str__(self):
        return str(self.id)

"""
Generated Django models for Inventory.

Source: ERP Database ERD — 100% Information Architecture, 3 August 2026.
Review nullability, choices, indexes, and on_delete policies before production rollout.
"""

import uuid

from django.db import models


class Lot(models.Model):
    """ERD entity: INV_LOT."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    product = models.ForeignKey("master_data.Product", on_delete=models.PROTECT, db_column="product_id", related_name="inventory_lot_product_set", null=True, blank=True)
    lot_number = models.CharField(max_length=255, blank=True, default="")
    manufacture_date = models.DateField(null=True, blank=True)
    expiry_date = models.DateField(null=True, blank=True)
    quality_status = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        db_table = "inv_lot"

    def __str__(self):
        return str(self.id)


class SerialNumber(models.Model):
    """ERD entity: INV_SERIAL_NUMBER."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    product = models.ForeignKey("master_data.Product", on_delete=models.PROTECT, db_column="product_id", related_name="inventory_serialnumber_product_set", null=True, blank=True)
    serial_number = models.CharField(max_length=255, unique=True, blank=True, default="")
    current_location = models.ForeignKey("master_data.WarehouseLocation", on_delete=models.PROTECT, db_column="current_location_id", related_name="inventory_serialnumber_current_location_set", null=True, blank=True)
    status = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        db_table = "inv_serial_number"

    def __str__(self):
        return str(self.status)


class StockMove(models.Model):
    """ERD entity: INV_STOCK_MOVE."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    document = models.ForeignKey("core.BusinessDocument", on_delete=models.PROTECT, db_column="document_id", related_name="inventory_stockmove_document_set", null=True, blank=True)
    company = models.ForeignKey("core.Company", on_delete=models.PROTECT, db_column="company_id", related_name="inventory_stockmove_company_set", null=True, blank=True)
    move_type = models.CharField(max_length=255, blank=True, default="")
    source_location = models.ForeignKey("master_data.WarehouseLocation", on_delete=models.PROTECT, db_column="source_location_id", related_name="inventory_stockmove_source_location_set", null=True, blank=True)
    destination_location = models.ForeignKey("master_data.WarehouseLocation", on_delete=models.PROTECT, db_column="destination_location_id", related_name="inventory_stockmove_destination_location_set", null=True, blank=True)
    project = models.ForeignKey("projects.Project", on_delete=models.PROTECT, db_column="project_id", related_name="inventory_stockmove_project_set", null=True, blank=True)
    production_order = models.ForeignKey("manufacturing.ProductionOrder", on_delete=models.PROTECT, db_column="production_order_id", related_name="inventory_stockmove_production_order_set", null=True, blank=True)
    scheduled_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    status = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        db_table = "inv_stock_move"

    def __str__(self):
        return str(self.status)


class StockMoveLine(models.Model):
    """ERD entity: INV_STOCK_MOVE_LINE."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    stock_move = models.ForeignKey("inventory.StockMove", on_delete=models.PROTECT, db_column="stock_move_id", related_name="inventory_stockmoveline_stock_move_set", null=True, blank=True)
    product = models.ForeignKey("master_data.Product", on_delete=models.PROTECT, db_column="product_id", related_name="inventory_stockmoveline_product_set", null=True, blank=True)
    lot = models.ForeignKey("inventory.Lot", on_delete=models.PROTECT, db_column="lot_id", related_name="inventory_stockmoveline_lot_set", null=True, blank=True)
    serial_number = models.ForeignKey("inventory.SerialNumber", on_delete=models.PROTECT, db_column="serial_number_id", related_name="inventory_stockmoveline_serial_number_set", null=True, blank=True)
    quantity = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    uom = models.ForeignKey("master_data.UOM", on_delete=models.PROTECT, db_column="uom_id", related_name="inventory_stockmoveline_uom_set", null=True, blank=True)
    unit_cost = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    total_value = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)

    class Meta:
        db_table = "inv_stock_move_line"

    def __str__(self):
        return str(self.id)


class StockReservation(models.Model):
    """ERD entity: INV_STOCK_RESERVATION."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    product = models.ForeignKey("master_data.Product", on_delete=models.PROTECT, db_column="product_id", related_name="inventory_stockreservation_product_set", null=True, blank=True)
    warehouse_location = models.ForeignKey("master_data.WarehouseLocation", on_delete=models.PROTECT, db_column="warehouse_location_id", related_name="inventory_stockreservation_warehouse_location_set", null=True, blank=True)
    project = models.ForeignKey("projects.Project", on_delete=models.PROTECT, db_column="project_id", related_name="inventory_stockreservation_project_set", null=True, blank=True)
    sales_order_line = models.ForeignKey("sales.OrderLine", on_delete=models.PROTECT, db_column="sales_order_line_id", related_name="inventory_stockreservation_sales_order_line_set", null=True, blank=True)
    production_order = models.ForeignKey("manufacturing.ProductionOrder", on_delete=models.PROTECT, db_column="production_order_id", related_name="inventory_stockreservation_production_order_set", null=True, blank=True)
    reserved_quantity = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    required_date = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        db_table = "inv_stock_reservation"

    def __str__(self):
        return str(self.status)


class StockLedgerEntry(models.Model):
    """ERD entity: INV_STOCK_LEDGER_ENTRY."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey("core.Tenant", on_delete=models.PROTECT, db_column="tenant_id", related_name="inventory_stockledgerentry_tenant_set", null=True, blank=True)
    company = models.ForeignKey("core.Company", on_delete=models.PROTECT, db_column="company_id", related_name="inventory_stockledgerentry_company_set", null=True, blank=True)
    product = models.ForeignKey("master_data.Product", on_delete=models.PROTECT, db_column="product_id", related_name="inventory_stockledgerentry_product_set", null=True, blank=True)
    warehouse_location = models.ForeignKey("master_data.WarehouseLocation", on_delete=models.PROTECT, db_column="warehouse_location_id", related_name="inventory_stockledgerentry_warehouse_location_set", null=True, blank=True)
    lot = models.ForeignKey("inventory.Lot", on_delete=models.PROTECT, db_column="lot_id", related_name="inventory_stockledgerentry_lot_set", null=True, blank=True)
    serial_number = models.ForeignKey("inventory.SerialNumber", on_delete=models.PROTECT, db_column="serial_number_id", related_name="inventory_stockledgerentry_serial_number_set", null=True, blank=True)
    source_document = models.ForeignKey("core.BusinessDocument", on_delete=models.PROTECT, db_column="source_document_id", related_name="inventory_stockledgerentry_source_document_set", null=True, blank=True)
    source_line = models.ForeignKey("core.BusinessDocument", on_delete=models.PROTECT, db_column="source_line_id", related_name="inventory_stockledgerentry_source_line_set", null=True, blank=True)
    project = models.ForeignKey("projects.Project", on_delete=models.PROTECT, db_column="project_id", related_name="inventory_stockledgerentry_project_set", null=True, blank=True)
    production_order = models.ForeignKey("manufacturing.ProductionOrder", on_delete=models.PROTECT, db_column="production_order_id", related_name="inventory_stockledgerentry_production_order_set", null=True, blank=True)
    posting_at = models.DateTimeField(null=True, blank=True)
    quantity_delta = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    value_delta = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    unit_cost = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    balance_quantity = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    balance_value = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    reversal_of = models.ForeignKey("inventory.StockLedgerEntry", on_delete=models.PROTECT, db_column="reversal_of_id", related_name="inventory_stockledgerentry_reversal_of_set", null=True, blank=True)

    class Meta:
        db_table = "inv_stock_ledger_entry"

    def __str__(self):
        return str(self.id)


class StockBalance(models.Model):
    """ERD entity: INV_STOCK_BALANCE."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey("core.Company", on_delete=models.PROTECT, db_column="company_id", related_name="inventory_stockbalance_company_set", null=True, blank=True)
    product = models.ForeignKey("master_data.Product", on_delete=models.PROTECT, db_column="product_id", related_name="inventory_stockbalance_product_set", null=True, blank=True)
    warehouse_location = models.ForeignKey("master_data.WarehouseLocation", on_delete=models.PROTECT, db_column="warehouse_location_id", related_name="inventory_stockbalance_warehouse_location_set", null=True, blank=True)
    lot = models.ForeignKey("inventory.Lot", on_delete=models.PROTECT, db_column="lot_id", related_name="inventory_stockbalance_lot_set", null=True, blank=True)
    serial_number = models.ForeignKey("inventory.SerialNumber", on_delete=models.PROTECT, db_column="serial_number_id", related_name="inventory_stockbalance_serial_number_set", null=True, blank=True)
    on_hand_quantity = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    reserved_quantity = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    available_quantity = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    inventory_value = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    last_ledger_entry = models.ForeignKey("inventory.StockLedgerEntry", on_delete=models.PROTECT, db_column="last_ledger_entry_id", related_name="inventory_stockbalance_last_ledger_entry_set", null=True, blank=True)

    class Meta:
        db_table = "inv_stock_balance"

    def __str__(self):
        return str(self.id)


class ValuationLayer(models.Model):
    """ERD entity: INV_VALUATION_LAYER."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    product = models.ForeignKey("master_data.Product", on_delete=models.PROTECT, db_column="product_id", related_name="inventory_valuationlayer_product_set", null=True, blank=True)
    warehouse = models.ForeignKey("master_data.Warehouse", on_delete=models.PROTECT, db_column="warehouse_id", related_name="inventory_valuationlayer_warehouse_set", null=True, blank=True)
    receipt_ledger_entry = models.ForeignKey("inventory.StockLedgerEntry", on_delete=models.PROTECT, db_column="receipt_ledger_entry_id", related_name="inventory_valuationlayer_receipt_ledger_entry_set", null=True, blank=True)
    original_quantity = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    remaining_quantity = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    unit_cost = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    remaining_value = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    received_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "inv_valuation_layer"

    def __str__(self):
        return str(self.id)


class StockCount(models.Model):
    """ERD entity: INV_STOCK_COUNT."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    document = models.ForeignKey("core.BusinessDocument", on_delete=models.PROTECT, db_column="document_id", related_name="inventory_stockcount_document_set", null=True, blank=True)
    warehouse = models.ForeignKey("master_data.Warehouse", on_delete=models.PROTECT, db_column="warehouse_id", related_name="inventory_stockcount_warehouse_set", null=True, blank=True)
    count_date = models.DateField(null=True, blank=True)
    count_type = models.CharField(max_length=255, blank=True, default="")
    status = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        db_table = "inv_stock_count"

    def __str__(self):
        return str(self.status)


class StockCountLine(models.Model):
    """ERD entity: INV_STOCK_COUNT_LINE."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    stock_count = models.ForeignKey("inventory.StockCount", on_delete=models.PROTECT, db_column="stock_count_id", related_name="inventory_stockcountline_stock_count_set", null=True, blank=True)
    product = models.ForeignKey("master_data.Product", on_delete=models.PROTECT, db_column="product_id", related_name="inventory_stockcountline_product_set", null=True, blank=True)
    location = models.ForeignKey("master_data.WarehouseLocation", on_delete=models.PROTECT, db_column="location_id", related_name="inventory_stockcountline_location_set", null=True, blank=True)
    lot = models.ForeignKey("inventory.Lot", on_delete=models.PROTECT, db_column="lot_id", related_name="inventory_stockcountline_lot_set", null=True, blank=True)
    system_quantity = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    counted_quantity = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    variance_quantity = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    variance_value = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)

    class Meta:
        db_table = "inv_stock_count_line"

    def __str__(self):
        return str(self.id)

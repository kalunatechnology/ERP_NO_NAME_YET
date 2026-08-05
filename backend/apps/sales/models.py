"""
Generated Django models for Sales.

Source: ERP Database ERD — 100% Information Architecture, 3 August 2026.
Review nullability, choices, indexes, and on_delete policies before production rollout.
"""

import uuid

from django.db import models


class Quotation(models.Model):
    """ERD entity: SALES_QUOTATION."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    document = models.ForeignKey("core.BusinessDocument", on_delete=models.PROTECT, db_column="document_id", related_name="sales_quotation_document_set", null=True, blank=True)
    opportunity = models.ForeignKey("crm.Opportunity", on_delete=models.PROTECT, db_column="opportunity_id", related_name="sales_quotation_opportunity_set", null=True, blank=True)
    customer_party = models.ForeignKey("master_data.Party", on_delete=models.PROTECT, db_column="customer_party_id", related_name="sales_quotation_customer_party_set", null=True, blank=True)
    currency = models.ForeignKey("master_data.Currency", on_delete=models.PROTECT, db_column="currency_id", related_name="sales_quotation_currency_set", null=True, blank=True)
    payment_term = models.ForeignKey("master_data.PaymentTerm", on_delete=models.PROTECT, db_column="payment_term_id", related_name="sales_quotation_payment_term_set", null=True, blank=True)
    valid_until = models.DateField(null=True, blank=True)
    subtotal = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    tax_amount = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    total_amount = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    estimated_total_cost = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    estimated_margin = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    status = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        db_table = "sales_quotation"

    def __str__(self):
        return str(self.status)


class QuotationLine(models.Model):
    """ERD entity: SALES_QUOTATION_LINE."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    quotation = models.ForeignKey("sales.Quotation", on_delete=models.PROTECT, db_column="quotation_id", related_name="sales_quotationline_quotation_set", null=True, blank=True)
    product = models.ForeignKey("master_data.Product", on_delete=models.PROTECT, db_column="product_id", related_name="sales_quotationline_product_set", null=True, blank=True)
    description = models.CharField(max_length=255, blank=True, default="")
    quantity = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    uom = models.ForeignKey("master_data.UOM", on_delete=models.PROTECT, db_column="uom_id", related_name="sales_quotationline_uom_set", null=True, blank=True)
    unit_price = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    discount_amount = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    tax_code = models.ForeignKey("master_data.TaxCode", on_delete=models.PROTECT, db_column="tax_code_id", related_name="sales_quotationline_tax_code_set", null=True, blank=True)
    line_total = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)

    class Meta:
        db_table = "sales_quotation_line"

    def __str__(self):
        return str(self.id)


class QuotationCost(models.Model):
    """ERD entity: SALES_QUOTATION_COST."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    quotation_line = models.ForeignKey("sales.QuotationLine", on_delete=models.PROTECT, db_column="quotation_line_id", related_name="sales_quotationcost_quotation_line_set", null=True, blank=True)
    cost_element = models.CharField(max_length=255, blank=True, default="")
    quantity = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    rate = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    amount = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    calculation_source = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        db_table = "sales_quotation_cost"

    def __str__(self):
        return str(self.id)


class Contract(models.Model):
    """ERD entity: SALES_CONTRACT."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    document = models.ForeignKey("core.BusinessDocument", on_delete=models.PROTECT, db_column="document_id", related_name="sales_contract_document_set", null=True, blank=True)
    customer_party = models.ForeignKey("master_data.Party", on_delete=models.PROTECT, db_column="customer_party_id", related_name="sales_contract_customer_party_set", null=True, blank=True)
    contract_number = models.CharField(max_length=255, blank=True, default="")
    start_date = models.DateField(null=True, blank=True)
    end_date = models.DateField(null=True, blank=True)
    contract_type = models.CharField(max_length=255, blank=True, default="")
    billing_frequency = models.CharField(max_length=255, blank=True, default="")
    order_frequency = models.CharField(max_length=255, blank=True, default="")
    status = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        db_table = "sales_contract"

    def __str__(self):
        return str(self.status)


class ContractLine(models.Model):
    """ERD entity: SALES_CONTRACT_LINE."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    contract = models.ForeignKey("sales.Contract", on_delete=models.PROTECT, db_column="contract_id", related_name="sales_contractline_contract_set", null=True, blank=True)
    product = models.ForeignKey("master_data.Product", on_delete=models.PROTECT, db_column="product_id", related_name="sales_contractline_product_set", null=True, blank=True)
    contracted_quantity = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    unit_price = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    tax_code = models.ForeignKey("master_data.TaxCode", on_delete=models.PROTECT, db_column="tax_code_id", related_name="sales_contractline_tax_code_set", null=True, blank=True)
    recurrence_rule = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        db_table = "sales_contract_line"

    def __str__(self):
        return str(self.id)


class Order(models.Model):
    """ERD entity: SALES_ORDER."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    document = models.ForeignKey("core.BusinessDocument", on_delete=models.PROTECT, db_column="document_id", related_name="sales_order_document_set", null=True, blank=True)
    quotation = models.ForeignKey("sales.Quotation", on_delete=models.PROTECT, db_column="quotation_id", related_name="sales_order_quotation_set", null=True, blank=True)
    contract = models.ForeignKey("sales.Contract", on_delete=models.PROTECT, db_column="contract_id", related_name="sales_order_contract_set", null=True, blank=True)
    customer_party = models.ForeignKey("master_data.Party", on_delete=models.PROTECT, db_column="customer_party_id", related_name="sales_order_customer_party_set", null=True, blank=True)
    currency = models.ForeignKey("master_data.Currency", on_delete=models.PROTECT, db_column="currency_id", related_name="sales_order_currency_set", null=True, blank=True)
    payment_term = models.ForeignKey("master_data.PaymentTerm", on_delete=models.PROTECT, db_column="payment_term_id", related_name="sales_order_payment_term_set", null=True, blank=True)
    order_date = models.DateField(null=True, blank=True)
    requested_delivery_date = models.DateField(null=True, blank=True)
    subtotal = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    tax_amount = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    total_amount = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    status = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        db_table = "sales_order"

    def __str__(self):
        return str(self.status)


class OrderLine(models.Model):
    """ERD entity: SALES_ORDER_LINE."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    sales_order = models.ForeignKey("sales.Order", on_delete=models.PROTECT, db_column="sales_order_id", related_name="sales_orderline_sales_order_set", null=True, blank=True)
    product = models.ForeignKey("master_data.Product", on_delete=models.PROTECT, db_column="product_id", related_name="sales_orderline_product_set", null=True, blank=True)
    ordered_quantity = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    delivered_quantity = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    invoiced_quantity = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    uom = models.ForeignKey("master_data.UOM", on_delete=models.PROTECT, db_column="uom_id", related_name="sales_orderline_uom_set", null=True, blank=True)
    unit_price = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    tax_code = models.ForeignKey("master_data.TaxCode", on_delete=models.PROTECT, db_column="tax_code_id", related_name="sales_orderline_tax_code_set", null=True, blank=True)
    project = models.ForeignKey("projects.Project", on_delete=models.PROTECT, db_column="project_id", related_name="sales_orderline_project_set", null=True, blank=True)
    fulfillment_method = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        db_table = "sales_order_line"

    def __str__(self):
        return str(self.id)


class Delivery(models.Model):
    """ERD entity: SALES_DELIVERY."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    document = models.ForeignKey("core.BusinessDocument", on_delete=models.PROTECT, db_column="document_id", related_name="sales_delivery_document_set", null=True, blank=True)
    sales_order = models.ForeignKey("sales.Order", on_delete=models.PROTECT, db_column="sales_order_id", related_name="sales_delivery_sales_order_set", null=True, blank=True)
    customer_party = models.ForeignKey("master_data.Party", on_delete=models.PROTECT, db_column="customer_party_id", related_name="sales_delivery_customer_party_set", null=True, blank=True)
    warehouse = models.ForeignKey("master_data.Warehouse", on_delete=models.PROTECT, db_column="warehouse_id", related_name="sales_delivery_warehouse_set", null=True, blank=True)
    delivery_date = models.DateField(null=True, blank=True)
    delivery_status = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        db_table = "sales_delivery"

    def __str__(self):
        return str(self.id)


class DeliveryLine(models.Model):
    """ERD entity: SALES_DELIVERY_LINE."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    delivery = models.ForeignKey("sales.Delivery", on_delete=models.PROTECT, db_column="delivery_id", related_name="sales_deliveryline_delivery_set", null=True, blank=True)
    sales_order_line = models.ForeignKey("sales.OrderLine", on_delete=models.PROTECT, db_column="sales_order_line_id", related_name="sales_deliveryline_sales_order_line_set", null=True, blank=True)
    product = models.ForeignKey("master_data.Product", on_delete=models.PROTECT, db_column="product_id", related_name="sales_deliveryline_product_set", null=True, blank=True)
    lot = models.ForeignKey("inventory.Lot", on_delete=models.PROTECT, db_column="lot_id", related_name="sales_deliveryline_lot_set", null=True, blank=True)
    serial_number = models.ForeignKey("inventory.SerialNumber", on_delete=models.PROTECT, db_column="serial_number_id", related_name="sales_deliveryline_serial_number_set", null=True, blank=True)
    quantity = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    uom = models.ForeignKey("master_data.UOM", on_delete=models.PROTECT, db_column="uom_id", related_name="sales_deliveryline_uom_set", null=True, blank=True)

    class Meta:
        db_table = "sales_delivery_line"

    def __str__(self):
        return str(self.id)


class DemandSupplyLink(models.Model):
    """ERD entity: SALES_DEMAND_SUPPLY_LINK."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    sales_order_line = models.ForeignKey("sales.OrderLine", on_delete=models.PROTECT, db_column="sales_order_line_id", related_name="sales_demandsupplylink_sales_order_line_set", null=True, blank=True)
    project = models.ForeignKey("projects.Project", on_delete=models.PROTECT, db_column="project_id", related_name="sales_demandsupplylink_project_set", null=True, blank=True)
    production_order = models.ForeignKey("manufacturing.ProductionOrder", on_delete=models.PROTECT, db_column="production_order_id", related_name="sales_demandsupplylink_production_order_set", null=True, blank=True)
    purchase_order_line = models.ForeignKey("procurement.PurchaseOrderLine", on_delete=models.PROTECT, db_column="purchase_order_line_id", related_name="sales_demandsupplylink_purchase_order_line_set", null=True, blank=True)
    stock_reservation = models.ForeignKey("inventory.StockReservation", on_delete=models.PROTECT, db_column="stock_reservation_id", related_name="sales_demandsupplylink_stock_reservation_set", null=True, blank=True)
    demand_quantity = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    allocated_quantity = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    fulfilled_quantity = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    status = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        db_table = "sales_demand_supply_link"

    def __str__(self):
        return str(self.status)


class OrderChangeRequest(models.Model):
    """ERD entity: SALES_ORDER_CHANGE_REQUEST."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    document = models.ForeignKey("core.BusinessDocument", on_delete=models.PROTECT, db_column="document_id", related_name="sales_orderchangerequest_document_set", null=True, blank=True)
    sales_order = models.ForeignKey("sales.Order", on_delete=models.PROTECT, db_column="sales_order_id", related_name="sales_orderchangerequest_sales_order_set", null=True, blank=True)
    project = models.ForeignKey("projects.Project", on_delete=models.PROTECT, db_column="project_id", related_name="sales_orderchangerequest_project_set", null=True, blank=True)
    requested_by = models.ForeignKey("accounts.User", on_delete=models.PROTECT, db_column="requested_by", related_name="sales_orderchangerequest_requested_by_set", null=True, blank=True)
    change_type = models.CharField(max_length=255, blank=True, default="")
    change_reason = models.CharField(max_length=255, blank=True, default="")
    value_impact = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    schedule_impact_days = models.IntegerField(null=True, blank=True)
    approval_status = models.CharField(max_length=255, blank=True, default="")
    status = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        db_table = "sales_order_change_request"

    def __str__(self):
        return str(self.status)


class RecurringOrderRule(models.Model):
    """ERD entity: SALES_RECURRING_ORDER_RULE."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    contract = models.ForeignKey("sales.Contract", on_delete=models.PROTECT, db_column="contract_id", related_name="sales_recurringorderrule_contract_set", null=True, blank=True)
    customer_party = models.ForeignKey("master_data.Party", on_delete=models.PROTECT, db_column="customer_party_id", related_name="sales_recurringorderrule_customer_party_set", null=True, blank=True)
    source_sales_order = models.ForeignKey("sales.Order", on_delete=models.PROTECT, db_column="source_sales_order_id", related_name="sales_recurringorderrule_source_sales_order_set", null=True, blank=True)
    recurrence_rule = models.CharField(max_length=255, blank=True, default="")
    next_order_date = models.DateField(null=True, blank=True)
    end_date = models.DateField(null=True, blank=True)
    auto_create = models.BooleanField(default=False)
    approval_required = models.BooleanField(default=False)
    status = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        db_table = "sales_recurring_order_rule"

    def __str__(self):
        return str(self.status)


class RecurringOrderRun(models.Model):
    """ERD entity: SALES_RECURRING_ORDER_RUN."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    recurring_order_rule = models.ForeignKey("sales.RecurringOrderRule", on_delete=models.PROTECT, db_column="recurring_order_rule_id", related_name="sales_recurringorderrun_recurring_order_rule_set", null=True, blank=True)
    generated_sales_order = models.ForeignKey("sales.Order", on_delete=models.PROTECT, db_column="generated_sales_order_id", related_name="sales_recurringorderrun_generated_sales_order_set", null=True, blank=True)
    scheduled_date = models.DateField(null=True, blank=True)
    generated_at = models.DateTimeField(null=True, blank=True)
    run_status = models.CharField(max_length=255, blank=True, default="")
    failure_reason = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        db_table = "sales_recurring_order_run"

    def __str__(self):
        return str(self.id)

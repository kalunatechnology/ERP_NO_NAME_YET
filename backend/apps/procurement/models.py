"""
Generated Django models for Procurement.

Source: ERP Database ERD — 100% Information Architecture, 3 August 2026.
Review nullability, choices, indexes, and on_delete policies before production rollout.
"""

import uuid

from django.db import models


class PurchaseRequisition(models.Model):
    """ERD entity: PROC_PURCHASE_REQUISITION."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    document = models.ForeignKey("core.BusinessDocument", on_delete=models.PROTECT, db_column="document_id", related_name="procurement_purchaserequisition_document_set", null=True, blank=True)
    company = models.ForeignKey("core.Company", on_delete=models.PROTECT, db_column="company_id", related_name="procurement_purchaserequisition_company_set", null=True, blank=True)
    project = models.ForeignKey("projects.Project", on_delete=models.PROTECT, db_column="project_id", related_name="procurement_purchaserequisition_project_set", null=True, blank=True)
    requested_by = models.ForeignKey("accounts.User", on_delete=models.PROTECT, db_column="requested_by", related_name="procurement_purchaserequisition_requested_by_set", null=True, blank=True)
    request_date = models.DateField(null=True, blank=True)
    required_date = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        db_table = "proc_purchase_requisition"

    def __str__(self):
        return str(self.status)


class PurchaseRequisitionLine(models.Model):
    """ERD entity: PROC_PURCHASE_REQUISITION_LINE."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    requisition = models.ForeignKey("procurement.PurchaseRequisition", on_delete=models.PROTECT, db_column="requisition_id", related_name="procurement_purchaserequisitionline_requisition_set", null=True, blank=True)
    product = models.ForeignKey("master_data.Product", on_delete=models.PROTECT, db_column="product_id", related_name="procurement_purchaserequisitionline_product_set", null=True, blank=True)
    requested_quantity = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    uom = models.ForeignKey("master_data.UOM", on_delete=models.PROTECT, db_column="uom_id", related_name="procurement_purchaserequisitionline_uom_set", null=True, blank=True)
    warehouse = models.ForeignKey("master_data.Warehouse", on_delete=models.PROTECT, db_column="warehouse_id", related_name="procurement_purchaserequisitionline_warehouse_set", null=True, blank=True)
    project_material_requirement = models.ForeignKey("projects.MaterialRequirement", on_delete=models.PROTECT, db_column="project_material_requirement_id", related_name="procurement_purchaserequisitionline_project_material_requirement_set", null=True, blank=True)

    class Meta:
        db_table = "proc_purchase_requisition_line"

    def __str__(self):
        return str(self.id)


class RFQ(models.Model):
    """ERD entity: PROC_RFQ."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    document = models.ForeignKey("core.BusinessDocument", on_delete=models.PROTECT, db_column="document_id", related_name="procurement_rfq_document_set", null=True, blank=True)
    requisition = models.ForeignKey("procurement.PurchaseRequisition", on_delete=models.PROTECT, db_column="requisition_id", related_name="procurement_rfq_requisition_set", null=True, blank=True)
    issue_date = models.DateField(null=True, blank=True)
    closing_date = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        db_table = "proc_rfq"

    def __str__(self):
        return str(self.status)


class SupplierQuotation(models.Model):
    """ERD entity: PROC_SUPPLIER_QUOTATION."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    document = models.ForeignKey("core.BusinessDocument", on_delete=models.PROTECT, db_column="document_id", related_name="procurement_supplierquotation_document_set", null=True, blank=True)
    rfq = models.ForeignKey("procurement.RFQ", on_delete=models.PROTECT, db_column="rfq_id", related_name="procurement_supplierquotation_rfq_set", null=True, blank=True)
    supplier_party = models.ForeignKey("master_data.Party", on_delete=models.PROTECT, db_column="supplier_party_id", related_name="procurement_supplierquotation_supplier_party_set", null=True, blank=True)
    currency = models.ForeignKey("master_data.Currency", on_delete=models.PROTECT, db_column="currency_id", related_name="procurement_supplierquotation_currency_set", null=True, blank=True)
    quotation_date = models.DateField(null=True, blank=True)
    valid_until = models.DateField(null=True, blank=True)
    total_amount = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    evaluation_status = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        db_table = "proc_supplier_quotation"

    def __str__(self):
        return str(self.id)


class PurchaseOrder(models.Model):
    """ERD entity: PROC_PURCHASE_ORDER."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    document = models.ForeignKey("core.BusinessDocument", on_delete=models.PROTECT, db_column="document_id", related_name="procurement_purchaseorder_document_set", null=True, blank=True)
    supplier_quotation = models.ForeignKey("procurement.SupplierQuotation", on_delete=models.PROTECT, db_column="supplier_quotation_id", related_name="procurement_purchaseorder_supplier_quotation_set", null=True, blank=True)
    supplier_party = models.ForeignKey("master_data.Party", on_delete=models.PROTECT, db_column="supplier_party_id", related_name="procurement_purchaseorder_supplier_party_set", null=True, blank=True)
    currency = models.ForeignKey("master_data.Currency", on_delete=models.PROTECT, db_column="currency_id", related_name="procurement_purchaseorder_currency_set", null=True, blank=True)
    payment_term = models.ForeignKey("master_data.PaymentTerm", on_delete=models.PROTECT, db_column="payment_term_id", related_name="procurement_purchaseorder_payment_term_set", null=True, blank=True)
    order_date = models.DateField(null=True, blank=True)
    expected_receipt_date = models.DateField(null=True, blank=True)
    subtotal = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    tax_amount = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    total_amount = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    status = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        db_table = "proc_purchase_order"

    def __str__(self):
        return str(self.status)


class PurchaseOrderLine(models.Model):
    """ERD entity: PROC_PURCHASE_ORDER_LINE."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    purchase_order = models.ForeignKey("procurement.PurchaseOrder", on_delete=models.PROTECT, db_column="purchase_order_id", related_name="procurement_purchaseorderline_purchase_order_set", null=True, blank=True)
    requisition_line = models.ForeignKey("procurement.PurchaseRequisitionLine", on_delete=models.PROTECT, db_column="requisition_line_id", related_name="procurement_purchaseorderline_requisition_line_set", null=True, blank=True)
    product = models.ForeignKey("master_data.Product", on_delete=models.PROTECT, db_column="product_id", related_name="procurement_purchaseorderline_product_set", null=True, blank=True)
    ordered_quantity = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    received_quantity = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    invoiced_quantity = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    uom = models.ForeignKey("master_data.UOM", on_delete=models.PROTECT, db_column="uom_id", related_name="procurement_purchaseorderline_uom_set", null=True, blank=True)
    unit_price = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    tax_code = models.ForeignKey("master_data.TaxCode", on_delete=models.PROTECT, db_column="tax_code_id", related_name="procurement_purchaseorderline_tax_code_set", null=True, blank=True)
    project = models.ForeignKey("projects.Project", on_delete=models.PROTECT, db_column="project_id", related_name="procurement_purchaseorderline_project_set", null=True, blank=True)

    class Meta:
        db_table = "proc_purchase_order_line"

    def __str__(self):
        return str(self.id)


class GoodsReceipt(models.Model):
    """ERD entity: PROC_GOODS_RECEIPT."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    document = models.ForeignKey("core.BusinessDocument", on_delete=models.PROTECT, db_column="document_id", related_name="procurement_goodsreceipt_document_set", null=True, blank=True)
    purchase_order = models.ForeignKey("procurement.PurchaseOrder", on_delete=models.PROTECT, db_column="purchase_order_id", related_name="procurement_goodsreceipt_purchase_order_set", null=True, blank=True)
    supplier_party = models.ForeignKey("master_data.Party", on_delete=models.PROTECT, db_column="supplier_party_id", related_name="procurement_goodsreceipt_supplier_party_set", null=True, blank=True)
    warehouse = models.ForeignKey("master_data.Warehouse", on_delete=models.PROTECT, db_column="warehouse_id", related_name="procurement_goodsreceipt_warehouse_set", null=True, blank=True)
    receipt_date = models.DateField(null=True, blank=True)
    inspection_status = models.CharField(max_length=255, blank=True, default="")
    status = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        db_table = "proc_goods_receipt"

    def __str__(self):
        return str(self.status)


class GoodsReceiptLine(models.Model):
    """ERD entity: PROC_GOODS_RECEIPT_LINE."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    goods_receipt = models.ForeignKey("procurement.GoodsReceipt", on_delete=models.PROTECT, db_column="goods_receipt_id", related_name="procurement_goodsreceiptline_goods_receipt_set", null=True, blank=True)
    purchase_order_line = models.ForeignKey("procurement.PurchaseOrderLine", on_delete=models.PROTECT, db_column="purchase_order_line_id", related_name="procurement_goodsreceiptline_purchase_order_line_set", null=True, blank=True)
    product = models.ForeignKey("master_data.Product", on_delete=models.PROTECT, db_column="product_id", related_name="procurement_goodsreceiptline_product_set", null=True, blank=True)
    lot = models.ForeignKey("inventory.Lot", on_delete=models.PROTECT, db_column="lot_id", related_name="procurement_goodsreceiptline_lot_set", null=True, blank=True)
    serial_number = models.ForeignKey("inventory.SerialNumber", on_delete=models.PROTECT, db_column="serial_number_id", related_name="procurement_goodsreceiptline_serial_number_set", null=True, blank=True)
    received_quantity = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    accepted_quantity = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    rejected_quantity = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    uom = models.ForeignKey("master_data.UOM", on_delete=models.PROTECT, db_column="uom_id", related_name="procurement_goodsreceiptline_uom_set", null=True, blank=True)

    class Meta:
        db_table = "proc_goods_receipt_line"

    def __str__(self):
        return str(self.id)


class ThreeWayMatch(models.Model):
    """ERD entity: PROC_THREE_WAY_MATCH."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    purchase_order = models.ForeignKey("procurement.PurchaseOrder", on_delete=models.PROTECT, db_column="purchase_order_id", related_name="procurement_threewaymatch_purchase_order_set", null=True, blank=True)
    goods_receipt = models.ForeignKey("procurement.GoodsReceipt", on_delete=models.PROTECT, db_column="goods_receipt_id", related_name="procurement_threewaymatch_goods_receipt_set", null=True, blank=True)
    supplier_invoice = models.ForeignKey("finance.BillingDocument", on_delete=models.PROTECT, db_column="supplier_invoice_id", related_name="procurement_threewaymatch_supplier_invoice_set", null=True, blank=True)
    quantity_variance = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    price_variance = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    tax_variance = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    match_status = models.CharField(max_length=255, blank=True, default="")
    reviewed_by = models.ForeignKey("accounts.User", on_delete=models.PROTECT, db_column="reviewed_by", related_name="procurement_threewaymatch_reviewed_by_set", null=True, blank=True)
    reviewed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "proc_three_way_match"

    def __str__(self):
        return str(self.id)

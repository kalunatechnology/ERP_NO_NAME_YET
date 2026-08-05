"""
Generated Django models for Logistics.

Source: ERP Database ERD — 100% Information Architecture, 3 August 2026.
Review nullability, choices, indexes, and on_delete policies before production rollout.
"""

import uuid

from django.db import models


class Shipment(models.Model):
    """ERD entity: LOGISTICS_SHIPMENT."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    document = models.ForeignKey("core.BusinessDocument", on_delete=models.PROTECT, db_column="document_id", related_name="logistics_shipment_document_set", null=True, blank=True)
    delivery = models.ForeignKey("sales.Delivery", on_delete=models.PROTECT, db_column="delivery_id", related_name="logistics_shipment_delivery_set", null=True, blank=True)
    sales_order = models.ForeignKey("sales.Order", on_delete=models.PROTECT, db_column="sales_order_id", related_name="logistics_shipment_sales_order_set", null=True, blank=True)
    customer_party = models.ForeignKey("master_data.Party", on_delete=models.PROTECT, db_column="customer_party_id", related_name="logistics_shipment_customer_party_set", null=True, blank=True)
    shipment_number = models.CharField(max_length=255, blank=True, default="")
    carrier_name = models.CharField(max_length=255, blank=True, default="")
    tracking_number = models.CharField(max_length=255, blank=True, default="")
    planned_dispatch_at = models.DateTimeField(null=True, blank=True)
    actual_dispatch_at = models.DateTimeField(null=True, blank=True)
    estimated_arrival_at = models.DateTimeField(null=True, blank=True)
    delivered_at = models.DateTimeField(null=True, blank=True)
    shipment_status = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        db_table = "logistics_shipment"

    def __str__(self):
        return str(self.id)


class ShipmentLine(models.Model):
    """ERD entity: LOGISTICS_SHIPMENT_LINE."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    shipment = models.ForeignKey("logistics.Shipment", on_delete=models.PROTECT, db_column="shipment_id", related_name="logistics_shipmentline_shipment_set", null=True, blank=True)
    delivery_line = models.ForeignKey("sales.DeliveryLine", on_delete=models.PROTECT, db_column="delivery_line_id", related_name="logistics_shipmentline_delivery_line_set", null=True, blank=True)
    product = models.ForeignKey("master_data.Product", on_delete=models.PROTECT, db_column="product_id", related_name="logistics_shipmentline_product_set", null=True, blank=True)
    shipped_quantity = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    uom = models.ForeignKey("master_data.UOM", on_delete=models.PROTECT, db_column="uom_id", related_name="logistics_shipmentline_uom_set", null=True, blank=True)

    class Meta:
        db_table = "logistics_shipment_line"

    def __str__(self):
        return str(self.id)


class TrackingEvent(models.Model):
    """ERD entity: LOGISTICS_TRACKING_EVENT."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    shipment = models.ForeignKey("logistics.Shipment", on_delete=models.PROTECT, db_column="shipment_id", related_name="logistics_trackingevent_shipment_set", null=True, blank=True)
    event_code = models.CharField(max_length=255, blank=True, default="")
    event_description = models.CharField(max_length=255, blank=True, default="")
    location_text = models.CharField(max_length=255, blank=True, default="")
    latitude = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    longitude = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    event_at = models.DateTimeField(null=True, blank=True)
    source_system = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        db_table = "logistics_tracking_event"

    def __str__(self):
        return str(self.id)


class ProofOfDelivery(models.Model):
    """ERD entity: LOGISTICS_PROOF_OF_DELIVERY."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    shipment = models.ForeignKey("logistics.Shipment", on_delete=models.PROTECT, db_column="shipment_id", related_name="logistics_proofofdelivery_shipment_set", null=True, blank=True)
    received_by_party = models.ForeignKey("master_data.Party", on_delete=models.PROTECT, db_column="received_by_party_id", related_name="logistics_proofofdelivery_received_by_party_set", null=True, blank=True)
    signature_file = models.ForeignKey("core.File", on_delete=models.PROTECT, db_column="signature_file_id", related_name="logistics_proofofdelivery_signature_file_set", null=True, blank=True)
    photo_file = models.ForeignKey("core.File", on_delete=models.PROTECT, db_column="photo_file_id", related_name="logistics_proofofdelivery_photo_file_set", null=True, blank=True)
    receiver_name = models.CharField(max_length=255, blank=True, default="")
    received_at = models.DateTimeField(null=True, blank=True)
    remarks = models.CharField(max_length=255, blank=True, default="")
    verification_status = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        db_table = "logistics_proof_of_delivery"

    def __str__(self):
        return str(self.id)

"""
Generated Django models for Fixed Assets.

Source: ERP Database ERD — 100% Information Architecture, 3 August 2026.
Review nullability, choices, indexes, and on_delete policies before production rollout.
"""

import uuid

from django.db import models


class Category(models.Model):
    """ERD entity: ASSET_CATEGORY."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey("core.Company", on_delete=models.PROTECT, db_column="company_id", related_name="assets_category_company_set", null=True, blank=True)
    category_code = models.CharField(max_length=255, blank=True, default="")
    category_name = models.CharField(max_length=255, blank=True, default="")
    asset_account = models.ForeignKey("finance.Account", on_delete=models.PROTECT, db_column="asset_account_id", related_name="assets_category_asset_account_set", null=True, blank=True)
    accumulated_depreciation_account = models.ForeignKey("finance.Account", on_delete=models.PROTECT, db_column="accumulated_depreciation_account_id", related_name="assets_category_accumulated_depreciation_account_set", null=True, blank=True)
    depreciation_expense_account = models.ForeignKey("finance.Account", on_delete=models.PROTECT, db_column="depreciation_expense_account_id", related_name="assets_category_depreciation_expense_account_set", null=True, blank=True)

    class Meta:
        db_table = "asset_category"

    def __str__(self):
        return str(self.id)


class Asset(models.Model):
    """ERD entity: ASSET_ASSET."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    document = models.ForeignKey("core.BusinessDocument", on_delete=models.PROTECT, db_column="document_id", related_name="assets_asset_document_set", null=True, blank=True)
    company = models.ForeignKey("core.Company", on_delete=models.PROTECT, db_column="company_id", related_name="assets_asset_company_set", null=True, blank=True)
    category = models.ForeignKey("master_data.ProductCategory", on_delete=models.PROTECT, db_column="category_id", related_name="assets_asset_category_set", null=True, blank=True)
    supplier_party = models.ForeignKey("master_data.Party", on_delete=models.PROTECT, db_column="supplier_party_id", related_name="assets_asset_supplier_party_set", null=True, blank=True)
    warehouse_location = models.ForeignKey("master_data.WarehouseLocation", on_delete=models.PROTECT, db_column="warehouse_location_id", related_name="assets_asset_warehouse_location_set", null=True, blank=True)
    department = models.ForeignKey("master_data.Department", on_delete=models.PROTECT, db_column="department_id", related_name="assets_asset_department_set", null=True, blank=True)
    project = models.ForeignKey("projects.Project", on_delete=models.PROTECT, db_column="project_id", related_name="assets_asset_project_set", null=True, blank=True)
    asset_code = models.CharField(max_length=255, blank=True, default="")
    asset_name = models.CharField(max_length=255, blank=True, default="")
    serial_number = models.CharField(max_length=255, blank=True, default="")
    acquisition_date = models.DateField(null=True, blank=True)
    available_for_use_date = models.DateField(null=True, blank=True)
    acquisition_cost = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    salvage_value = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    useful_life_months = models.IntegerField(null=True, blank=True)
    status = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        db_table = "asset_asset"

    def __str__(self):
        return str(self.status)


class Book(models.Model):
    """ERD entity: ASSET_BOOK."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    asset = models.ForeignKey("assets.Asset", on_delete=models.PROTECT, db_column="asset_id", related_name="assets_book_asset_set", null=True, blank=True)
    book_type = models.CharField(max_length=255, blank=True, default="")
    depreciation_method = models.CharField(max_length=255, blank=True, default="")
    cost_basis = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    salvage_value = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    useful_life_periods = models.IntegerField(null=True, blank=True)
    depreciation_start_date = models.DateField(null=True, blank=True)
    accumulated_depreciation = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    net_book_value = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)

    class Meta:
        db_table = "asset_book"

    def __str__(self):
        return str(self.id)


class DepreciationLine(models.Model):
    """ERD entity: ASSET_DEPRECIATION_LINE."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    asset_book = models.ForeignKey("assets.Book", on_delete=models.PROTECT, db_column="asset_book_id", related_name="assets_depreciationline_asset_book_set", null=True, blank=True)
    fiscal_period = models.ForeignKey("finance.FiscalPeriod", on_delete=models.PROTECT, db_column="fiscal_period_id", related_name="assets_depreciationline_fiscal_period_set", null=True, blank=True)
    depreciation_date = models.DateField(null=True, blank=True)
    opening_book_value = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    depreciation_amount = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    accumulated_depreciation = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    closing_book_value = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    journal_entry = models.ForeignKey("finance.JournalEntry", on_delete=models.PROTECT, db_column="journal_entry_id", related_name="assets_depreciationline_journal_entry_set", null=True, blank=True)
    status = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        db_table = "asset_depreciation_line"

    def __str__(self):
        return str(self.status)


class Maintenance(models.Model):
    """ERD entity: ASSET_MAINTENANCE."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    asset = models.ForeignKey("assets.Asset", on_delete=models.PROTECT, db_column="asset_id", related_name="assets_maintenance_asset_set", null=True, blank=True)
    machine = models.ForeignKey("master_data.Machine", on_delete=models.PROTECT, db_column="machine_id", related_name="assets_maintenance_machine_set", null=True, blank=True)
    scheduled_date = models.DateField(null=True, blank=True)
    completed_date = models.DateField(null=True, blank=True)
    maintenance_type = models.CharField(max_length=255, blank=True, default="")
    maintenance_cost = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    status = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        db_table = "asset_maintenance"

    def __str__(self):
        return str(self.status)


class Disposal(models.Model):
    """ERD entity: ASSET_DISPOSAL."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    document = models.ForeignKey("core.BusinessDocument", on_delete=models.PROTECT, db_column="document_id", related_name="assets_disposal_document_set", null=True, blank=True)
    asset = models.ForeignKey("assets.Asset", on_delete=models.PROTECT, db_column="asset_id", related_name="assets_disposal_asset_set", null=True, blank=True)
    disposal_date = models.DateField(null=True, blank=True)
    disposal_proceeds = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    net_book_value = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    gain_or_loss = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    journal_entry = models.ForeignKey("finance.JournalEntry", on_delete=models.PROTECT, db_column="journal_entry_id", related_name="assets_disposal_journal_entry_set", null=True, blank=True)
    status = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        db_table = "asset_disposal"

    def __str__(self):
        return str(self.status)

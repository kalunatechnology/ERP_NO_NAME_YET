"""
Generated Django models for Shared Master Data.

Source: ERP Database ERD — 100% Information Architecture, 3 August 2026.
Review nullability, choices, indexes, and on_delete policies before production rollout.
"""

import uuid

from django.db import models


class Party(models.Model):
    """ERD entity: MASTER_PARTY."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey("core.Tenant", on_delete=models.PROTECT, db_column="tenant_id", related_name="master_data_party_tenant_set", null=True, blank=True)
    party_code = models.CharField(max_length=255, blank=True, default="")
    party_type = models.CharField(max_length=255, blank=True, default="")
    legal_name = models.CharField(max_length=255, blank=True, default="")
    display_name = models.CharField(max_length=255, blank=True, default="")
    tax_number = models.CharField(max_length=255, blank=True, default="")
    default_currency = models.ForeignKey("master_data.Currency", on_delete=models.PROTECT, db_column="default_currency_id", related_name="master_data_party_default_currency_set", null=True, blank=True)
    status = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        db_table = "master_party"

    def __str__(self):
        return str(self.legal_name)


class PartyRole(models.Model):
    """ERD entity: MASTER_PARTY_ROLE."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    party = models.ForeignKey("master_data.Party", on_delete=models.PROTECT, db_column="party_id", related_name="master_data_partyrole_party_set", null=True, blank=True)
    role_type = models.CharField(max_length=255, blank=True, default="")
    valid_from = models.DateField(null=True, blank=True)
    valid_to = models.DateField(null=True, blank=True)
    active = models.BooleanField(default=False)

    class Meta:
        db_table = "master_party_role"

    def __str__(self):
        return str(self.id)


class Contact(models.Model):
    """ERD entity: MASTER_CONTACT."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    party = models.ForeignKey("master_data.Party", on_delete=models.PROTECT, db_column="party_id", related_name="master_data_contact_party_set", null=True, blank=True)
    contact_name = models.CharField(max_length=255, blank=True, default="")
    job_title = models.CharField(max_length=255, blank=True, default="")
    email = models.CharField(max_length=255, blank=True, default="")
    phone = models.CharField(max_length=255, blank=True, default="")
    primary_contact = models.BooleanField(default=False)

    class Meta:
        db_table = "master_contact"

    def __str__(self):
        return str(self.email)


class Address(models.Model):
    """ERD entity: MASTER_ADDRESS."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    party = models.ForeignKey("master_data.Party", on_delete=models.PROTECT, db_column="party_id", related_name="master_data_address_party_set", null=True, blank=True)
    address_type = models.CharField(max_length=255, blank=True, default="")
    address_line = models.CharField(max_length=255, blank=True, default="")
    city = models.CharField(max_length=255, blank=True, default="")
    province = models.CharField(max_length=255, blank=True, default="")
    postal_code = models.CharField(max_length=255, blank=True, default="")
    country_code = models.CharField(max_length=255, blank=True, default="")
    primary_address = models.BooleanField(default=False)

    class Meta:
        db_table = "master_address"

    def __str__(self):
        return str(self.id)


class CustomerProfile(models.Model):
    """ERD entity: MASTER_CUSTOMER_PROFILE."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    party = models.ForeignKey("master_data.Party", on_delete=models.PROTECT, db_column="party_id", related_name="master_data_customerprofile_party_set", null=True, blank=True)
    customer_code = models.CharField(max_length=255, blank=True, default="")
    credit_limit = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    credit_hold = models.BooleanField(default=False)
    payment_term = models.ForeignKey("master_data.PaymentTerm", on_delete=models.PROTECT, db_column="payment_term_id", related_name="master_data_customerprofile_payment_term_set", null=True, blank=True)
    price_list_id = models.UUIDField(null=True, blank=True)
    receivable_account = models.ForeignKey("finance.Account", on_delete=models.PROTECT, db_column="receivable_account_id", related_name="master_data_customerprofile_receivable_account_set", null=True, blank=True)
    risk_category = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        db_table = "master_customer_profile"

    def __str__(self):
        return str(self.id)


class SupplierProfile(models.Model):
    """ERD entity: MASTER_SUPPLIER_PROFILE."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    party = models.ForeignKey("master_data.Party", on_delete=models.PROTECT, db_column="party_id", related_name="master_data_supplierprofile_party_set", null=True, blank=True)
    supplier_code = models.CharField(max_length=255, blank=True, default="")
    payment_term = models.ForeignKey("master_data.PaymentTerm", on_delete=models.PROTECT, db_column="payment_term_id", related_name="master_data_supplierprofile_payment_term_set", null=True, blank=True)
    lead_time_days = models.IntegerField(null=True, blank=True)
    minimum_order_value = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    payable_account = models.ForeignKey("finance.Account", on_delete=models.PROTECT, db_column="payable_account_id", related_name="master_data_supplierprofile_payable_account_set", null=True, blank=True)
    approved_supplier = models.BooleanField(default=False)

    class Meta:
        db_table = "master_supplier_profile"

    def __str__(self):
        return str(self.id)


class ProductCategory(models.Model):
    """ERD entity: MASTER_PRODUCT_CATEGORY."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey("core.Tenant", on_delete=models.PROTECT, db_column="tenant_id", related_name="master_data_productcategory_tenant_set", null=True, blank=True)
    parent = models.ForeignKey("master_data.ProductCategory", on_delete=models.PROTECT, db_column="parent_id", related_name="master_data_productcategory_parent_set", null=True, blank=True)
    category_code = models.CharField(max_length=255, blank=True, default="")
    category_name = models.CharField(max_length=255, blank=True, default="")
    status = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        db_table = "master_product_category"

    def __str__(self):
        return str(self.status)


class UOM(models.Model):
    """ERD entity: MASTER_UOM."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey("core.Tenant", on_delete=models.PROTECT, db_column="tenant_id", related_name="master_data_uom_tenant_set", null=True, blank=True)
    uom_code = models.CharField(max_length=255, blank=True, default="")
    uom_name = models.CharField(max_length=255, blank=True, default="")
    dimension_type = models.CharField(max_length=255, blank=True, default="")
    base_uom = models.BooleanField(default=False)

    class Meta:
        db_table = "master_uom"

    def __str__(self):
        return str(self.id)


class Product(models.Model):
    """ERD entity: MASTER_PRODUCT."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey("core.Tenant", on_delete=models.PROTECT, db_column="tenant_id", related_name="master_data_product_tenant_set", null=True, blank=True)
    category = models.ForeignKey("master_data.ProductCategory", on_delete=models.PROTECT, db_column="category_id", related_name="master_data_product_category_set", null=True, blank=True)
    base_uom = models.ForeignKey("master_data.UOM", on_delete=models.PROTECT, db_column="base_uom_id", related_name="master_data_product_base_uom_set", null=True, blank=True)
    product_code = models.CharField(max_length=255, blank=True, default="")
    product_name = models.CharField(max_length=255, blank=True, default="")
    product_type = models.CharField(max_length=255, blank=True, default="")
    costing_method = models.CharField(max_length=255, blank=True, default="")
    stock_item = models.BooleanField(default=False)
    purchase_item = models.BooleanField(default=False)
    sales_item = models.BooleanField(default=False)
    manufactured_item = models.BooleanField(default=False)
    lot_controlled = models.BooleanField(default=False)
    serial_controlled = models.BooleanField(default=False)
    status = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        db_table = "master_product"

    def __str__(self):
        return str(self.product_name)


class Currency(models.Model):
    """ERD entity: MASTER_CURRENCY."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    currency_code = models.CharField(max_length=255, unique=True, blank=True, default="")
    currency_name = models.CharField(max_length=255, blank=True, default="")
    symbol = models.CharField(max_length=255, blank=True, default="")
    decimal_places = models.IntegerField(null=True, blank=True)

    class Meta:
        db_table = "master_currency"

    def __str__(self):
        return str(self.id)


class ExchangeRate(models.Model):
    """ERD entity: MASTER_EXCHANGE_RATE."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey("core.Company", on_delete=models.PROTECT, db_column="company_id", related_name="master_data_exchangerate_company_set", null=True, blank=True)
    from_currency = models.ForeignKey("master_data.Currency", on_delete=models.PROTECT, db_column="from_currency_id", related_name="master_data_exchangerate_from_currency_set", null=True, blank=True)
    to_currency = models.ForeignKey("master_data.Currency", on_delete=models.PROTECT, db_column="to_currency_id", related_name="master_data_exchangerate_to_currency_set", null=True, blank=True)
    rate_date = models.DateField(null=True, blank=True)
    exchange_rate = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    rate_source = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        db_table = "master_exchange_rate"

    def __str__(self):
        return str(self.id)


class PaymentTerm(models.Model):
    """ERD entity: MASTER_PAYMENT_TERM."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey("core.Tenant", on_delete=models.PROTECT, db_column="tenant_id", related_name="master_data_paymentterm_tenant_set", null=True, blank=True)
    term_code = models.CharField(max_length=255, blank=True, default="")
    term_name = models.CharField(max_length=255, blank=True, default="")
    due_days = models.IntegerField(null=True, blank=True)
    early_discount_percent = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    early_discount_days = models.IntegerField(null=True, blank=True)

    class Meta:
        db_table = "master_payment_term"

    def __str__(self):
        return str(self.id)


class TaxCode(models.Model):
    """ERD entity: MASTER_TAX_CODE."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey("core.Tenant", on_delete=models.PROTECT, db_column="tenant_id", related_name="master_data_taxcode_tenant_set", null=True, blank=True)
    tax_code = models.CharField(max_length=255, blank=True, default="")
    tax_name = models.CharField(max_length=255, blank=True, default="")
    tax_type = models.CharField(max_length=255, blank=True, default="")
    tax_rate = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    effective_from = models.DateField(null=True, blank=True)
    effective_to = models.DateField(null=True, blank=True)
    input_account = models.ForeignKey("finance.Account", on_delete=models.PROTECT, db_column="input_account_id", related_name="master_data_taxcode_input_account_set", null=True, blank=True)
    output_account = models.ForeignKey("finance.Account", on_delete=models.PROTECT, db_column="output_account_id", related_name="master_data_taxcode_output_account_set", null=True, blank=True)

    class Meta:
        db_table = "master_tax_code"

    def __str__(self):
        return str(self.id)


class CostCenter(models.Model):
    """ERD entity: MASTER_COST_CENTER."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey("core.Company", on_delete=models.PROTECT, db_column="company_id", related_name="master_data_costcenter_company_set", null=True, blank=True)
    parent = models.ForeignKey("master_data.CostCenter", on_delete=models.PROTECT, db_column="parent_id", related_name="master_data_costcenter_parent_set", null=True, blank=True)
    cost_center_code = models.CharField(max_length=255, blank=True, default="")
    cost_center_name = models.CharField(max_length=255, blank=True, default="")
    status = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        db_table = "master_cost_center"

    def __str__(self):
        return str(self.status)


class Department(models.Model):
    """ERD entity: MASTER_DEPARTMENT."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey("core.Company", on_delete=models.PROTECT, db_column="company_id", related_name="master_data_department_company_set", null=True, blank=True)
    parent = models.ForeignKey("master_data.Department", on_delete=models.PROTECT, db_column="parent_id", related_name="master_data_department_parent_set", null=True, blank=True)
    department_code = models.CharField(max_length=255, blank=True, default="")
    department_name = models.CharField(max_length=255, blank=True, default="")
    status = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        db_table = "master_department"

    def __str__(self):
        return str(self.status)


class Employee(models.Model):
    """ERD entity: MASTER_EMPLOYEE."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey("core.Tenant", on_delete=models.PROTECT, db_column="tenant_id", related_name="master_data_employee_tenant_set", null=True, blank=True)
    party = models.ForeignKey("master_data.Party", on_delete=models.PROTECT, db_column="party_id", related_name="master_data_employee_party_set", null=True, blank=True)
    department = models.ForeignKey("master_data.Department", on_delete=models.PROTECT, db_column="department_id", related_name="master_data_employee_department_set", null=True, blank=True)
    employee_number = models.CharField(max_length=255, blank=True, default="")
    employment_status = models.CharField(max_length=255, blank=True, default="")
    standard_hourly_rate = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)

    class Meta:
        db_table = "master_employee"

    def __str__(self):
        return str(self.id)


class Warehouse(models.Model):
    """ERD entity: MASTER_WAREHOUSE."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey("core.Company", on_delete=models.PROTECT, db_column="company_id", related_name="master_data_warehouse_company_set", null=True, blank=True)
    warehouse_code = models.CharField(max_length=255, blank=True, default="")
    warehouse_name = models.CharField(max_length=255, blank=True, default="")
    warehouse_type = models.CharField(max_length=255, blank=True, default="")
    status = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        db_table = "master_warehouse"

    def __str__(self):
        return str(self.status)


class WarehouseLocation(models.Model):
    """ERD entity: MASTER_WAREHOUSE_LOCATION."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    warehouse = models.ForeignKey("master_data.Warehouse", on_delete=models.PROTECT, db_column="warehouse_id", related_name="master_data_warehouselocation_warehouse_set", null=True, blank=True)
    parent = models.ForeignKey("master_data.WarehouseLocation", on_delete=models.PROTECT, db_column="parent_id", related_name="master_data_warehouselocation_parent_set", null=True, blank=True)
    location_code = models.CharField(max_length=255, blank=True, default="")
    location_name = models.CharField(max_length=255, blank=True, default="")
    location_type = models.CharField(max_length=255, blank=True, default="")
    quality_hold = models.BooleanField(default=False)
    active = models.BooleanField(default=False)

    class Meta:
        db_table = "master_warehouse_location"

    def __str__(self):
        return str(self.id)


class WorkCenter(models.Model):
    """ERD entity: MASTER_WORK_CENTER."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey("core.Company", on_delete=models.PROTECT, db_column="company_id", related_name="master_data_workcenter_company_set", null=True, blank=True)
    work_center_code = models.CharField(max_length=255, blank=True, default="")
    work_center_name = models.CharField(max_length=255, blank=True, default="")
    hourly_rate = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    capacity_per_day = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    status = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        db_table = "master_work_center"

    def __str__(self):
        return str(self.status)


class Machine(models.Model):
    """ERD entity: MASTER_MACHINE."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey("core.Company", on_delete=models.PROTECT, db_column="company_id", related_name="master_data_machine_company_set", null=True, blank=True)
    work_center = models.ForeignKey("master_data.WorkCenter", on_delete=models.PROTECT, db_column="work_center_id", related_name="master_data_machine_work_center_set", null=True, blank=True)
    asset = models.ForeignKey("assets.Asset", on_delete=models.PROTECT, db_column="asset_id", related_name="master_data_machine_asset_set", null=True, blank=True)
    machine_code = models.CharField(max_length=255, blank=True, default="")
    machine_name = models.CharField(max_length=255, blank=True, default="")
    hourly_rate = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    status = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        db_table = "master_machine"

    def __str__(self):
        return str(self.status)

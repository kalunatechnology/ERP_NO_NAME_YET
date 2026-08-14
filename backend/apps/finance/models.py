"""
Generated Django models for Accounting and Finance.

Source: ERP Database ERD — 100% Information Architecture, 3 August 2026.
Review nullability, choices, indexes, and on_delete policies before production rollout.
"""

import uuid

from django.db import models


class FiscalYear(models.Model):
    """ERD entity: FIN_FISCAL_YEAR."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey("core.Company", on_delete=models.PROTECT, db_column="company_id", related_name="finance_fiscalyear_company_set", null=True, blank=True)
    fiscal_year_name = models.CharField(max_length=255, blank=True, default="")
    start_date = models.DateField(null=True, blank=True)
    end_date = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        db_table = "fin_fiscal_year"

    def __str__(self):
        return str(self.status)


class FiscalPeriod(models.Model):
    """ERD entity: FIN_FISCAL_PERIOD."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    fiscal_year = models.ForeignKey("finance.FiscalYear", on_delete=models.PROTECT, db_column="fiscal_year_id", related_name="finance_fiscalperiod_fiscal_year_set", null=True, blank=True)
    period_number = models.IntegerField(null=True, blank=True)
    start_date = models.DateField(null=True, blank=True)
    end_date = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        db_table = "fin_fiscal_period"

    def __str__(self):
        return str(self.status)


class Account(models.Model):
    """ERD entity: FIN_ACCOUNT."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey("core.Company", on_delete=models.PROTECT, db_column="company_id", related_name="finance_account_company_set", null=True, blank=True)
    parent_account = models.ForeignKey("finance.Account", on_delete=models.PROTECT, db_column="parent_account_id", related_name="finance_account_parent_account_set", null=True, blank=True)
    account_code = models.CharField(max_length=255, blank=True, default="")
    account_name = models.CharField(max_length=255, blank=True, default="")
    account_type = models.CharField(max_length=255, blank=True, default="")
    normal_balance = models.CharField(max_length=255, blank=True, default="")
    currency = models.ForeignKey("master_data.Currency", on_delete=models.PROTECT, db_column="currency_id", related_name="finance_account_currency_set", null=True, blank=True)
    allow_manual_posting = models.BooleanField(default=False)
    reconciliation_required = models.BooleanField(default=False)
    status = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        db_table = "fin_account"

    def __str__(self):
        return str(self.status)


class Journal(models.Model):
    """ERD entity: FIN_JOURNAL."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey("core.Company", on_delete=models.PROTECT, db_column="company_id", related_name="finance_journal_company_set", null=True, blank=True)
    journal_code = models.CharField(max_length=255, blank=True, default="")
    journal_name = models.CharField(max_length=255, blank=True, default="")
    journal_type = models.CharField(max_length=255, blank=True, default="")
    status = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        db_table = "fin_journal"

    def __str__(self):
        return str(self.status)


class JournalEntry(models.Model):
    """ERD entity: FIN_JOURNAL_ENTRY."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    document = models.ForeignKey("core.BusinessDocument", on_delete=models.PROTECT, db_column="document_id", related_name="finance_journalentry_document_set", null=True, blank=True)
    journal = models.ForeignKey("finance.Journal", on_delete=models.PROTECT, db_column="journal_id", related_name="finance_journalentry_journal_set", null=True, blank=True)
    fiscal_period = models.ForeignKey("finance.FiscalPeriod", on_delete=models.PROTECT, db_column="fiscal_period_id", related_name="finance_journalentry_fiscal_period_set", null=True, blank=True)
    currency = models.ForeignKey("master_data.Currency", on_delete=models.PROTECT, db_column="currency_id", related_name="finance_journalentry_currency_set", null=True, blank=True)
    entry_number = models.CharField(max_length=255, blank=True, default="")
    posting_date = models.DateField(null=True, blank=True)
    exchange_rate = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    description = models.CharField(max_length=255, blank=True, default="")
    source_document = models.ForeignKey("core.BusinessDocument", on_delete=models.PROTECT, db_column="source_document_id", related_name="finance_journalentry_source_document_set", null=True, blank=True)
    reversal_of_entry = models.ForeignKey("finance.JournalEntry", on_delete=models.PROTECT, db_column="reversal_of_entry_id", related_name="finance_journalentry_reversal_of_entry_set", null=True, blank=True)
    status = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        db_table = "fin_journal_entry"

    def __str__(self):
        return str(self.status)


class JournalLine(models.Model):
    """ERD entity: FIN_JOURNAL_LINE."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    journal_entry = models.ForeignKey("finance.JournalEntry", on_delete=models.PROTECT, db_column="journal_entry_id", related_name="finance_journalline_journal_entry_set", null=True, blank=True)
    account = models.ForeignKey("finance.Account", on_delete=models.PROTECT, db_column="account_id", related_name="finance_journalline_account_set", null=True, blank=True)
    party = models.ForeignKey("master_data.Party", on_delete=models.PROTECT, db_column="party_id", related_name="finance_journalline_party_set", null=True, blank=True)
    project = models.ForeignKey("projects.Project", on_delete=models.PROTECT, db_column="project_id", related_name="finance_journalline_project_set", null=True, blank=True)
    cost_center = models.ForeignKey("master_data.CostCenter", on_delete=models.PROTECT, db_column="cost_center_id", related_name="finance_journalline_cost_center_set", null=True, blank=True)
    department = models.ForeignKey("master_data.Department", on_delete=models.PROTECT, db_column="department_id", related_name="finance_journalline_department_set", null=True, blank=True)
    product = models.ForeignKey("master_data.Product", on_delete=models.PROTECT, db_column="product_id", related_name="finance_journalline_product_set", null=True, blank=True)
    warehouse = models.ForeignKey("master_data.Warehouse", on_delete=models.PROTECT, db_column="warehouse_id", related_name="finance_journalline_warehouse_set", null=True, blank=True)
    debit_base = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    credit_base = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    transaction_currency = models.ForeignKey("master_data.Currency", on_delete=models.PROTECT, db_column="transaction_currency_id", related_name="finance_journalline_transaction_currency_set", null=True, blank=True)
    transaction_amount = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    due_date = models.DateField(null=True, blank=True)
    source_document_line = models.ForeignKey("core.BusinessDocument", on_delete=models.PROTECT, db_column="source_document_line_id", related_name="finance_journalline_source_document_line_set", null=True, blank=True)

    class Meta:
        db_table = "fin_journal_line"

    def __str__(self):
        return str(self.id)


class BillingDocument(models.Model):
    """ERD entity: FIN_BILLING_DOCUMENT."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    document = models.ForeignKey("core.BusinessDocument", on_delete=models.PROTECT, db_column="document_id", related_name="finance_billingdocument_document_set", null=True, blank=True)
    company = models.ForeignKey("core.Company", on_delete=models.PROTECT, db_column="company_id", related_name="finance_billingdocument_company_set", null=True, blank=True)
    party = models.ForeignKey("master_data.Party", on_delete=models.PROTECT, db_column="party_id", related_name="finance_billingdocument_party_set", null=True, blank=True)
    currency = models.ForeignKey("master_data.Currency", on_delete=models.PROTECT, db_column="currency_id", related_name="finance_billingdocument_currency_set", null=True, blank=True)
    payment_term = models.ForeignKey("master_data.PaymentTerm", on_delete=models.PROTECT, db_column="payment_term_id", related_name="finance_billingdocument_payment_term_set", null=True, blank=True)
    sales_order = models.ForeignKey("sales.Order", on_delete=models.PROTECT, db_column="sales_order_id", related_name="finance_billingdocument_sales_order_set", null=True, blank=True)
    purchase_order = models.ForeignKey("procurement.PurchaseOrder", on_delete=models.PROTECT, db_column="purchase_order_id", related_name="finance_billingdocument_purchase_order_set", null=True, blank=True)
    project = models.ForeignKey("projects.Project", on_delete=models.PROTECT, db_column="project_id", related_name="finance_billingdocument_project_set", null=True, blank=True)
    billing_type = models.CharField(max_length=255, blank=True, default="")
    invoice_number = models.CharField(max_length=255, blank=True, default="")
    invoice_date = models.DateField(null=True, blank=True)
    posting_date = models.DateField(null=True, blank=True)
    due_date = models.DateField(null=True, blank=True)
    subtotal = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    tax_amount = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    total_amount = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    paid_amount = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    outstanding_amount = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    payment_status = models.CharField(max_length=255, blank=True, default="")
    status = models.CharField(max_length=255, blank=True, default="")
    verified_by = models.ForeignKey("accounts.User", on_delete=models.PROTECT, db_column="verified_by_id", related_name="verified_billing_documents", null=True, blank=True)
    verified_at = models.DateTimeField(null=True, blank=True)
    approved_by = models.ForeignKey("accounts.User", on_delete=models.PROTECT, db_column="approved_by_id", related_name="approved_billing_documents", null=True, blank=True)
    approved_at = models.DateTimeField(null=True, blank=True)
    rejection_reason = models.TextField(blank=True, default="")

    class Meta:
        db_table = "fin_billing_document"

    def __str__(self):
        return str(self.status)


class BillingDocumentLine(models.Model):
    """ERD entity: FIN_BILLING_DOCUMENT_LINE."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    billing_document = models.ForeignKey("finance.BillingDocument", on_delete=models.PROTECT, db_column="billing_document_id", related_name="finance_billingdocumentline_billing_document_set", null=True, blank=True)
    product = models.ForeignKey("master_data.Product", on_delete=models.PROTECT, db_column="product_id", related_name="finance_billingdocumentline_product_set", null=True, blank=True)
    account = models.ForeignKey("finance.Account", on_delete=models.PROTECT, db_column="account_id", related_name="finance_billingdocumentline_account_set", null=True, blank=True)
    project = models.ForeignKey("projects.Project", on_delete=models.PROTECT, db_column="project_id", related_name="finance_billingdocumentline_project_set", null=True, blank=True)
    cost_center = models.ForeignKey("master_data.CostCenter", on_delete=models.PROTECT, db_column="cost_center_id", related_name="finance_billingdocumentline_cost_center_set", null=True, blank=True)
    quantity = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    uom = models.ForeignKey("master_data.UOM", on_delete=models.PROTECT, db_column="uom_id", related_name="finance_billingdocumentline_uom_set", null=True, blank=True)
    unit_price = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    discount_amount = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    tax_code = models.ForeignKey("master_data.TaxCode", on_delete=models.PROTECT, db_column="tax_code_id", related_name="finance_billingdocumentline_tax_code_set", null=True, blank=True)
    line_total = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)

    class Meta:
        db_table = "fin_billing_document_line"

    def __str__(self):
        return str(self.id)


class ARAPSchedule(models.Model):
    """ERD entity: FIN_AR_AP_SCHEDULE."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    billing_document = models.ForeignKey("finance.BillingDocument", on_delete=models.PROTECT, db_column="billing_document_id", related_name="finance_arapschedule_billing_document_set", null=True, blank=True)
    installment_number = models.IntegerField(null=True, blank=True)
    due_date = models.DateField(null=True, blank=True)
    original_amount = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    paid_amount = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    outstanding_amount = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    status = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        db_table = "fin_ar_ap_schedule"

    def __str__(self):
        return str(self.status)


class Payment(models.Model):
    """ERD entity: FIN_PAYMENT."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    document = models.ForeignKey("core.BusinessDocument", on_delete=models.PROTECT, db_column="document_id", related_name="finance_payment_document_set", null=True, blank=True)
    company = models.ForeignKey("core.Company", on_delete=models.PROTECT, db_column="company_id", related_name="finance_payment_company_set", null=True, blank=True)
    party = models.ForeignKey("master_data.Party", on_delete=models.PROTECT, db_column="party_id", related_name="finance_payment_party_set", null=True, blank=True)
    bank_account = models.ForeignKey("finance.BankAccount", on_delete=models.PROTECT, db_column="bank_account_id", related_name="finance_payment_bank_account_set", null=True, blank=True)
    currency = models.ForeignKey("master_data.Currency", on_delete=models.PROTECT, db_column="currency_id", related_name="finance_payment_currency_set", null=True, blank=True)
    payment_type = models.CharField(max_length=255, blank=True, default="")
    payment_date = models.DateField(null=True, blank=True)
    amount = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    payment_method = models.CharField(max_length=255, blank=True, default="")
    reference_number = models.CharField(max_length=255, blank=True, default="")
    journal_entry = models.ForeignKey("finance.JournalEntry", on_delete=models.PROTECT, db_column="journal_entry_id", related_name="finance_payment_journal_entry_set", null=True, blank=True)
    status = models.CharField(max_length=255, blank=True, default="")
    allocation_plan = models.JSONField(default=list, blank=True)
    submitted_by = models.ForeignKey("accounts.User", on_delete=models.PROTECT, db_column="submitted_by_id", related_name="submitted_payments", null=True, blank=True)
    submitted_at = models.DateTimeField(null=True, blank=True)
    approved_by = models.ForeignKey("accounts.User", on_delete=models.PROTECT, db_column="approved_by_id", related_name="approved_payments", null=True, blank=True)
    approved_at = models.DateTimeField(null=True, blank=True)
    executed_by = models.ForeignKey("accounts.User", on_delete=models.PROTECT, db_column="executed_by_id", related_name="executed_payments", null=True, blank=True)
    executed_at = models.DateTimeField(null=True, blank=True)
    execution_reference = models.CharField(max_length=255, blank=True, default="")
    execution_note = models.TextField(blank=True, default="")
    failure_reason = models.TextField(blank=True, default="")

    class Meta:
        db_table = "fin_payment"

    def __str__(self):
        return str(self.status)


class PaymentAllocation(models.Model):
    """ERD entity: FIN_PAYMENT_ALLOCATION."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    payment = models.ForeignKey("finance.Payment", on_delete=models.PROTECT, db_column="payment_id", related_name="finance_paymentallocation_payment_set", null=True, blank=True)
    billing_document = models.ForeignKey("finance.BillingDocument", on_delete=models.PROTECT, db_column="billing_document_id", related_name="finance_paymentallocation_billing_document_set", null=True, blank=True)
    schedule = models.ForeignKey("finance.ARAPSchedule", on_delete=models.PROTECT, db_column="schedule_id", related_name="finance_paymentallocation_schedule_set", null=True, blank=True)
    allocated_amount = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    discount_amount = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    write_off_amount = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    exchange_difference = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)

    class Meta:
        db_table = "fin_payment_allocation"

    def __str__(self):
        return str(self.id)


class BankAccount(models.Model):
    """ERD entity: FIN_BANK_ACCOUNT."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey("core.Company", on_delete=models.PROTECT, db_column="company_id", related_name="finance_bankaccount_company_set", null=True, blank=True)
    party = models.ForeignKey("master_data.Party", on_delete=models.PROTECT, db_column="party_id", related_name="finance_bankaccount_party_set", null=True, blank=True)
    ledger_account = models.ForeignKey("finance.Account", on_delete=models.PROTECT, db_column="ledger_account_id", related_name="finance_bankaccount_ledger_account_set", null=True, blank=True)
    currency = models.ForeignKey("master_data.Currency", on_delete=models.PROTECT, db_column="currency_id", related_name="finance_bankaccount_currency_set", null=True, blank=True)
    bank_name = models.CharField(max_length=255, blank=True, default="")
    account_number = models.CharField(max_length=255, blank=True, default="")
    account_name = models.CharField(max_length=255, blank=True, default="")
    status = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        db_table = "fin_bank_account"

    def __str__(self):
        return str(self.status)


class BankStatement(models.Model):
    """ERD entity: FIN_BANK_STATEMENT."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    bank_account = models.ForeignKey("finance.BankAccount", on_delete=models.PROTECT, db_column="bank_account_id", related_name="finance_bankstatement_bank_account_set", null=True, blank=True)
    statement_date = models.DateField(null=True, blank=True)
    opening_balance = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    closing_balance = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    status = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        db_table = "fin_bank_statement"

    def __str__(self):
        return str(self.status)


class BankStatementLine(models.Model):
    """ERD entity: FIN_BANK_STATEMENT_LINE."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    bank_statement = models.ForeignKey("finance.BankStatement", on_delete=models.PROTECT, db_column="bank_statement_id", related_name="finance_bankstatementline_bank_statement_set", null=True, blank=True)
    transaction_date = models.DateField(null=True, blank=True)
    reference_number = models.CharField(max_length=255, blank=True, default="")
    description = models.CharField(max_length=255, blank=True, default="")
    debit_amount = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    credit_amount = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    running_balance = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)

    class Meta:
        db_table = "fin_bank_statement_line"

    def __str__(self):
        return str(self.id)


class BankReconciliation(models.Model):
    """ERD entity: FIN_BANK_RECONCILIATION."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    bank_statement_line = models.ForeignKey("finance.BankStatementLine", on_delete=models.PROTECT, db_column="bank_statement_line_id", related_name="finance_bankreconciliation_bank_statement_line_set", null=True, blank=True)
    payment = models.ForeignKey("finance.Payment", on_delete=models.PROTECT, db_column="payment_id", related_name="finance_bankreconciliation_payment_set", null=True, blank=True)
    journal_line = models.ForeignKey("finance.JournalLine", on_delete=models.PROTECT, db_column="journal_line_id", related_name="finance_bankreconciliation_journal_line_set", null=True, blank=True)
    matched_amount = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    match_type = models.CharField(max_length=255, blank=True, default="")
    status = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        db_table = "fin_bank_reconciliation"

    def __str__(self):
        return str(self.status)


class TaxTransaction(models.Model):
    """ERD entity: FIN_TAX_TRANSACTION."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey("core.Company", on_delete=models.PROTECT, related_name="tax_transactions", null=True, blank=True)
    billing_document = models.ForeignKey("finance.BillingDocument", on_delete=models.PROTECT, db_column="billing_document_id", related_name="finance_taxtransaction_billing_document_set", null=True, blank=True)
    billing_document_line = models.ForeignKey("finance.BillingDocumentLine", on_delete=models.PROTECT, db_column="billing_document_line_id", related_name="finance_taxtransaction_billing_document_line_set", null=True, blank=True)
    tax_code = models.ForeignKey("master_data.TaxCode", on_delete=models.PROTECT, db_column="tax_code_id", related_name="finance_taxtransaction_tax_code_set", null=True, blank=True)
    taxable_amount = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    tax_rate = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    tax_amount = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    tax_direction = models.CharField(max_length=255, blank=True, default="")
    tax_date = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=32, blank=True, default="DRAFT")
    validation_note = models.TextField(blank=True, default="")
    validated_by = models.ForeignKey("accounts.User", on_delete=models.PROTECT, related_name="validated_tax_transactions", null=True, blank=True)
    validated_at = models.DateTimeField(null=True, blank=True)
    billing_code = models.CharField(max_length=128, blank=True, default="")
    payment_reference = models.CharField(max_length=128, blank=True, default="")
    paid_at = models.DateTimeField(null=True, blank=True)
    ntpn = models.CharField(max_length=128, blank=True, default="")
    reported_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "fin_tax_transaction"

    def __str__(self):
        return str(self.id)


class Budget(models.Model):
    """ERD entity: FIN_BUDGET."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey("core.Company", on_delete=models.PROTECT, db_column="company_id", related_name="finance_budget_company_set", null=True, blank=True)
    fiscal_year = models.ForeignKey("finance.FiscalYear", on_delete=models.PROTECT, db_column="fiscal_year_id", related_name="finance_budget_fiscal_year_set", null=True, blank=True)
    budget_name = models.CharField(max_length=255, blank=True, default="")
    budget_type = models.CharField(max_length=255, blank=True, default="")
    status = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        db_table = "fin_budget"

    def __str__(self):
        return str(self.status)


class BudgetLine(models.Model):
    """ERD entity: FIN_BUDGET_LINE."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    budget = models.ForeignKey("finance.Budget", on_delete=models.PROTECT, db_column="budget_id", related_name="finance_budgetline_budget_set", null=True, blank=True)
    account = models.ForeignKey("finance.Account", on_delete=models.PROTECT, db_column="account_id", related_name="finance_budgetline_account_set", null=True, blank=True)
    project = models.ForeignKey("projects.Project", on_delete=models.PROTECT, db_column="project_id", related_name="finance_budgetline_project_set", null=True, blank=True)
    cost_center = models.ForeignKey("master_data.CostCenter", on_delete=models.PROTECT, db_column="cost_center_id", related_name="finance_budgetline_cost_center_set", null=True, blank=True)
    department = models.ForeignKey("master_data.Department", on_delete=models.PROTECT, db_column="department_id", related_name="finance_budgetline_department_set", null=True, blank=True)
    period_number = models.IntegerField(null=True, blank=True)
    budget_amount = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)

    class Meta:
        db_table = "fin_budget_line"

    def __str__(self):
        return str(self.id)


class PeriodClosing(models.Model):
    """ERD entity: FIN_PERIOD_CLOSING."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    document = models.ForeignKey("core.BusinessDocument", on_delete=models.PROTECT, db_column="document_id", related_name="finance_periodclosing_document_set", null=True, blank=True)
    fiscal_period = models.ForeignKey("finance.FiscalPeriod", on_delete=models.PROTECT, db_column="fiscal_period_id", related_name="finance_periodclosing_fiscal_period_set", null=True, blank=True)
    executed_by = models.ForeignKey("accounts.User", on_delete=models.PROTECT, db_column="executed_by", related_name="finance_periodclosing_executed_by_set", null=True, blank=True)
    started_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    closing_type = models.CharField(max_length=255, blank=True, default="")
    status = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        db_table = "fin_period_closing"

    def __str__(self):
        return str(self.status)


class FinancialSnapshot(models.Model):
    """ERD entity: FIN_FINANCIAL_SNAPSHOT."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey("core.Company", on_delete=models.PROTECT, db_column="company_id", related_name="finance_financialsnapshot_company_set", null=True, blank=True)
    fiscal_period = models.ForeignKey("finance.FiscalPeriod", on_delete=models.PROTECT, db_column="fiscal_period_id", related_name="finance_financialsnapshot_fiscal_period_set", null=True, blank=True)
    snapshot_at = models.DateTimeField(null=True, blank=True)
    revenue_amount = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    expense_amount = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    profit_loss_amount = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    operating_cashflow = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    investing_cashflow = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    financing_cashflow = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    cash_balance = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    snapshot_status = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        db_table = "fin_financial_snapshot"

    def __str__(self):
        return str(self.id)


class UnitCostSnapshot(models.Model):
    """ERD entity: FIN_UNIT_COST_SNAPSHOT."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey("core.Company", on_delete=models.PROTECT, db_column="company_id", related_name="finance_unitcostsnapshot_company_set", null=True, blank=True)
    project = models.ForeignKey("projects.Project", on_delete=models.PROTECT, db_column="project_id", related_name="finance_unitcostsnapshot_project_set", null=True, blank=True)
    production_order = models.ForeignKey("manufacturing.ProductionOrder", on_delete=models.PROTECT, db_column="production_order_id", related_name="finance_unitcostsnapshot_production_order_set", null=True, blank=True)
    product = models.ForeignKey("master_data.Product", on_delete=models.PROTECT, db_column="product_id", related_name="finance_unitcostsnapshot_product_set", null=True, blank=True)
    cost_unit_code = models.CharField(max_length=255, blank=True, default="")
    snapshot_at = models.DateTimeField(null=True, blank=True)
    material_cost = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    labor_cost = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    machine_cost = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    overhead_cost = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    total_cost = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    output_quantity = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    unit_cost = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)

    class Meta:
        db_table = "fin_unit_cost_snapshot"

    def __str__(self):
        return str(self.id)


class RecurringPaymentRule(models.Model):
    """ERD entity: FIN_RECURRING_PAYMENT_RULE."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey("core.Company", on_delete=models.PROTECT, db_column="company_id", related_name="finance_recurringpaymentrule_company_set", null=True, blank=True)
    party = models.ForeignKey("master_data.Party", on_delete=models.PROTECT, db_column="party_id", related_name="finance_recurringpaymentrule_party_set", null=True, blank=True)
    bank_account = models.ForeignKey("finance.BankAccount", on_delete=models.PROTECT, db_column="bank_account_id", related_name="finance_recurringpaymentrule_bank_account_set", null=True, blank=True)
    expense_account = models.ForeignKey("finance.Account", on_delete=models.PROTECT, db_column="expense_account_id", related_name="finance_recurringpaymentrule_expense_account_set", null=True, blank=True)
    currency = models.ForeignKey("master_data.Currency", on_delete=models.PROTECT, db_column="currency_id", related_name="finance_recurringpaymentrule_currency_set", null=True, blank=True)
    rule_code = models.CharField(max_length=255, unique=True, blank=True, default="")
    amount = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    recurrence_rule = models.CharField(max_length=255, blank=True, default="")
    next_run_date = models.DateField(null=True, blank=True)
    end_date = models.DateField(null=True, blank=True)
    approval_required = models.BooleanField(default=False)
    status = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        db_table = "fin_recurring_payment_rule"

    def __str__(self):
        return str(self.status)


class RecurringPaymentRun(models.Model):
    """ERD entity: FIN_RECURRING_PAYMENT_RUN."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    recurring_rule = models.ForeignKey("finance.RecurringPaymentRule", on_delete=models.PROTECT, db_column="recurring_rule_id", related_name="finance_recurringpaymentrun_recurring_rule_set", null=True, blank=True)
    payment = models.ForeignKey("finance.Payment", on_delete=models.PROTECT, db_column="payment_id", related_name="finance_recurringpaymentrun_payment_set", null=True, blank=True)
    scheduled_date = models.DateField(null=True, blank=True)
    executed_at = models.DateTimeField(null=True, blank=True)
    run_status = models.CharField(max_length=255, blank=True, default="")
    failure_reason = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        db_table = "fin_recurring_payment_run"

    def __str__(self):
        return str(self.id)


class CreditFacility(models.Model):
    """ERD entity: FIN_CREDIT_FACILITY."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey("core.Company", on_delete=models.PROTECT, db_column="company_id", related_name="finance_creditfacility_company_set", null=True, blank=True)
    party = models.ForeignKey("master_data.Party", on_delete=models.PROTECT, db_column="party_id", related_name="finance_creditfacility_party_set", null=True, blank=True)
    currency = models.ForeignKey("master_data.Currency", on_delete=models.PROTECT, db_column="currency_id", related_name="finance_creditfacility_currency_set", null=True, blank=True)
    facility_type = models.CharField(max_length=255, blank=True, default="")
    facility_number = models.CharField(max_length=255, blank=True, default="")
    credit_limit = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    utilized_amount = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    available_amount = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    effective_from = models.DateField(null=True, blank=True)
    effective_to = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        db_table = "fin_credit_facility"

    def __str__(self):
        return str(self.status)


class ProjectWIPSnapshot(models.Model):
    """ERD entity: FIN_PROJECT_WIP_SNAPSHOT."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project = models.ForeignKey("projects.Project", on_delete=models.PROTECT, db_column="project_id", related_name="finance_projectwipsnapshot_project_set", null=True, blank=True)
    fiscal_period = models.ForeignKey("finance.FiscalPeriod", on_delete=models.PROTECT, db_column="fiscal_period_id", related_name="finance_projectwipsnapshot_fiscal_period_set", null=True, blank=True)
    snapshot_date = models.DateField(null=True, blank=True)
    completion_percent = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    recognized_revenue = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    recognized_cost = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    wip_asset_amount = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    accrued_billing_amount = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    unbilled_amount = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    status = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        db_table = "fin_project_wip_snapshot"

    def __str__(self):
        return str(self.status)


class ProjectFunding(models.Model):
    """ERD entity: FIN_PROJECT_FUNDING."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey("core.Tenant", on_delete=models.PROTECT, related_name="project_fundings", null=True, blank=True)
    company = models.ForeignKey("core.Company", on_delete=models.PROTECT, related_name="project_fundings", null=True, blank=True)
    document = models.ForeignKey("core.BusinessDocument", on_delete=models.PROTECT, db_column="document_id", related_name="finance_projectfunding_document_set", null=True, blank=True)
    project = models.ForeignKey("projects.Project", on_delete=models.PROTECT, db_column="project_id", related_name="finance_projectfunding_project_set", null=True, blank=True)
    funding_source_party = models.ForeignKey("master_data.Party", on_delete=models.PROTECT, db_column="funding_source_party_id", related_name="finance_projectfunding_funding_source_party_set", null=True, blank=True)
    currency = models.ForeignKey("master_data.Currency", on_delete=models.PROTECT, db_column="currency_id", related_name="finance_projectfunding_currency_set", null=True, blank=True)
    funding_type = models.CharField(max_length=255, blank=True, default="")
    purpose = models.TextField(blank=True, default="")
    requested_amount = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    approved_limit = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    interest_rate = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    start_date = models.DateField(null=True, blank=True)
    maturity_date = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=255, blank=True, default="")
    requested_by = models.ForeignKey("accounts.User", on_delete=models.PROTECT, related_name="requested_project_fundings", null=True, blank=True)
    submitted_at = models.DateTimeField(null=True, blank=True)
    verified_by = models.ForeignKey("accounts.User", on_delete=models.PROTECT, related_name="verified_project_fundings", null=True, blank=True)
    verified_at = models.DateTimeField(null=True, blank=True)
    approved_by = models.ForeignKey("accounts.User", on_delete=models.PROTECT, related_name="approved_project_fundings", null=True, blank=True)
    approved_at = models.DateTimeField(null=True, blank=True)
    rejected_by = models.ForeignKey("accounts.User", on_delete=models.PROTECT, related_name="rejected_project_fundings", null=True, blank=True)
    rejected_at = models.DateTimeField(null=True, blank=True)
    review_note = models.TextField(blank=True, default="")

    class Meta:
        db_table = "fin_project_funding"
        indexes = [models.Index(fields=["status", "project"], name="fin_funding_workflow")]

    def __str__(self):
        return str(self.status)


class ProjectFundingTransaction(models.Model):
    """ERD entity: FIN_PROJECT_FUNDING_TRANSACTION."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project_funding = models.ForeignKey("finance.ProjectFunding", on_delete=models.PROTECT, db_column="project_funding_id", related_name="finance_projectfundingtransaction_project_funding_set", null=True, blank=True)
    payment = models.ForeignKey("finance.Payment", on_delete=models.PROTECT, db_column="payment_id", related_name="finance_projectfundingtransaction_payment_set", null=True, blank=True)
    journal_entry = models.ForeignKey("finance.JournalEntry", on_delete=models.PROTECT, db_column="journal_entry_id", related_name="finance_projectfundingtransaction_journal_entry_set", null=True, blank=True)
    transaction_type = models.CharField(max_length=255, blank=True, default="")
    transaction_date = models.DateField(null=True, blank=True)
    amount = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    outstanding_balance = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)

    class Meta:
        db_table = "fin_project_funding_transaction"

    def __str__(self):
        return str(self.id)


class CostBaseline(models.Model):
    """ERD entity: FIN_COST_BASELINE."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    document = models.ForeignKey("core.BusinessDocument", on_delete=models.PROTECT, db_column="document_id", related_name="finance_costbaseline_document_set", null=True, blank=True)
    project = models.ForeignKey("projects.Project", on_delete=models.PROTECT, db_column="project_id", related_name="finance_costbaseline_project_set", null=True, blank=True)
    baseline_version = models.IntegerField(null=True, blank=True)
    effective_date = models.DateField(null=True, blank=True)
    total_ideal_cost = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    approved_by = models.ForeignKey("accounts.User", on_delete=models.PROTECT, db_column="approved_by", related_name="finance_costbaseline_approved_by_set", null=True, blank=True)
    status = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        db_table = "fin_cost_baseline"

    def __str__(self):
        return str(self.status)


class CostBaselineLine(models.Model):
    """ERD entity: FIN_COST_BASELINE_LINE."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    cost_baseline = models.ForeignKey("finance.CostBaseline", on_delete=models.PROTECT, db_column="cost_baseline_id", related_name="finance_costbaselineline_cost_baseline_set", null=True, blank=True)
    product = models.ForeignKey("master_data.Product", on_delete=models.PROTECT, db_column="product_id", related_name="finance_costbaselineline_product_set", null=True, blank=True)
    account = models.ForeignKey("finance.Account", on_delete=models.PROTECT, db_column="account_id", related_name="finance_costbaselineline_account_set", null=True, blank=True)
    cost_center = models.ForeignKey("master_data.CostCenter", on_delete=models.PROTECT, db_column="cost_center_id", related_name="finance_costbaselineline_cost_center_set", null=True, blank=True)
    cost_element = models.CharField(max_length=255, blank=True, default="")
    quantity = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    unit_rate = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    ideal_amount = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)

    class Meta:
        db_table = "fin_cost_baseline_line"

    def __str__(self):
        return str(self.id)


class CostVariance(models.Model):
    """ERD entity: FIN_COST_VARIANCE."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project = models.ForeignKey("projects.Project", on_delete=models.PROTECT, db_column="project_id", related_name="finance_costvariance_project_set", null=True, blank=True)
    cost_baseline_line = models.ForeignKey("finance.CostBaselineLine", on_delete=models.PROTECT, db_column="cost_baseline_line_id", related_name="finance_costvariance_cost_baseline_line_set", null=True, blank=True)
    fiscal_period = models.ForeignKey("finance.FiscalPeriod", on_delete=models.PROTECT, db_column="fiscal_period_id", related_name="finance_costvariance_fiscal_period_set", null=True, blank=True)
    actual_amount = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    ideal_amount = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    variance_amount = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    variance_percent = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    calculated_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "fin_cost_variance"

    def __str__(self):
        return str(self.id)


class OverheadRule(models.Model):
    """ERD entity: FIN_OVERHEAD_RULE."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey("core.Company", on_delete=models.PROTECT, db_column="company_id", related_name="finance_overheadrule_company_set", null=True, blank=True)
    source_account = models.ForeignKey("finance.Account", on_delete=models.PROTECT, db_column="source_account_id", related_name="finance_overheadrule_source_account_set", null=True, blank=True)
    target_cost_center = models.ForeignKey("master_data.CostCenter", on_delete=models.PROTECT, db_column="target_cost_center_id", related_name="finance_overheadrule_target_cost_center_set", null=True, blank=True)
    rule_code = models.CharField(max_length=255, unique=True, blank=True, default="")
    allocation_basis = models.CharField(max_length=255, blank=True, default="")
    rate_percent = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    effective_from = models.DateField(null=True, blank=True)
    effective_to = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        db_table = "fin_overhead_rule"

    def __str__(self):
        return str(self.status)


class OverheadAllocation(models.Model):
    """ERD entity: FIN_OVERHEAD_ALLOCATION."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    overhead_rule = models.ForeignKey("finance.OverheadRule", on_delete=models.PROTECT, db_column="overhead_rule_id", related_name="finance_overheadallocation_overhead_rule_set", null=True, blank=True)
    project = models.ForeignKey("projects.Project", on_delete=models.PROTECT, db_column="project_id", related_name="finance_overheadallocation_project_set", null=True, blank=True)
    production_order = models.ForeignKey("manufacturing.ProductionOrder", on_delete=models.PROTECT, db_column="production_order_id", related_name="finance_overheadallocation_production_order_set", null=True, blank=True)
    fiscal_period = models.ForeignKey("finance.FiscalPeriod", on_delete=models.PROTECT, db_column="fiscal_period_id", related_name="finance_overheadallocation_fiscal_period_set", null=True, blank=True)
    journal_entry = models.ForeignKey("finance.JournalEntry", on_delete=models.PROTECT, db_column="journal_entry_id", related_name="finance_overheadallocation_journal_entry_set", null=True, blank=True)
    basis_quantity = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    allocated_amount = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    posted_at = models.DateTimeField(null=True, blank=True)
    status = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        db_table = "fin_overhead_allocation"

    def __str__(self):
        return str(self.status)


class ProjectCostSnapshot(models.Model):
    """ERD entity: FIN_PROJECT_COST_SNAPSHOT."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project = models.ForeignKey("projects.Project", on_delete=models.PROTECT, db_column="project_id", related_name="finance_projectcostsnapshot_project_set", null=True, blank=True)
    snapshot_at = models.DateTimeField(null=True, blank=True)
    budget_amount = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    committed_cost = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    actual_cost = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    overhead_cost = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    forecast_cost = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    cost_variance = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    remaining_budget = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)

    class Meta:
        db_table = "fin_project_cost_snapshot"

    def __str__(self):
        return str(self.id)


class ProjectCostEntry(models.Model):
    """Validated cost inbox between operational sources and accounting WIP."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey("core.Tenant", on_delete=models.PROTECT, related_name="project_cost_entries", null=True, blank=True)
    company = models.ForeignKey("core.Company", on_delete=models.PROTECT, related_name="project_cost_entries", null=True, blank=True)
    project = models.ForeignKey("projects.Project", on_delete=models.PROTECT, related_name="cost_entries")
    source_type = models.CharField(max_length=32, blank=True, default="MANUAL")
    source_reference = models.CharField(max_length=255, blank=True, default="")
    description = models.CharField(max_length=255)
    cost_element = models.CharField(max_length=32, blank=True, default="OTHER")
    transaction_date = models.DateField()
    quantity = models.DecimalField(max_digits=24, decimal_places=6, default=1)
    unit_cost = models.DecimalField(max_digits=24, decimal_places=6, default=0)
    total_cost = models.DecimalField(max_digits=24, decimal_places=6, default=0)
    status = models.CharField(max_length=32, blank=True, default="CAPTURED")
    validation_note = models.TextField(blank=True, default="")
    created_by = models.ForeignKey("accounts.User", on_delete=models.PROTECT, related_name="created_project_cost_entries", null=True, blank=True)
    validated_by = models.ForeignKey("accounts.User", on_delete=models.PROTECT, related_name="validated_project_cost_entries", null=True, blank=True)
    validated_at = models.DateTimeField(null=True, blank=True)
    posted_by = models.ForeignKey("accounts.User", on_delete=models.PROTECT, related_name="posted_project_cost_entries", null=True, blank=True)
    posted_at = models.DateTimeField(null=True, blank=True)
    journal_entry = models.ForeignKey("finance.JournalEntry", on_delete=models.PROTECT, related_name="project_cost_entries", null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "fin_project_cost_entry"
        ordering = ["-transaction_date", "-created_at"]
        indexes = [models.Index(fields=["company", "project", "status"], name="fin_cost_inbox_lookup")]


class BillingProposal(models.Model):
    """Approval boundary between a project milestone/completion and an invoice."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey("core.Tenant", on_delete=models.PROTECT, related_name="billing_proposals", null=True, blank=True)
    company = models.ForeignKey("core.Company", on_delete=models.PROTECT, related_name="billing_proposals", null=True, blank=True)
    project = models.ForeignKey("projects.Project", on_delete=models.PROTECT, related_name="billing_proposals")
    customer = models.ForeignKey("master_data.Party", on_delete=models.PROTECT, related_name="project_billing_proposals", null=True, blank=True)
    trigger_type = models.CharField(max_length=32, blank=True, default="PROJECT_COMPLETED")
    description = models.CharField(max_length=255)
    subtotal = models.DecimalField(max_digits=24, decimal_places=6, default=0)
    tax_rate = models.DecimalField(max_digits=9, decimal_places=6, default=0)
    tax_amount = models.DecimalField(max_digits=24, decimal_places=6, default=0)
    total_amount = models.DecimalField(max_digits=24, decimal_places=6, default=0)
    status = models.CharField(max_length=32, blank=True, default="DRAFT")
    requested_by = models.ForeignKey("accounts.User", on_delete=models.PROTECT, related_name="requested_billing_proposals", null=True, blank=True)
    submitted_at = models.DateTimeField(null=True, blank=True)
    approved_by = models.ForeignKey("accounts.User", on_delete=models.PROTECT, related_name="approved_billing_proposals", null=True, blank=True)
    approved_at = models.DateTimeField(null=True, blank=True)
    rejection_reason = models.TextField(blank=True, default="")
    billing_document = models.OneToOneField("finance.BillingDocument", on_delete=models.PROTECT, related_name="billing_proposal", null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "fin_billing_proposal"
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["company", "status"], name="fin_billing_queue")]


class InvoiceVarianceCase(models.Model):
    """Resolution queue produced when three-way matching finds a variance."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey("core.Company", on_delete=models.PROTECT, related_name="invoice_variance_cases", null=True, blank=True)
    billing_document = models.ForeignKey("finance.BillingDocument", on_delete=models.PROTECT, related_name="variance_cases")
    three_way_match = models.OneToOneField("procurement.ThreeWayMatch", on_delete=models.PROTECT, related_name="variance_case")
    variance_type = models.CharField(max_length=32, blank=True, default="MIXED")
    total_variance = models.DecimalField(max_digits=24, decimal_places=6, default=0)
    status = models.CharField(max_length=32, blank=True, default="OPEN")
    resolution = models.TextField(blank=True, default="")
    assigned_to = models.ForeignKey("accounts.User", on_delete=models.PROTECT, related_name="assigned_invoice_variances", null=True, blank=True)
    resolved_by = models.ForeignKey("accounts.User", on_delete=models.PROTECT, related_name="resolved_invoice_variances", null=True, blank=True)
    resolved_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "fin_invoice_variance_case"
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["company", "status"], name="fin_invoice_variance_queue")]

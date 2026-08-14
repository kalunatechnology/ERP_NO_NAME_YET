from __future__ import annotations

import json
from datetime import date, timedelta
from decimal import Decimal
from typing import Optional

from seeder_common import (
    SeederClient,
    SeederError,
    build_client,
    configure_logging,
    stage_is_successful,
)


# ============================================================================
# FINANCE Q1-Q2 2026
# ----------------------------------------------------------------------------
# Scope:
# - Fiscal year 2026
# - Fiscal periods Jan-Jun 2026
# - Core Chart of Accounts
# - Journals
# - Bank account
# - 6 customer invoices + 6 supplier bills
# - AR/AP schedules
# - 6 incoming + 6 outgoing payments
# - payment allocations
# - 24 normal balanced journal entries / 48 normal journal lines
# - All 33 Finance CRUD resources
# - All 7 Finance business commands
#
# Dependency:
# - Stage 2: COMP-HOLDING
# - Stage 3: IDR, PARTY-CUST-01, PARTY-SUPP-01, PROD-ITEM-A
# - Stage 6: PROJ-2026-003
#
# This file intentionally focuses on Finance only.
# Assets remain in seed_finance_assets.py / Stage 7.
# ============================================================================


MONTHS = [
    # month, invoice_date, revenue, expense, cash_in, cash_out
    (1, "2026-01-15", Decimal("120000000.00"), Decimal("55000000.00"), Decimal("90000000.00"), Decimal("45000000.00")),
    (2, "2026-02-15", Decimal("145000000.00"), Decimal("62000000.00"), Decimal("135000000.00"), Decimal("60000000.00")),
    (3, "2026-03-15", Decimal("160000000.00"), Decimal("70000000.00"), Decimal("150000000.00"), Decimal("68000000.00")),
    (4, "2026-04-15", Decimal("175000000.00"), Decimal("78000000.00"), Decimal("170000000.00"), Decimal("75000000.00")),
    (5, "2026-05-15", Decimal("195000000.00"), Decimal("84000000.00"), Decimal("188000000.00"), Decimal("82000000.00")),
    (6, "2026-06-15", Decimal("220000000.00"), Decimal("95000000.00"), Decimal("215000000.00"), Decimal("92000000.00")),
]


def money(value: Decimal | int | str) -> str:
    return f"{Decimal(value):.2f}"


def month_end(year: int, month: int) -> date:
    if month == 12:
        return date(year, 12, 31)
    return date(year, month + 1, 1) - timedelta(days=1)


def validate_balanced(entries: list[dict], lines_by_entry: dict[str, list[dict]]) -> None:
    """Fail before HTTP seeding when any journal is not balanced."""
    for entry in entries:
        key = entry["_key"]
        lines = lines_by_entry.get(key, [])
        if len(lines) < 2:
            raise SeederError(f"{key}: journal minimal dua baris")

        debit = sum(Decimal(str(line.get("debit_base", "0") or "0")) for line in lines)
        credit = sum(Decimal(str(line.get("credit_base", "0") or "0")) for line in lines)

        if debit != credit:
            raise SeederError(
                f"{key}: journal tidak balance; debit={debit} credit={credit}"
            )


def run_stage(client: Optional[SeederClient] = None) -> bool:
    configure_logging()
    own_client = client is None
    client = client or build_client()

    try:
        if own_client:
            client.bootstrap()

        company_id = client.require_state_id(
            ("stage_2", "companies", "COMP-HOLDING"),
            "COMP-HOLDING company",
        )

        # Master/project dependencies are resolved from state first.
        # If state is stale/missing, recover the UUID from the live API
        # and repair seeding_state.json automatically.
        currency_id = client.resolve_state_or_api_id(
            path=("stage_3", "currencies", "IDR"),
            label="IDR currency",
            endpoint="/api/v1/master-data/currencies/",
            match_fields={"currency_code": "IDR"},
            search_term="IDR",
            company_id=company_id,
        )
        customer_id = client.resolve_state_or_api_id(
            path=("stage_3", "parties", "PARTY-CUST-01"),
            label="customer party PARTY-CUST-01",
            endpoint="/api/v1/master-data/parties/",
            match_fields={"party_code": "PARTY-CUST-01"},
            search_term="PARTY-CUST-01",
            company_id=company_id,
        )
        supplier_id = client.resolve_state_or_api_id(
            path=("stage_3", "parties", "PARTY-SUPP-01"),
            label="supplier party PARTY-SUPP-01",
            endpoint="/api/v1/master-data/parties/",
            match_fields={"party_code": "PARTY-SUPP-01"},
            search_term="PARTY-SUPP-01",
            company_id=company_id,
        )
        product_id = client.resolve_state_or_api_id(
            path=("stage_3", "products", "PROD-ITEM-A"),
            label="PROD-ITEM-A product",
            endpoint="/api/v1/master-data/products/",
            match_fields={"product_code": "PROD-ITEM-A"},
            search_term="PROD-ITEM-A",
            company_id=company_id,
        )
        project_id = client.resolve_state_or_api_id(
            path=("stage_6", "projects", "PROJ-2026-003"),
            label="PROJ-2026-003 project",
            endpoint="/api/v1/projects/projects/",
            match_fields={"project_code": "PROJ-2026-003"},
            search_term="PROJ-2026-003",
            company_id=company_id,
        )

        reports: list[dict] = []
        command_reports: list[dict] = []

        # --------------------------------------------------------------------
        # 1. FISCAL YEAR
        # --------------------------------------------------------------------
        fiscal_years = [
            {
                "_key": "FY-2026",
                "company": company_id,
                "fiscal_year_name": "Fiscal Year 2026",
                "start_date": "2026-01-01",
                "end_date": "2026-12-31",
                "status": "OPEN",
            },
            {
                "_key": "FY-DEL",
                "company": company_id,
                "fiscal_year_name": "Delete Test Fiscal Year",
                "start_date": "2030-01-01",
                "end_date": "2030-12-31",
                "status": "OPEN",
            },
        ]
        report = client.seed_resource(
            stage_name="stage_8_finance.fiscal_years",
            state_path=("stage_8_finance", "fiscal_years"),
            endpoint="/api/v1/finance/fiscal-years/",
            items=fiscal_years,
            match_fields=("company", "fiscal_year_name"),
            patch_payload={"status": "OPEN"},
            delete_key="FY-DEL",
            search_term="2026",
            company_id=company_id,
        )
        reports.append(report)

        fiscal_year_id = client.require_state_id(
            ("stage_8_finance", "fiscal_years", "FY-2026"),
            "FY-2026",
        )

        # --------------------------------------------------------------------
        # 2. FISCAL PERIODS JAN-JUN
        # --------------------------------------------------------------------
        fiscal_periods = []
        for month, *_ in MONTHS:
            start = date(2026, month, 1)
            end = month_end(2026, month)
            fiscal_periods.append(
                {
                    "_key": f"FP-2026-{month:02d}",
                    "fiscal_year": fiscal_year_id,
                    "period_number": month,
                    "start_date": start.isoformat(),
                    "end_date": end.isoformat(),
                    "status": "OPEN",
                }
            )
        fiscal_periods.append(
            {
                "_key": "FP-DEL",
                "fiscal_year": fiscal_year_id,
                "period_number": 99,
                "start_date": "2026-12-30",
                "end_date": "2026-12-31",
                "status": "OPEN",
            }
        )

        report = client.seed_resource(
            stage_name="stage_8_finance.fiscal_periods",
            state_path=("stage_8_finance", "fiscal_periods"),
            endpoint="/api/v1/finance/fiscal-periods/",
            items=fiscal_periods,
            match_fields=("fiscal_year", "period_number"),
            patch_payload={"status": "OPEN"},
            delete_key="FP-DEL",
            search_term="OPEN",
            company_id=company_id,
        )
        reports.append(report)

        # --------------------------------------------------------------------
        # 3. CHART OF ACCOUNTS
        # --------------------------------------------------------------------
        accounts = [
            # Assets
            ("1101", "Kas Kecil", "ASSET", "DEBIT", True, False),
            ("1102", "Bank Operasional", "ASSET", "DEBIT", True, True),
            ("1103", "Piutang Usaha", "ASSET", "DEBIT", False, True),
            ("1104", "Uang Muka dan Piutang Lain", "ASSET", "DEBIT", True, False),
            ("1201", "Peralatan Komputer", "ASSET", "DEBIT", True, False),
            ("1291", "Akumulasi Penyusutan", "ASSET", "CREDIT", True, False),

            # Liabilities
            ("2101", "Utang Usaha", "LIABILITY", "CREDIT", False, True),
            ("2102", "Utang Pajak", "LIABILITY", "CREDIT", True, True),
            ("2103", "Biaya Masih Harus Dibayar", "LIABILITY", "CREDIT", True, True),

            # Equity
            ("3101", "Modal Disetor", "EQUITY", "CREDIT", True, False),
            ("3201", "Laba Ditahan", "EQUITY", "CREDIT", True, False),

            # Revenue
            ("4101", "Pendapatan Jasa", "REVENUE", "CREDIT", True, False),
            ("4102", "Pendapatan Project", "REVENUE", "CREDIT", True, False),
            ("4103", "Pendapatan Teknologi", "REVENUE", "CREDIT", True, False),

            # Cost of Revenue
            ("5101", "Biaya Tenaga Project", "COGS", "DEBIT", True, False),
            ("5102", "Biaya Freelancer", "COGS", "DEBIT", True, False),
            ("5103", "Biaya Software Project", "COGS", "DEBIT", True, False),

            # Operating Expenses
            ("6101", "Beban Gaji", "EXPENSE", "DEBIT", True, False),
            ("6102", "Beban Sewa Kantor", "EXPENSE", "DEBIT", True, False),
            ("6103", "Beban Internet", "EXPENSE", "DEBIT", True, False),
            ("6104", "Beban Listrik", "EXPENSE", "DEBIT", True, False),
            ("6105", "Beban Transportasi", "EXPENSE", "DEBIT", True, False),
            ("6106", "Beban Marketing", "EXPENSE", "DEBIT", True, False),
            ("6107", "Beban Subscription Software", "EXPENSE", "DEBIT", True, False),
            ("6108", "Beban Profesional", "EXPENSE", "DEBIT", True, False),
            ("6109", "Beban Operasional Lain", "EXPENSE", "DEBIT", True, False),

            # Other
            ("7101", "Pendapatan Bunga", "OTHER_INCOME", "CREDIT", True, False),
            ("7201", "Biaya Administrasi Bank", "OTHER_EXPENSE", "DEBIT", True, False),
        ]

        account_items = [
            {
                "_key": code,
                "company": company_id,
                "currency": currency_id,
                "account_code": code,
                "account_name": name,
                "account_type": account_type,
                "normal_balance": normal_balance,
                "allow_manual_posting": allow_manual,
                "reconciliation_required": reconcile,
                "status": "ACTIVE",
            }
            for code, name, account_type, normal_balance, allow_manual, reconcile in accounts
        ]
        account_items.append(
            {
                "_key": "9999-DEL",
                "company": company_id,
                "currency": currency_id,
                "account_code": "9999-DEL",
                "account_name": "Delete Test Account",
                "account_type": "EXPENSE",
                "normal_balance": "DEBIT",
                "allow_manual_posting": True,
                "reconciliation_required": False,
                "status": "ACTIVE",
            }
        )

        report = client.seed_resource(
            stage_name="stage_8_finance.accounts",
            state_path=("stage_8_finance", "accounts"),
            endpoint="/api/v1/finance/accounts/",
            items=account_items,
            match_fields=("company", "account_code"),
            patch_payload={"status": "ACTIVE"},
            delete_key="9999-DEL",
            search_term="Pendapatan",
            company_id=company_id,
        )
        reports.append(report)

        bank_gl_id = client.require_state_id(
            ("stage_8_finance", "accounts", "1102"),
            "1102 Bank Operasional account",
        )
        ar_gl_id = client.require_state_id(
            ("stage_8_finance", "accounts", "1103"),
            "1103 Piutang Usaha account",
        )
        ap_gl_id = client.require_state_id(
            ("stage_8_finance", "accounts", "2101"),
            "2101 Utang Usaha account",
        )
        revenue_gl_id = client.require_state_id(
            ("stage_8_finance", "accounts", "4102"),
            "4102 Pendapatan Project account",
        )
        expense_gl_id = client.require_state_id(
            ("stage_8_finance", "accounts", "6109"),
            "6109 Beban Operasional Lain account",
        )

        # --------------------------------------------------------------------
        # 4. JOURNALS
        # --------------------------------------------------------------------
        journals = [
            {
                "_key": "JRN-SALES",
                "company": company_id,
                "journal_code": "SALES",
                "journal_name": "Sales Journal",
                "journal_type": "SALES",
                "status": "ACTIVE",
            },
            {
                "_key": "JRN-PURCHASE",
                "company": company_id,
                "journal_code": "PURCHASE",
                "journal_name": "Purchase Journal",
                "journal_type": "PURCHASE",
                "status": "ACTIVE",
            },
            {
                "_key": "JRN-BANK",
                "company": company_id,
                "journal_code": "BANK",
                "journal_name": "Bank Journal",
                "journal_type": "BANK",
                "status": "ACTIVE",
            },
            {
                "_key": "JRN-GENERAL",
                "company": company_id,
                "journal_code": "GENERAL",
                "journal_name": "General Journal",
                "journal_type": "GENERAL",
                "status": "ACTIVE",
            },
            {
                "_key": "JRN-DEL",
                "company": company_id,
                "journal_code": "DELETE",
                "journal_name": "Delete Test Journal",
                "journal_type": "GENERAL",
                "status": "ACTIVE",
            },
        ]

        report = client.seed_resource(
            stage_name="stage_8_finance.journals",
            state_path=("stage_8_finance", "journals"),
            endpoint="/api/v1/finance/journals/",
            items=journals,
            match_fields=("company", "journal_code"),
            patch_payload={"status": "ACTIVE"},
            delete_key="JRN-DEL",
            search_term="Bank",
            company_id=company_id,
        )
        reports.append(report)

        sales_journal_id = client.require_state_id(
            ("stage_8_finance", "journals", "JRN-SALES"),
            "sales journal",
        )
        purchase_journal_id = client.require_state_id(
            ("stage_8_finance", "journals", "JRN-PURCHASE"),
            "purchase journal",
        )
        bank_journal_id = client.require_state_id(
            ("stage_8_finance", "journals", "JRN-BANK"),
            "bank journal",
        )

        # --------------------------------------------------------------------
        # 5. BANK ACCOUNT
        # --------------------------------------------------------------------
        bank_accounts = [
            {
                "_key": "BANK-OPERATING-IDR",
                "company": company_id,
                "ledger_account": bank_gl_id,
                "currency": currency_id,
                "bank_name": "Bank Operasional Dummy",
                "account_number": "0000002026",
                "account_name": "PT Holding Utama Indonesia",
                "status": "ACTIVE",
            },
            {
                "_key": "BANK-DEL",
                "company": company_id,
                "ledger_account": bank_gl_id,
                "currency": currency_id,
                "bank_name": "Delete Test Bank",
                "account_number": "9999999999",
                "account_name": "Delete Test",
                "status": "INACTIVE",
            },
        ]

        report = client.seed_resource(
            stage_name="stage_8_finance.bank_accounts",
            state_path=("stage_8_finance", "bank_accounts"),
            endpoint="/api/v1/finance/bank-accounts/",
            items=bank_accounts,
            match_fields=("company", "account_number"),
            patch_payload={"status": "ACTIVE"},
            delete_key="BANK-DEL",
            search_term="Operasional",
            company_id=company_id,
        )
        reports.append(report)

        bank_account_id = client.require_state_id(
            ("stage_8_finance", "bank_accounts", "BANK-OPERATING-IDR"),
            "operating bank account",
        )

        # --------------------------------------------------------------------
        # 6. BILLING DOCUMENTS: 6 AR + 6 AP
        # --------------------------------------------------------------------
        billing_documents = []
        for month, invoice_date, revenue, expense, cash_in, cash_out in MONTHS:
            inv_date = date.fromisoformat(invoice_date)
            due = inv_date + timedelta(days=30)

            ar_paid = min(revenue, cash_in)
            ap_paid = min(expense, cash_out)

            billing_documents.append(
                {
                    "_key": f"AR-INV-2026-{month:02d}",
                    "company": company_id,
                    "party": customer_id,
                    "currency": currency_id,
                    "billing_type": "CUSTOMER_INVOICE",
                    "invoice_number": f"INV-2026-{month:04d}",
                    "invoice_date": inv_date.isoformat(),
                    "posting_date": inv_date.isoformat(),
                    "due_date": due.isoformat(),
                    "subtotal": money(revenue),
                    "tax_amount": "0.00",
                    "total_amount": money(revenue),
                    "paid_amount": money(ar_paid),
                    "outstanding_amount": money(revenue - ar_paid),
                    "payment_status": "PAID" if ar_paid >= revenue else "PARTIAL",
                    "status": "POSTED",
                }
            )
            billing_documents.append(
                {
                    "_key": f"AP-BILL-2026-{month:02d}",
                    "company": company_id,
                    "party": supplier_id,
                    "currency": currency_id,
                    "billing_type": "SUPPLIER_INVOICE",
                    "invoice_number": f"BILL-2026-{month:04d}",
                    "invoice_date": inv_date.isoformat(),
                    "posting_date": inv_date.isoformat(),
                    "due_date": due.isoformat(),
                    "subtotal": money(expense),
                    "tax_amount": "0.00",
                    "total_amount": money(expense),
                    "paid_amount": money(ap_paid),
                    "outstanding_amount": money(expense - ap_paid),
                    "payment_status": "PAID" if ap_paid >= expense else "PARTIAL",
                    "status": "POSTED",
                }
            )

        billing_documents.append(
            {
                "_key": "BILL-DEL",
                "company": company_id,
                "party": customer_id,
                "currency": currency_id,
                "billing_type": "CUSTOMER_INVOICE",
                "invoice_number": "INV-DELETE-TEST",
                "invoice_date": "2026-12-31",
                "posting_date": "2026-12-31",
                "due_date": "2027-01-30",
                "subtotal": "1000.00",
                "tax_amount": "0.00",
                "total_amount": "1000.00",
                "paid_amount": "0.00",
                "outstanding_amount": "1000.00",
                "payment_status": "UNPAID",
                "status": "DRAFT",
            }
        )

        report = client.seed_resource(
            stage_name="stage_8_finance.billing_documents",
            state_path=("stage_8_finance", "billing_documents"),
            endpoint="/api/v1/finance/billing-documents/",
            items=billing_documents,
            match_fields=("company", "invoice_number"),
            patch_payload={"status": "POSTED"},
            delete_key="BILL-DEL",
            search_term="INV-2026",
            company_id=company_id,
        )
        reports.append(report)

        # --------------------------------------------------------------------
        # 7. BILLING DOCUMENT LINES
        # --------------------------------------------------------------------
        billing_lines = []
        for month, _, revenue, expense, _, _ in MONTHS:
            ar_doc_id = client.require_state_id(
                ("stage_8_finance", "billing_documents", f"AR-INV-2026-{month:02d}"),
                f"AR invoice month {month}",
            )
            ap_doc_id = client.require_state_id(
                ("stage_8_finance", "billing_documents", f"AP-BILL-2026-{month:02d}"),
                f"AP bill month {month}",
            )

            billing_lines.extend(
                [
                    {
                        "_key": f"AR-LINE-2026-{month:02d}",
                        "billing_document": ar_doc_id,
                        "account": revenue_gl_id,
                        "quantity": "1.00",
                        "unit_price": money(revenue),
                        "discount_amount": "0.00",
                        "line_total": money(revenue),
                    },
                    {
                        "_key": f"AP-LINE-2026-{month:02d}",
                        "billing_document": ap_doc_id,
                        "account": expense_gl_id,
                        "quantity": "1.00",
                        "unit_price": money(expense),
                        "discount_amount": "0.00",
                        "line_total": money(expense),
                    },
                ]
            )

        report = client.seed_resource(
            stage_name="stage_8_finance.billing_document_lines",
            state_path=("stage_8_finance", "billing_document_lines"),
            endpoint="/api/v1/finance/billing-document-lines/",
            items=billing_lines,
            match_fields=("billing_document", "account", "line_total"),
            patch_payload={"discount_amount": "0.00"},
            search_term="",
            company_id=company_id,
        )
        reports.append(report)

        # --------------------------------------------------------------------
        # 8. AR/AP SCHEDULES
        # --------------------------------------------------------------------
        schedules = []
        for month, invoice_date, revenue, expense, cash_in, cash_out in MONTHS:
            inv_date = date.fromisoformat(invoice_date)
            due = inv_date + timedelta(days=30)

            ar_paid = min(revenue, cash_in)
            ap_paid = min(expense, cash_out)

            ar_doc_id = client.require_state_id(
                ("stage_8_finance", "billing_documents", f"AR-INV-2026-{month:02d}"),
                f"AR invoice month {month}",
            )
            ap_doc_id = client.require_state_id(
                ("stage_8_finance", "billing_documents", f"AP-BILL-2026-{month:02d}"),
                f"AP bill month {month}",
            )

            schedules.extend(
                [
                    {
                        "_key": f"AR-SCH-2026-{month:02d}",
                        "billing_document": ar_doc_id,
                        "installment_number": 1,
                        "due_date": due.isoformat(),
                        "original_amount": money(revenue),
                        "paid_amount": money(ar_paid),
                        "outstanding_amount": money(revenue - ar_paid),
                        "status": "PAID" if ar_paid >= revenue else "PARTIAL",
                    },
                    {
                        "_key": f"AP-SCH-2026-{month:02d}",
                        "billing_document": ap_doc_id,
                        "installment_number": 1,
                        "due_date": due.isoformat(),
                        "original_amount": money(expense),
                        "paid_amount": money(ap_paid),
                        "outstanding_amount": money(expense - ap_paid),
                        "status": "PAID" if ap_paid >= expense else "PARTIAL",
                    },
                ]
            )

        report = client.seed_resource(
            stage_name="stage_8_finance.arap_schedules",
            state_path=("stage_8_finance", "arap_schedules"),
            endpoint="/api/v1/finance/arap-schedules/",
            items=schedules,
            match_fields=("billing_document", "installment_number"),
            patch_payload={"installment_number": 1},
            search_term="OPEN",
            company_id=company_id,
        )
        reports.append(report)

        # --------------------------------------------------------------------
        # 9. PAYMENTS: 6 IN + 6 OUT
        # --------------------------------------------------------------------
        payments = []
        for month, invoice_date, _, _, cash_in, cash_out in MONTHS:
            payment_date = (date.fromisoformat(invoice_date) + timedelta(days=14)).isoformat()

            payments.extend(
                [
                    {
                        "_key": f"PAY-IN-2026-{month:02d}",
                        "company": company_id,
                        "party": customer_id,
                        "bank_account": bank_account_id,
                        "currency": currency_id,
                        "payment_type": "RECEIPT",
                        "payment_date": payment_date,
                        "amount": money(cash_in),
                        "payment_method": "BANK_TRANSFER",
                        "reference_number": f"RCPT-2026-{month:04d}",
                        "status": "ALLOCATED",
                    },
                    {
                        "_key": f"PAY-OUT-2026-{month:02d}",
                        "company": company_id,
                        "party": supplier_id,
                        "bank_account": bank_account_id,
                        "currency": currency_id,
                        "payment_type": "PAYMENT",
                        "payment_date": payment_date,
                        "amount": money(cash_out),
                        "payment_method": "BANK_TRANSFER",
                        "reference_number": f"PAY-2026-{month:04d}",
                        "status": "ALLOCATED",
                    },
                ]
            )

        report = client.seed_resource(
            stage_name="stage_8_finance.payments",
            state_path=("stage_8_finance", "payments"),
            endpoint="/api/v1/finance/payments/",
            items=payments,
            match_fields=("company", "reference_number"),
            patch_payload={"status": "ALLOCATED"},
            search_term="2026",
            company_id=company_id,
        )
        reports.append(report)

        # --------------------------------------------------------------------
        # 10. PAYMENT ALLOCATIONS
        # --------------------------------------------------------------------
        allocations = []
        for month, _, revenue, expense, cash_in, cash_out in MONTHS:
            ar_doc_id = client.require_state_id(
                ("stage_8_finance", "billing_documents", f"AR-INV-2026-{month:02d}"),
                f"AR invoice month {month}",
            )
            ap_doc_id = client.require_state_id(
                ("stage_8_finance", "billing_documents", f"AP-BILL-2026-{month:02d}"),
                f"AP bill month {month}",
            )
            ar_schedule_id = client.require_state_id(
                ("stage_8_finance", "arap_schedules", f"AR-SCH-2026-{month:02d}"),
                f"AR schedule month {month}",
            )
            ap_schedule_id = client.require_state_id(
                ("stage_8_finance", "arap_schedules", f"AP-SCH-2026-{month:02d}"),
                f"AP schedule month {month}",
            )
            pay_in_id = client.require_state_id(
                ("stage_8_finance", "payments", f"PAY-IN-2026-{month:02d}"),
                f"incoming payment month {month}",
            )
            pay_out_id = client.require_state_id(
                ("stage_8_finance", "payments", f"PAY-OUT-2026-{month:02d}"),
                f"outgoing payment month {month}",
            )

            allocations.extend(
                [
                    {
                        "_key": f"ALLOC-IN-2026-{month:02d}",
                        "payment": pay_in_id,
                        "billing_document": ar_doc_id,
                        "schedule": ar_schedule_id,
                        "allocated_amount": money(min(revenue, cash_in)),
                        "discount_amount": "0.00",
                        "write_off_amount": "0.00",
                        "exchange_difference": "0.00",
                    },
                    {
                        "_key": f"ALLOC-OUT-2026-{month:02d}",
                        "payment": pay_out_id,
                        "billing_document": ap_doc_id,
                        "schedule": ap_schedule_id,
                        "allocated_amount": money(min(expense, cash_out)),
                        "discount_amount": "0.00",
                        "write_off_amount": "0.00",
                        "exchange_difference": "0.00",
                    },
                ]
            )

        report = client.seed_resource(
            stage_name="stage_8_finance.payment_allocations",
            state_path=("stage_8_finance", "payment_allocations"),
            endpoint="/api/v1/finance/payment-allocations/",
            items=allocations,
            match_fields=("payment", "billing_document"),
            patch_payload={"exchange_difference": "0.00"},
            search_term="",
            company_id=company_id,
        )
        reports.append(report)

        # --------------------------------------------------------------------
        # 11. JOURNAL ENTRIES
        #     4 per month:
        #       A. customer invoice    Dr AR / Cr Revenue
        #       B. supplier bill       Dr Expense / Cr AP
        #       C. customer receipt    Dr Bank / Cr AR
        #       D. supplier payment    Dr AP / Cr Bank
        # --------------------------------------------------------------------
        journal_entries: list[dict] = []
        journal_blueprints: dict[str, list[dict]] = {}

        for month, invoice_date, revenue, expense, cash_in, cash_out in MONTHS:
            period_id = client.require_state_id(
                ("stage_8_finance", "fiscal_periods", f"FP-2026-{month:02d}"),
                f"fiscal period month {month}",
            )
            payment_date = (date.fromisoformat(invoice_date) + timedelta(days=14)).isoformat()

            definitions = [
                (
                    f"JE-AR-2026-{month:02d}",
                    sales_journal_id,
                    invoice_date,
                    f"Customer invoice month {month}",
                    [
                        {"account": ar_gl_id, "party": customer_id, "debit_base": money(revenue), "credit_base": "0.00"},
                        {"account": revenue_gl_id, "party": customer_id, "debit_base": "0.00", "credit_base": money(revenue)},
                    ],
                ),
                (
                    f"JE-AP-2026-{month:02d}",
                    purchase_journal_id,
                    invoice_date,
                    f"Supplier bill month {month}",
                    [
                        {"account": expense_gl_id, "party": supplier_id, "debit_base": money(expense), "credit_base": "0.00"},
                        {"account": ap_gl_id, "party": supplier_id, "debit_base": "0.00", "credit_base": money(expense)},
                    ],
                ),
                (
                    f"JE-RCPT-2026-{month:02d}",
                    bank_journal_id,
                    payment_date,
                    f"Customer receipt month {month}",
                    [
                        {"account": bank_gl_id, "party": customer_id, "debit_base": money(cash_in), "credit_base": "0.00"},
                        {"account": ar_gl_id, "party": customer_id, "debit_base": "0.00", "credit_base": money(cash_in)},
                    ],
                ),
                (
                    f"JE-PAY-2026-{month:02d}",
                    bank_journal_id,
                    payment_date,
                    f"Supplier payment month {month}",
                    [
                        {"account": ap_gl_id, "party": supplier_id, "debit_base": money(cash_out), "credit_base": "0.00"},
                        {"account": bank_gl_id, "party": supplier_id, "debit_base": "0.00", "credit_base": money(cash_out)},
                    ],
                ),
            ]

            for key, journal_id, posting_date, description, lines in definitions:
                journal_entries.append(
                    {
                        "_key": key,
                        "entry_number": key,
                        "posting_date": posting_date,
                        "exchange_rate": "1.000000",
                        "description": description,
                        "status": "POSTED",
                        "journal": journal_id,
                        "fiscal_period": period_id,
                        "currency": currency_id,
                    }
                )
                journal_blueprints[key] = lines

        validate_balanced(journal_entries, journal_blueprints)

        report = client.seed_resource(
            stage_name="stage_8_finance.journal_entries",
            state_path=("stage_8_finance", "journal_entries"),
            endpoint="/api/v1/finance/journal-entries/",
            items=journal_entries,
            match_fields=("entry_number",),
            patch_payload={"status": "POSTED"},
            search_term="JE-",
            company_id=company_id,
        )
        reports.append(report)

        # --------------------------------------------------------------------
        # 12. JOURNAL LINES
        # --------------------------------------------------------------------
        journal_lines = []
        for entry in journal_entries:
            entry_key = entry["_key"]
            entry_id = client.require_state_id(
                ("stage_8_finance", "journal_entries", entry_key),
                entry_key,
            )
            for idx, line in enumerate(journal_blueprints[entry_key], start=1):
                journal_lines.append(
                    {
                        "_key": f"{entry_key}-L{idx}",
                        "journal_entry": entry_id,
                        "account": line["account"],
                        "party": line.get("party"),
                        "debit_base": line["debit_base"],
                        "credit_base": line["credit_base"],
                        "transaction_amount": money(
                            Decimal(line["debit_base"]) - Decimal(line["credit_base"])
                        ),
                        "transaction_currency": currency_id,
                    }
                )

        report = client.seed_resource(
            stage_name="stage_8_finance.journal_lines",
            state_path=("stage_8_finance", "journal_lines"),
            endpoint="/api/v1/finance/journal-lines/",
            items=journal_lines,
            match_fields=("journal_entry", "account", "debit_base", "credit_base"),
            patch_payload={"transaction_currency": currency_id},
            search_term="",
            company_id=company_id,
        )
        reports.append(report)


        # ====================================================================
        # 13. BANKING — STATEMENTS, LINES, RECONCILIATION
        # ====================================================================
        opening_balance = Decimal("100000000.00")
        running_opening = opening_balance
        bank_statements = []
        monthly_bank_meta: dict[int, dict] = {}

        for month, invoice_date, _revenue, _expense, cash_in, cash_out in MONTHS:
            statement_date = month_end(2026, month)
            closing = running_opening + cash_in - cash_out
            key = f"BST-2026-{month:02d}"
            bank_statements.append(
                {
                    "_key": key,
                    "bank_account": bank_account_id,
                    "statement_date": statement_date.isoformat(),
                    "opening_balance": money(running_opening),
                    "closing_balance": money(closing),
                    "status": "IMPORTED",
                }
            )
            monthly_bank_meta[month] = {
                "opening": running_opening,
                "closing": closing,
                "cash_in": cash_in,
                "cash_out": cash_out,
                "payment_date": (date.fromisoformat(invoice_date) + timedelta(days=14)),
            }
            running_opening = closing

        bank_statements.append(
            {
                "_key": "BST-DEL",
                "bank_account": bank_account_id,
                "statement_date": "2026-12-31",
                "opening_balance": "0.00",
                "closing_balance": "0.00",
                "status": "TEST",
            }
        )

        report = client.seed_resource(
            stage_name="stage_8_finance.bank_statements",
            state_path=("stage_8_finance", "bank_statements"),
            endpoint="/api/v1/finance/bank-statements/",
            items=bank_statements,
            match_fields=("bank_account", "statement_date"),
            patch_payload={"status": "IMPORTED"},
            delete_key="BST-DEL",
            search_term="IMPORTED",
            company_id=company_id,
        )
        reports.append(report)

        statement_lines = []
        for month, *_ in MONTHS:
            statement_id = client.require_state_id(
                ("stage_8_finance", "bank_statements", f"BST-2026-{month:02d}"),
                f"bank statement month {month}",
            )
            meta = monthly_bank_meta[month]
            receipt_balance = meta["opening"] + meta["cash_in"]
            closing_balance = meta["closing"]

            statement_lines.extend(
                [
                    {
                        "_key": f"BSL-IN-2026-{month:02d}",
                        "bank_statement": statement_id,
                        "transaction_date": meta["payment_date"].isoformat(),
                        "reference_number": f"RCPT-2026-{month:04d}",
                        "description": f"Customer receipt month {month}",
                        "debit_amount": "0.00",
                        "credit_amount": money(meta["cash_in"]),
                        "running_balance": money(receipt_balance),
                    },
                    {
                        "_key": f"BSL-OUT-2026-{month:02d}",
                        "bank_statement": statement_id,
                        "transaction_date": meta["payment_date"].isoformat(),
                        "reference_number": f"PAY-2026-{month:04d}",
                        "description": f"Supplier payment month {month}",
                        "debit_amount": money(meta["cash_out"]),
                        "credit_amount": "0.00",
                        "running_balance": money(closing_balance),
                    },
                ]
            )

        statement_lines.append(
            {
                "_key": "BSL-DEL",
                "bank_statement": client.require_state_id(
                    ("stage_8_finance", "bank_statements", "BST-2026-01"),
                    "January bank statement",
                ),
                "transaction_date": "2026-01-31",
                "reference_number": "BANK-LINE-DELETE",
                "description": "Delete test bank line",
                "debit_amount": "0.00",
                "credit_amount": "1.00",
                "running_balance": "1.00",
            }
        )

        report = client.seed_resource(
            stage_name="stage_8_finance.bank_statement_lines",
            state_path=("stage_8_finance", "bank_statement_lines"),
            endpoint="/api/v1/finance/bank-statement-lines/",
            items=statement_lines,
            match_fields=("bank_statement", "reference_number"),
            patch_payload={"description": "Finance Q1-Q2 bank movement"},
            delete_key="BSL-DEL",
            search_term="Customer",
            company_id=company_id,
        )
        reports.append(report)

        jan_receipt_line_id = client.require_state_id(
            ("stage_8_finance", "bank_statement_lines", "BSL-IN-2026-01"),
            "January receipt bank statement line",
        )
        feb_receipt_line_id = client.require_state_id(
            ("stage_8_finance", "bank_statement_lines", "BSL-IN-2026-02"),
            "February receipt bank statement line",
        )
        jan_payment_id = client.require_state_id(
            ("stage_8_finance", "payments", "PAY-IN-2026-01"),
            "January customer receipt",
        )
        feb_payment_id = client.require_state_id(
            ("stage_8_finance", "payments", "PAY-IN-2026-02"),
            "February customer receipt",
        )

        reconciliations = [
            {
                "_key": "BREC-2026-01",
                "bank_statement_line": jan_receipt_line_id,
                "payment": jan_payment_id,
                "matched_amount": money(MONTHS[0][4]),
                "match_type": "MANUAL_SEED",
                "status": "MATCHED",
            },
            {
                "_key": "BREC-DEL",
                "bank_statement_line": feb_receipt_line_id,
                "payment": feb_payment_id,
                "matched_amount": money(MONTHS[1][4]),
                "match_type": "DELETE_TEST",
                "status": "MATCHED",
            },
        ]
        report = client.seed_resource(
            stage_name="stage_8_finance.bank_reconciliations",
            state_path=("stage_8_finance", "bank_reconciliations"),
            endpoint="/api/v1/finance/bank-reconciliations/",
            items=reconciliations,
            match_fields=("bank_statement_line", "payment"),
            patch_payload={"status": "MATCHED"},
            delete_key="BREC-DEL",
            search_term="MATCHED",
            company_id=company_id,
        )
        reports.append(report)

        # ====================================================================
        # 14. TAX TRANSACTIONS
        # ====================================================================
        tax_transactions = []
        for month, *_ in MONTHS:
            billing_id = client.require_state_id(
                ("stage_8_finance", "billing_documents", f"AR-INV-2026-{month:02d}"),
                f"AR billing month {month}",
            )
            billing_line_id = client.require_state_id(
                ("stage_8_finance", "billing_document_lines", f"AR-LINE-2026-{month:02d}"),
                f"AR billing line month {month}",
            )
            revenue = MONTHS[month - 1][2]
            tax_transactions.append(
                {
                    "_key": f"TAX-OUT-2026-{month:02d}",
                    "billing_document": billing_id,
                    "billing_document_line": billing_line_id,
                    # tax_code is intentionally nullable in the current scaffold.
                    # Stage 3 currently does not seed TaxCode, so this Finance-only
                    # dataset records a NON_TAXABLE/zero-tax transaction.
                    "taxable_amount": money(revenue),
                    "tax_rate": "0.00",
                    "tax_amount": "0.00",
                    "tax_direction": "OUTPUT",
                    "tax_date": f"2026-{month:02d}-15",
                }
            )
        tax_transactions.append(
            {
                "_key": "TAX-DEL",
                "billing_document": client.require_state_id(
                    ("stage_8_finance", "billing_documents", "AR-INV-2026-01"),
                    "January AR billing",
                ),
                "billing_document_line": client.require_state_id(
                    ("stage_8_finance", "billing_document_lines", "AR-LINE-2026-01"),
                    "January AR billing line",
                ),
                "taxable_amount": "1.00",
                "tax_rate": "0.00",
                "tax_amount": "0.00",
                "tax_direction": "OUTPUT",
                "tax_date": "2026-01-16",
            }
        )

        report = client.seed_resource(
            stage_name="stage_8_finance.tax_transactions",
            state_path=("stage_8_finance", "tax_transactions"),
            endpoint="/api/v1/finance/tax-transactions/",
            items=tax_transactions,
            match_fields=("billing_document", "billing_document_line", "tax_date"),
            patch_payload={"tax_direction": "OUTPUT"},
            delete_key="TAX-DEL",
            search_term="OUTPUT",
            company_id=company_id,
        )
        reports.append(report)

        # ====================================================================
        # 15. BUDGET + BUDGET LINES
        # ====================================================================
        budgets = [
            {
                "_key": "BUD-FY2026-OPERATING",
                "company": company_id,
                "fiscal_year": fiscal_year_id,
                "budget_name": "Operating Budget FY2026",
                "budget_type": "OPERATING",
                "status": "APPROVED",
            },
            {
                "_key": "BUD-DEL",
                "company": company_id,
                "fiscal_year": fiscal_year_id,
                "budget_name": "Delete Test Budget",
                "budget_type": "TEST",
                "status": "DRAFT",
            },
        ]
        report = client.seed_resource(
            stage_name="stage_8_finance.budgets",
            state_path=("stage_8_finance", "budgets"),
            endpoint="/api/v1/finance/budgets/",
            items=budgets,
            match_fields=("company", "fiscal_year", "budget_name"),
            patch_payload={"status": "APPROVED"},
            delete_key="BUD-DEL",
            search_term="Operating",
            company_id=company_id,
        )
        reports.append(report)

        budget_id = client.require_state_id(
            ("stage_8_finance", "budgets", "BUD-FY2026-OPERATING"),
            "FY2026 operating budget",
        )
        budget_lines = []
        for month, _date_value, revenue, expense, *_ in MONTHS:
            budget_lines.extend(
                [
                    {
                        "_key": f"BUD-REV-{month:02d}",
                        "budget": budget_id,
                        "account": revenue_gl_id,
                        "period_number": month,
                        "budget_amount": money(revenue * Decimal("1.10")),
                    },
                    {
                        "_key": f"BUD-EXP-{month:02d}",
                        "budget": budget_id,
                        "account": expense_gl_id,
                        "period_number": month,
                        "budget_amount": money(expense * Decimal("1.15")),
                    },
                ]
            )
        budget_lines.append(
            {
                "_key": "BUD-LINE-DEL",
                "budget": budget_id,
                "account": expense_gl_id,
                "period_number": 12,
                "budget_amount": "1.00",
            }
        )

        report = client.seed_resource(
            stage_name="stage_8_finance.budget_lines",
            state_path=("stage_8_finance", "budget_lines"),
            endpoint="/api/v1/finance/budget-lines/",
            items=budget_lines,
            match_fields=("budget", "account", "period_number"),
            patch_payload={"budget_amount": money(MONTHS[0][3] * Decimal("1.15"))},
            delete_key="BUD-LINE-DEL",
            search_term="",
            company_id=company_id,
        )
        reports.append(report)

        # ====================================================================
        # 16. PERIOD CLOSINGS
        # ====================================================================
        jan_period_id = client.require_state_id(
            ("stage_8_finance", "fiscal_periods", "FP-2026-01"),
            "January fiscal period",
        )
        period_closings = [
            {
                "_key": "PCLOSE-JAN-2026",
                "fiscal_period": jan_period_id,
                "started_at": "2026-02-01T00:05:00+07:00",
                "completed_at": "2026-02-01T00:10:00+07:00",
                "closing_type": "MONTHLY_SEED_HISTORY",
                "status": "COMPLETED",
            },
            {
                "_key": "PCLOSE-DEL",
                "fiscal_period": jan_period_id,
                "started_at": "2026-02-01T00:20:00+07:00",
                "completed_at": "2026-02-01T00:21:00+07:00",
                "closing_type": "DELETE_TEST",
                "status": "COMPLETED",
            },
        ]
        report = client.seed_resource(
            stage_name="stage_8_finance.period_closings",
            state_path=("stage_8_finance", "period_closings"),
            endpoint="/api/v1/finance/period-closings/",
            items=period_closings,
            match_fields=("fiscal_period", "closing_type", "started_at"),
            patch_payload={"status": "COMPLETED"},
            delete_key="PCLOSE-DEL",
            search_term="MONTHLY",
            company_id=company_id,
        )
        reports.append(report)

        # ====================================================================
        # 17. FINANCIAL SNAPSHOTS — MONTHLY Q1/Q2
        # ====================================================================
        cumulative_cash = opening_balance
        financial_snapshots = []
        for month, _invoice_date, revenue, expense, cash_in, cash_out in MONTHS:
            cumulative_cash += cash_in - cash_out
            period_id = client.require_state_id(
                ("stage_8_finance", "fiscal_periods", f"FP-2026-{month:02d}"),
                f"fiscal period {month}",
            )
            financial_snapshots.append(
                {
                    "_key": f"FSNAP-2026-{month:02d}",
                    "company": company_id,
                    "fiscal_period": period_id,
                    "snapshot_at": f"2026-{month:02d}-{month_end(2026, month).day:02d}T23:59:00+07:00",
                    "revenue_amount": money(revenue),
                    "expense_amount": money(expense),
                    "profit_loss_amount": money(revenue - expense),
                    "operating_cashflow": money(cash_in - cash_out),
                    "investing_cashflow": "0.00",
                    "financing_cashflow": "0.00",
                    "cash_balance": money(cumulative_cash),
                    "snapshot_status": "FINAL",
                }
            )
        financial_snapshots.append(
            {
                "_key": "FSNAP-DEL",
                "company": company_id,
                "fiscal_period": jan_period_id,
                "snapshot_at": "2026-01-01T00:01:00+07:00",
                "revenue_amount": "0.00",
                "expense_amount": "0.00",
                "profit_loss_amount": "0.00",
                "operating_cashflow": "0.00",
                "investing_cashflow": "0.00",
                "financing_cashflow": "0.00",
                "cash_balance": "0.00",
                "snapshot_status": "TEST",
            }
        )

        report = client.seed_resource(
            stage_name="stage_8_finance.financial_snapshots",
            state_path=("stage_8_finance", "financial_snapshots"),
            endpoint="/api/v1/finance/financial-snapshots/",
            items=financial_snapshots,
            match_fields=("company", "fiscal_period", "snapshot_at"),
            patch_payload={"snapshot_status": "FINAL"},
            delete_key="FSNAP-DEL",
            search_term="FINAL",
            company_id=company_id,
        )
        reports.append(report)

        # ====================================================================
        # 18. UNIT COST / HPP SNAPSHOTS
        # ====================================================================
        unit_cost_snapshots = [
            {
                "_key": "UCOST-PROJ003-JUN",
                "company": company_id,
                "project": project_id,
                "product": product_id,
                "cost_unit_code": "PROJ003-PROD-A-JUN26",
                "snapshot_at": "2026-06-30T23:55:00+07:00",
                "material_cost": "18000000.00",
                "labor_cost": "12500000.00",
                "machine_cost": "2500000.00",
                "overhead_cost": "3500000.00",
                "total_cost": "36500000.00",
                "output_quantity": "100.00",
                "unit_cost": "365000.00",
            },
            {
                "_key": "UCOST-DEL",
                "company": company_id,
                "project": project_id,
                "product": product_id,
                "cost_unit_code": "DELETE-UNIT-COST",
                "snapshot_at": "2026-06-01T00:00:00+07:00",
                "material_cost": "1.00",
                "labor_cost": "0.00",
                "machine_cost": "0.00",
                "overhead_cost": "0.00",
                "total_cost": "1.00",
                "output_quantity": "1.00",
                "unit_cost": "1.00",
            },
        ]
        report = client.seed_resource(
            stage_name="stage_8_finance.unit_cost_snapshots",
            state_path=("stage_8_finance", "unit_cost_snapshots"),
            endpoint="/api/v1/finance/unit-cost-snapshots/",
            items=unit_cost_snapshots,
            match_fields=("company", "cost_unit_code", "snapshot_at"),
            patch_payload={"total_cost": "36500000.00"},
            delete_key="UCOST-DEL",
            search_term="PROJ003",
            company_id=company_id,
        )
        reports.append(report)

        # ====================================================================
        # 19. RECURRING PAYMENTS
        # ====================================================================
        recurring_rules = [
            {
                "_key": "RPR-SOFTWARE-MONTHLY",
                "company": company_id,
                "party": supplier_id,
                "bank_account": bank_account_id,
                "expense_account": expense_gl_id,
                "currency": currency_id,
                "rule_code": "RPR-SOFTWARE-MONTHLY",
                "amount": "5000000.00",
                "recurrence_rule": "FREQ=MONTHLY;BYMONTHDAY=25",
                "next_run_date": "2026-07-25",
                "end_date": "2026-12-25",
                "approval_required": True,
                "status": "ACTIVE",
            },
            {
                "_key": "RPR-DEL",
                "company": company_id,
                "party": supplier_id,
                "bank_account": bank_account_id,
                "expense_account": expense_gl_id,
                "currency": currency_id,
                "rule_code": "RPR-DELETE",
                "amount": "1.00",
                "recurrence_rule": "FREQ=MONTHLY",
                "next_run_date": "2026-12-01",
                "approval_required": False,
                "status": "INACTIVE",
            },
        ]
        report = client.seed_resource(
            stage_name="stage_8_finance.recurring_payment_rules",
            state_path=("stage_8_finance", "recurring_payment_rules"),
            endpoint="/api/v1/finance/recurring-payment-rules/",
            items=recurring_rules,
            match_fields=("company", "rule_code"),
            patch_payload={"status": "ACTIVE"},
            delete_key="RPR-DEL",
            search_term="SOFTWARE",
            company_id=company_id,
        )
        reports.append(report)

        recurring_rule_id = client.require_state_id(
            ("stage_8_finance", "recurring_payment_rules", "RPR-SOFTWARE-MONTHLY"),
            "software recurring payment rule",
        )
        recurring_runs = [
            {
                "_key": "RPRUN-2026-06",
                "recurring_rule": recurring_rule_id,
                "scheduled_date": "2026-06-25",
                "executed_at": "2026-06-25T09:00:00+07:00",
                "run_status": "COMPLETED",
                "failure_reason": "",
            },
            {
                "_key": "RPRUN-DEL",
                "recurring_rule": recurring_rule_id,
                "scheduled_date": "2026-12-25",
                "run_status": "TEST",
                "failure_reason": "",
            },
        ]
        report = client.seed_resource(
            stage_name="stage_8_finance.recurring_payment_runs",
            state_path=("stage_8_finance", "recurring_payment_runs"),
            endpoint="/api/v1/finance/recurring-payment-runs/",
            items=recurring_runs,
            match_fields=("recurring_rule", "scheduled_date"),
            patch_payload={"run_status": "COMPLETED"},
            delete_key="RPRUN-DEL",
            search_term="COMPLETED",
            company_id=company_id,
        )
        reports.append(report)

        # ====================================================================
        # 20. CREDIT FACILITY
        # ====================================================================
        credit_facilities = [
            {
                "_key": "CREDIT-WORKING-CAPITAL",
                "company": company_id,
                "party": supplier_id,
                "currency": currency_id,
                "facility_type": "WORKING_CAPITAL",
                "facility_number": "CF-WC-2026-001",
                "credit_limit": "500000000.00",
                "utilized_amount": "120000000.00",
                "available_amount": "380000000.00",
                "effective_from": "2026-01-01",
                "effective_to": "2026-12-31",
                "status": "ACTIVE",
            },
            {
                "_key": "CREDIT-DEL",
                "company": company_id,
                "party": supplier_id,
                "currency": currency_id,
                "facility_type": "TEST",
                "facility_number": "CF-DELETE",
                "credit_limit": "1.00",
                "utilized_amount": "0.00",
                "available_amount": "1.00",
                "effective_from": "2026-12-01",
                "effective_to": "2026-12-31",
                "status": "INACTIVE",
            },
        ]
        report = client.seed_resource(
            stage_name="stage_8_finance.credit_facilities",
            state_path=("stage_8_finance", "credit_facilities"),
            endpoint="/api/v1/finance/credit-facilities/",
            items=credit_facilities,
            match_fields=("company", "facility_number"),
            patch_payload={"status": "ACTIVE"},
            delete_key="CREDIT-DEL",
            search_term="CF-WC",
            company_id=company_id,
        )
        reports.append(report)

        # ====================================================================
        # 21. PROJECT WIP — JUNE 2026
        # ====================================================================
        jun_period_id = client.require_state_id(
            ("stage_8_finance", "fiscal_periods", "FP-2026-06"),
            "June fiscal period",
        )
        project_wip = [
            {
                "_key": "WIP-PROJ003-JUN",
                "project": project_id,
                "fiscal_period": jun_period_id,
                "snapshot_date": "2026-06-30",
                "completion_percent": "40.00",
                "recognized_revenue": "220000000.00",
                "recognized_cost": "95000000.00",
                "wip_asset_amount": "125000000.00",
                "accrued_billing_amount": "100000000.00",
                "unbilled_amount": "120000000.00",
                "status": "FINAL",
            },
            {
                "_key": "WIP-DEL",
                "project": project_id,
                "fiscal_period": jun_period_id,
                "snapshot_date": "2026-06-01",
                "completion_percent": "0.00",
                "recognized_revenue": "0.00",
                "recognized_cost": "0.00",
                "wip_asset_amount": "0.00",
                "accrued_billing_amount": "0.00",
                "unbilled_amount": "0.00",
                "status": "TEST",
            },
        ]
        report = client.seed_resource(
            stage_name="stage_8_finance.project_wip_snapshots",
            state_path=("stage_8_finance", "project_wip_snapshots"),
            endpoint="/api/v1/finance/project-wip-snapshots/",
            items=project_wip,
            match_fields=("project", "fiscal_period", "snapshot_date"),
            patch_payload={"status": "FINAL"},
            delete_key="WIP-DEL",
            search_term="FINAL",
            company_id=company_id,
        )
        reports.append(report)

        # ====================================================================
        # 22. PROJECT FUNDING + TRANSACTIONS
        # ====================================================================
        project_fundings = [
            {
                "_key": "PFUND-PROJ003",
                "project": project_id,
                "funding_source_party": customer_id,
                "currency": currency_id,
                "funding_type": "CUSTOMER_ADVANCE",
                "approved_limit": "1000000000.00",
                "interest_rate": "0.00",
                "start_date": "2026-06-01",
                "maturity_date": "2026-12-31",
                "status": "ACTIVE",
            },
            {
                "_key": "PFUND-DEL",
                "project": project_id,
                "funding_source_party": customer_id,
                "currency": currency_id,
                "funding_type": "TEST",
                "approved_limit": "1.00",
                "interest_rate": "0.00",
                "start_date": "2026-12-01",
                "maturity_date": "2026-12-31",
                "status": "INACTIVE",
            },
        ]
        report = client.seed_resource(
            stage_name="stage_8_finance.project_fundings",
            state_path=("stage_8_finance", "project_fundings"),
            endpoint="/api/v1/finance/project-fundings/",
            items=project_fundings,
            match_fields=("project", "funding_type", "start_date"),
            patch_payload={"status": "ACTIVE"},
            delete_key="PFUND-DEL",
            search_term="CUSTOMER",
            company_id=company_id,
        )
        reports.append(report)

        project_funding_id = client.require_state_id(
            ("stage_8_finance", "project_fundings", "PFUND-PROJ003"),
            "PROJ003 funding",
        )
        june_payment_id = client.require_state_id(
            ("stage_8_finance", "payments", "PAY-IN-2026-06"),
            "June customer receipt",
        )
        june_je_id = client.require_state_id(
            ("stage_8_finance", "journal_entries", "JE-RCPT-2026-06"),
            "June receipt journal entry",
        )
        funding_transactions = [
            {
                "_key": "PFUND-TXN-JUN",
                "project_funding": project_funding_id,
                "payment": june_payment_id,
                "journal_entry": june_je_id,
                "transaction_type": "DRAW_DOWN",
                "transaction_date": "2026-06-29",
                "amount": money(MONTHS[5][4]),
                "outstanding_balance": money(Decimal("1000000000.00") - MONTHS[5][4]),
            },
            {
                "_key": "PFUND-TXN-DEL",
                "project_funding": project_funding_id,
                "transaction_type": "TEST",
                "transaction_date": "2026-06-01",
                "amount": "1.00",
                "outstanding_balance": "999999999.00",
            },
        ]
        report = client.seed_resource(
            stage_name="stage_8_finance.project_funding_transactions",
            state_path=("stage_8_finance", "project_funding_transactions"),
            endpoint="/api/v1/finance/project-funding-transactions/",
            items=funding_transactions,
            match_fields=("project_funding", "transaction_type", "transaction_date"),
            patch_payload={"outstanding_balance": money(Decimal("1000000000.00") - MONTHS[5][4])},
            delete_key="PFUND-TXN-DEL",
            search_term="DRAW",
            company_id=company_id,
        )
        reports.append(report)

        # ====================================================================
        # 23. IDEAL COST BASELINE + LINES + VARIANCES
        # ====================================================================
        manpower_gl_id = client.require_state_id(
            ("stage_8_finance", "accounts", "5101"),
            "5101 Project Manpower account",
        )
        software_gl_id = client.require_state_id(
            ("stage_8_finance", "accounts", "5103"),
            "5103 Project Software account",
        )

        baselines = [
            {
                "_key": "CBL-PROJ003-V1",
                "project": project_id,
                "baseline_version": 1,
                "effective_date": "2026-06-01",
                "total_ideal_cost": "1200000000.00",
                "status": "APPROVED",
            },
            {
                "_key": "CBL-DEL",
                "project": project_id,
                "baseline_version": 99,
                "effective_date": "2026-12-01",
                "total_ideal_cost": "1.00",
                "status": "DRAFT",
            },
        ]
        report = client.seed_resource(
            stage_name="stage_8_finance.cost_baselines",
            state_path=("stage_8_finance", "cost_baselines"),
            endpoint="/api/v1/finance/cost-baselines/",
            items=baselines,
            match_fields=("project", "baseline_version", "effective_date"),
            patch_payload={"status": "APPROVED"},
            delete_key="CBL-DEL",
            search_term="APPROVED",
            company_id=company_id,
        )
        reports.append(report)

        baseline_id = client.require_state_id(
            ("stage_8_finance", "cost_baselines", "CBL-PROJ003-V1"),
            "PROJ003 cost baseline",
        )
        baseline_lines = [
            {
                "_key": "CBLL-LABOR",
                "cost_baseline": baseline_id,
                "account": manpower_gl_id,
                "cost_element": "LABOR",
                "quantity": "4000.00",
                "unit_rate": "100000.00",
                "ideal_amount": "400000000.00",
            },
            {
                "_key": "CBLL-SOFTWARE",
                "cost_baseline": baseline_id,
                "product": product_id,
                "account": software_gl_id,
                "cost_element": "SOFTWARE",
                "quantity": "12.00",
                "unit_rate": "25000000.00",
                "ideal_amount": "300000000.00",
            },
            {
                "_key": "CBLL-OPERATIONS",
                "cost_baseline": baseline_id,
                "account": expense_gl_id,
                "cost_element": "OPERATIONS",
                "quantity": "10.00",
                "unit_rate": "50000000.00",
                "ideal_amount": "500000000.00",
            },
            {
                "_key": "CBLL-DEL",
                "cost_baseline": baseline_id,
                "account": expense_gl_id,
                "cost_element": "DELETE_TEST",
                "quantity": "1.00",
                "unit_rate": "1.00",
                "ideal_amount": "1.00",
            },
        ]
        report = client.seed_resource(
            stage_name="stage_8_finance.cost_baseline_lines",
            state_path=("stage_8_finance", "cost_baseline_lines"),
            endpoint="/api/v1/finance/cost-baseline-lines/",
            items=baseline_lines,
            match_fields=("cost_baseline", "cost_element", "account"),
            patch_payload={"quantity": "4000.00"},
            delete_key="CBLL-DEL",
            search_term="LABOR",
            company_id=company_id,
        )
        reports.append(report)

        labor_baseline_line_id = client.require_state_id(
            ("stage_8_finance", "cost_baseline_lines", "CBLL-LABOR"),
            "labor baseline line",
        )
        software_baseline_line_id = client.require_state_id(
            ("stage_8_finance", "cost_baseline_lines", "CBLL-SOFTWARE"),
            "software baseline line",
        )
        cost_variances = [
            {
                "_key": "CVAR-LABOR-JUN",
                "project": project_id,
                "cost_baseline_line": labor_baseline_line_id,
                "fiscal_period": jun_period_id,
                "actual_amount": "420000000.00",
                "ideal_amount": "400000000.00",
                "variance_amount": "20000000.00",
                "variance_percent": "5.00",
                "calculated_at": "2026-06-30T23:40:00+07:00",
            },
            {
                "_key": "CVAR-SOFTWARE-JUN",
                "project": project_id,
                "cost_baseline_line": software_baseline_line_id,
                "fiscal_period": jun_period_id,
                "actual_amount": "285000000.00",
                "ideal_amount": "300000000.00",
                "variance_amount": "-15000000.00",
                "variance_percent": "-5.00",
                "calculated_at": "2026-06-30T23:41:00+07:00",
            },
            {
                "_key": "CVAR-DEL",
                "project": project_id,
                "cost_baseline_line": labor_baseline_line_id,
                "fiscal_period": jun_period_id,
                "actual_amount": "1.00",
                "ideal_amount": "1.00",
                "variance_amount": "0.00",
                "variance_percent": "0.00",
                "calculated_at": "2026-06-01T00:00:00+07:00",
            },
        ]
        report = client.seed_resource(
            stage_name="stage_8_finance.cost_variances",
            state_path=("stage_8_finance", "cost_variances"),
            endpoint="/api/v1/finance/cost-variances/",
            items=cost_variances,
            match_fields=("project", "cost_baseline_line", "fiscal_period", "calculated_at"),
            patch_payload={"variance_percent": "5.00"},
            delete_key="CVAR-DEL",
            search_term="",
            company_id=company_id,
        )
        reports.append(report)

        # ====================================================================
        # 24. OVERHEAD RULES + ALLOCATIONS
        # ====================================================================
        overhead_rules = [
            {
                "_key": "OH-OPS-10",
                "company": company_id,
                "source_account": expense_gl_id,
                "rule_code": "OH-OPS-10",
                "allocation_basis": "ACTUAL_COST",
                "rate_percent": "10.00",
                "effective_from": "2026-01-01",
                "effective_to": "2026-12-31",
                "status": "ACTIVE",
            },
            {
                "_key": "OH-DEL",
                "company": company_id,
                "source_account": expense_gl_id,
                "rule_code": "OH-DELETE",
                "allocation_basis": "TEST",
                "rate_percent": "0.00",
                "effective_from": "2026-12-01",
                "effective_to": "2026-12-31",
                "status": "INACTIVE",
            },
        ]
        report = client.seed_resource(
            stage_name="stage_8_finance.overhead_rules",
            state_path=("stage_8_finance", "overhead_rules"),
            endpoint="/api/v1/finance/overhead-rules/",
            items=overhead_rules,
            match_fields=("company", "rule_code"),
            patch_payload={"status": "ACTIVE"},
            delete_key="OH-DEL",
            search_term="OH-OPS",
            company_id=company_id,
        )
        reports.append(report)

        overhead_rule_id = client.require_state_id(
            ("stage_8_finance", "overhead_rules", "OH-OPS-10"),
            "overhead rule",
        )
        june_ap_je_id = client.require_state_id(
            ("stage_8_finance", "journal_entries", "JE-AP-2026-06"),
            "June AP journal",
        )
        overhead_allocations = [
            {
                "_key": "OHALLOC-PROJ003-JUN",
                "overhead_rule": overhead_rule_id,
                "project": project_id,
                "fiscal_period": jun_period_id,
                "journal_entry": june_ap_je_id,
                "basis_quantity": money(MONTHS[5][3]),
                "allocated_amount": money(MONTHS[5][3] * Decimal("0.10")),
                "posted_at": "2026-06-30T23:45:00+07:00",
                "status": "POSTED",
            },
            {
                "_key": "OHALLOC-DEL",
                "overhead_rule": overhead_rule_id,
                "project": project_id,
                "fiscal_period": jun_period_id,
                "basis_quantity": "1.00",
                "allocated_amount": "0.10",
                "posted_at": "2026-06-01T00:00:00+07:00",
                "status": "TEST",
            },
        ]
        report = client.seed_resource(
            stage_name="stage_8_finance.overhead_allocations",
            state_path=("stage_8_finance", "overhead_allocations"),
            endpoint="/api/v1/finance/overhead-allocations/",
            items=overhead_allocations,
            match_fields=("overhead_rule", "project", "fiscal_period", "posted_at"),
            patch_payload={"status": "POSTED"},
            delete_key="OHALLOC-DEL",
            search_term="POSTED",
            company_id=company_id,
        )
        reports.append(report)

        # ====================================================================
        # 25. PROJECT COST SNAPSHOT
        # ====================================================================
        project_cost_snapshots = [
            {
                "_key": "PCOST-PROJ003-JUN",
                "project": project_id,
                "snapshot_at": "2026-06-30T23:50:00+07:00",
                "budget_amount": "2250000000.00",
                "committed_cost": "600000000.00",
                "actual_cost": "444000000.00",
                "overhead_cost": money(MONTHS[5][3] * Decimal("0.10")),
                "forecast_cost": "1300000000.00",
                "cost_variance": "950000000.00",
                "remaining_budget": "1796000000.00",
            },
            {
                "_key": "PCOST-DEL",
                "project": project_id,
                "snapshot_at": "2026-06-01T00:00:00+07:00",
                "budget_amount": "1.00",
                "committed_cost": "0.00",
                "actual_cost": "0.00",
                "overhead_cost": "0.00",
                "forecast_cost": "0.00",
                "cost_variance": "1.00",
                "remaining_budget": "1.00",
            },
        ]
        report = client.seed_resource(
            stage_name="stage_8_finance.project_cost_snapshots",
            state_path=("stage_8_finance", "project_cost_snapshots"),
            endpoint="/api/v1/finance/project-cost-snapshots/",
            items=project_cost_snapshots,
            match_fields=("project", "snapshot_at"),
            patch_payload={"forecast_cost": "1300000000.00"},
            delete_key="PCOST-DEL",
            search_term="",
            company_id=company_id,
        )
        reports.append(report)

        # ====================================================================
        # 26. COMMAND-TEST RECORDS
        #     Separate records prevent business commands from corrupting the
        #     normal Q1-Q2 invoice/payment dataset.
        # ====================================================================
        cmd_entry = [
            {
                "_key": "JE-CMD-POST",
                "entry_number": "JE-CMD-POST-2026-06",
                "posting_date": "2026-06-30",
                "exchange_rate": "1.000000",
                "description": "Command test: journal post",
                "status": "DRAFT",
                "journal": sales_journal_id,
                "fiscal_period": jun_period_id,
                "currency": currency_id,
            }
        ]
        report = client.seed_resource(
            stage_name="stage_8_finance.command_test_journal_entries",
            state_path=("stage_8_finance", "command_test_journal_entries"),
            endpoint="/api/v1/finance/journal-entries/",
            items=cmd_entry,
            match_fields=("entry_number",),
            patch_payload={"description": "Command test: journal post"},
            search_term="JE-CMD",
            company_id=company_id,
        )
        reports.append(report)

        cmd_je_id = client.require_state_id(
            ("stage_8_finance", "command_test_journal_entries", "JE-CMD-POST"),
            "command journal entry",
        )
        cmd_lines = [
            {
                "_key": "JE-CMD-POST-L1",
                "journal_entry": cmd_je_id,
                "account": bank_gl_id,
                "debit_base": "500000.00",
                "credit_base": "0.00",
                "transaction_currency": currency_id,
                "transaction_amount": "500000.00",
            },
            {
                "_key": "JE-CMD-POST-L2",
                "journal_entry": cmd_je_id,
                "account": revenue_gl_id,
                "debit_base": "0.00",
                "credit_base": "500000.00",
                "transaction_currency": currency_id,
                "transaction_amount": "-500000.00",
            },
        ]
        validate_balanced(
            [{"_key": "JE-CMD-POST"}],
            {"JE-CMD-POST": cmd_lines},
        )
        report = client.seed_resource(
            stage_name="stage_8_finance.command_test_journal_lines",
            state_path=("stage_8_finance", "command_test_journal_lines"),
            endpoint="/api/v1/finance/journal-lines/",
            items=cmd_lines,
            match_fields=("journal_entry", "account", "debit_base", "credit_base"),
            patch_payload={"transaction_currency": currency_id},
            search_term="",
            company_id=company_id,
        )
        reports.append(report)

        cmd_billing = [
            {
                "_key": "BILL-CMD-POST",
                "company": company_id,
                "party": customer_id,
                "currency": currency_id,
                "billing_type": "CUSTOMER_INVOICE",
                "invoice_number": "INV-CMD-POST-2026",
                "invoice_date": "2026-06-28",
                "posting_date": "2026-06-28",
                "due_date": "2026-07-28",
                "subtotal": "0.00",
                "tax_amount": "0.00",
                "total_amount": "0.00",
                "paid_amount": "0.00",
                "outstanding_amount": "0.00",
                "payment_status": "UNPAID",
                "status": "DRAFT",
            }
        ]
        report = client.seed_resource(
            stage_name="stage_8_finance.command_test_billing_documents",
            state_path=("stage_8_finance", "command_test_billing_documents"),
            endpoint="/api/v1/finance/billing-documents/",
            items=cmd_billing,
            match_fields=("company", "invoice_number"),
            patch_payload={"invoice_date": "2026-06-28"},
            search_term="INV-CMD",
            company_id=company_id,
        )
        reports.append(report)

        cmd_billing_id = client.require_state_id(
            ("stage_8_finance", "command_test_billing_documents", "BILL-CMD-POST"),
            "command billing document",
        )
        cmd_billing_lines = [
            {
                "_key": "BILL-CMD-L1",
                "billing_document": cmd_billing_id,
                "account": revenue_gl_id,
                "quantity": "1.00",
                "unit_price": "1500000.00",
                "discount_amount": "0.00",
                "line_total": "1500000.00",
            }
        ]
        report = client.seed_resource(
            stage_name="stage_8_finance.command_test_billing_lines",
            state_path=("stage_8_finance", "command_test_billing_lines"),
            endpoint="/api/v1/finance/billing-document-lines/",
            items=cmd_billing_lines,
            match_fields=("billing_document", "account", "line_total"),
            patch_payload={"line_total": "1500000.00"},
            search_term="",
            company_id=company_id,
        )
        reports.append(report)

        cmd_payments = [
            {
                "_key": "PAY-CMD-ALLOCATE",
                "company": company_id,
                "party": customer_id,
                "bank_account": bank_account_id,
                "currency": currency_id,
                "payment_type": "RECEIPT",
                "payment_date": "2026-06-29",
                "amount": "1000000.00",
                "payment_method": "BANK_TRANSFER",
                "reference_number": "PAY-CMD-ALLOCATE-2026",
                "status": "OPEN",
            }
        ]
        report = client.seed_resource(
            stage_name="stage_8_finance.command_test_payments",
            state_path=("stage_8_finance", "command_test_payments"),
            endpoint="/api/v1/finance/payments/",
            items=cmd_payments,
            match_fields=("company", "reference_number"),
            patch_payload={"payment_method": "BANK_TRANSFER"},
            search_term="PAY-CMD",
            company_id=company_id,
        )
        reports.append(report)

        cmd_payment_id = client.require_state_id(
            ("stage_8_finance", "command_test_payments", "PAY-CMD-ALLOCATE"),
            "command allocation payment",
        )

        # --------------------------------------------------------------------
        # Business-command runner with idempotency marker tied to target UUID.
        # If the DB is rebuilt and target UUID changes, the command runs again.
        # --------------------------------------------------------------------
        def run_command_once(
            *,
            key: str,
            endpoint: str,
            target_id: str,
            payload: Optional[dict] = None,
        ) -> dict:
            markers = client.state_mapping(("stage_8_finance", "command_tests"))
            previous = markers.get(key)
            if (
                isinstance(previous, dict)
                and previous.get("success") is True
                and previous.get("target_id") == target_id
            ):
                result = {
                    "key": key,
                    "endpoint": endpoint,
                    "success": True,
                    "status": "SKIPPED_ALREADY_PASSED",
                }
                command_reports.append(result)
                return result

            resolved_endpoint = endpoint.format(id=target_id)
            client.request(
                "POST",
                resolved_endpoint,
                payload=payload or {},
                company_id=company_id,
                expected=(200,),
            )
            markers[key] = {
                "target_id": target_id,
                "success": True,
                "endpoint": resolved_endpoint,
            }
            client.save_state()
            result = {
                "key": key,
                "endpoint": resolved_endpoint,
                "success": True,
                "status": "PASSED",
            }
            command_reports.append(result)
            return result

        # 1/7 — post journal
        run_command_once(
            key="journal_post",
            endpoint="/api/v1/commands/finance/journal-entries/{id}/post/",
            target_id=cmd_je_id,
        )

        # 2/7 — post billing; also creates AR/AP schedule when missing
        run_command_once(
            key="billing_post",
            endpoint="/api/v1/commands/finance/billing-documents/{id}/post/",
            target_id=cmd_billing_id,
        )

        # 3/7 — allocate payment against the command-only billing document
        run_command_once(
            key="payment_allocate",
            endpoint="/api/v1/commands/finance/payments/{id}/allocate/",
            target_id=cmd_payment_id,
            payload={
                "allocations": [
                    {
                        "billing_document_id": cmd_billing_id,
                        "allocated_amount": "1000000.00",
                        "discount_amount": "0.00",
                        "write_off_amount": "0.00",
                        "exchange_difference": "0.00",
                    }
                ]
            },
        )

        # 4/7 — reconcile June bank statement. Auto-match is driven by
        # reference_number + amount and therefore matches the June payments.
        june_statement_id = client.require_state_id(
            ("stage_8_finance", "bank_statements", "BST-2026-06"),
            "June bank statement",
        )
        run_command_once(
            key="bank_reconcile",
            endpoint="/api/v1/commands/finance/bank-statements/{id}/reconcile/",
            target_id=june_statement_id,
            payload={},
        )

        # 5/7 + 6/7 — close then reopen June. Keep final seed state OPEN.
        period_marker_target = jun_period_id
        run_command_once(
            key="period_close",
            endpoint="/api/v1/commands/finance/fiscal-periods/{id}/close/",
            target_id=period_marker_target,
            payload={"force": False, "closing_type": "MONTHLY"},
        )
        run_command_once(
            key="period_reopen",
            endpoint="/api/v1/commands/finance/fiscal-periods/{id}/reopen/",
            target_id=period_marker_target,
            payload={"reason": "Seeder command-route validation; period remains open for development."},
        )

        # 7/7 — budget availability check (read-only command)
        budget_check_endpoint = f"/api/v1/commands/finance/budgets/{budget_id}/check/"
        client.request(
            "POST",
            budget_check_endpoint,
            payload={
                "account_id": expense_gl_id,
                "period_number": 6,
                "requested_amount": "10000000.00",
            },
            company_id=company_id,
            expected=(200,),
        )
        command_reports.append(
            {
                "key": "budget_check",
                "endpoint": budget_check_endpoint,
                "success": True,
                "status": "PASSED",
            }
        )

        # ====================================================================
        # 27. FULL FINANCE COVERAGE ASSERTION
        # ====================================================================
        expected_finance_resources = {
            "/api/v1/finance/fiscal-years/",
            "/api/v1/finance/fiscal-periods/",
            "/api/v1/finance/accounts/",
            "/api/v1/finance/journals/",
            "/api/v1/finance/journal-entries/",
            "/api/v1/finance/journal-lines/",
            "/api/v1/finance/billing-documents/",
            "/api/v1/finance/billing-document-lines/",
            "/api/v1/finance/arap-schedules/",
            "/api/v1/finance/payments/",
            "/api/v1/finance/payment-allocations/",
            "/api/v1/finance/bank-accounts/",
            "/api/v1/finance/bank-statements/",
            "/api/v1/finance/bank-statement-lines/",
            "/api/v1/finance/bank-reconciliations/",
            "/api/v1/finance/tax-transactions/",
            "/api/v1/finance/budgets/",
            "/api/v1/finance/budget-lines/",
            "/api/v1/finance/period-closings/",
            "/api/v1/finance/financial-snapshots/",
            "/api/v1/finance/unit-cost-snapshots/",
            "/api/v1/finance/recurring-payment-rules/",
            "/api/v1/finance/recurring-payment-runs/",
            "/api/v1/finance/credit-facilities/",
            "/api/v1/finance/project-wip-snapshots/",
            "/api/v1/finance/project-fundings/",
            "/api/v1/finance/project-funding-transactions/",
            "/api/v1/finance/cost-baselines/",
            "/api/v1/finance/cost-baseline-lines/",
            "/api/v1/finance/cost-variances/",
            "/api/v1/finance/overhead-rules/",
            "/api/v1/finance/overhead-allocations/",
            "/api/v1/finance/project-cost-snapshots/",
        }
        covered_resource_endpoints = {
            str(item.get("endpoint"))
            for item in reports
            if str(item.get("endpoint", "")).startswith("/api/v1/finance/")
        }
        missing_resource_endpoints = sorted(
            expected_finance_resources - covered_resource_endpoints
        )
        if missing_resource_endpoints:
            raise SeederError(
                "Finance CRUD coverage belum lengkap: "
                + ", ".join(missing_resource_endpoints)
            )

        expected_command_keys = {
            "journal_post",
            "billing_post",
            "payment_allocate",
            "bank_reconcile",
            "period_close",
            "period_reopen",
            "budget_check",
        }
        passed_command_keys = {
            item["key"] for item in command_reports if item.get("success")
        }
        missing_commands = sorted(expected_command_keys - passed_command_keys)
        if missing_commands:
            raise SeederError(
                "Finance command coverage belum lengkap: "
                + ", ".join(missing_commands)
            )


        # --------------------------------------------------------------------
        # FINAL VALIDATION SUMMARY
        # --------------------------------------------------------------------
        total_revenue = sum(row[2] for row in MONTHS)
        total_expense = sum(row[3] for row in MONTHS)
        total_cash_in = sum(row[4] for row in MONTHS)
        total_cash_out = sum(row[5] for row in MONTHS)

        success = stage_is_successful(reports) and all(item.get("success") for item in command_reports)

        client.state_mapping(("reports",))["stage_8_finance.summary"] = {
            "period": "2026-01-01..2026-06-30",
            "months": 6,
            "customer_invoices": 6,
            "supplier_bills": 6,
            "payments_in": 6,
            "payments_out": 6,
            "journal_entries": len(journal_entries),
            "journal_lines": len(journal_lines),
            "total_revenue": money(total_revenue),
            "total_expense": money(total_expense),
            "gross_seed_profit": money(total_revenue - total_expense),
            "cash_in": money(total_cash_in),
            "cash_out": money(total_cash_out),
            "net_cash_movement": money(total_cash_in - total_cash_out),
            "balanced_journals": True,
            "finance_crud_resources_expected": 33,
            "finance_crud_resources_covered": len(expected_finance_resources),
            "finance_commands_expected": 7,
            "finance_commands_passed": len(
                [item for item in command_reports if item.get("success")]
            ),
            "success": bool(success),
        }
        client.save_state()

        print("\n" + "=" * 76)
        print("HASIL SEEDING FINANCE — Q1 & Q2 2026")
        print("=" * 76)
        print(
            json.dumps(
                {
                    "success": success,
                    "period": "2026-01-01 s.d. 2026-06-30",
                    "records": {
                        "fiscal_periods": 6,
                        "accounts": len(accounts),
                        "journals": 4,
                        "billing_documents": 12,
                        "billing_document_lines": 12,
                        "arap_schedules": 12,
                        "payments": 12,
                        "payment_allocations": 12,
                        "journal_entries": len(journal_entries) + 1,
                        "journal_lines": len(journal_lines) + 2,
                        "bank_statements": 6,
                        "bank_statement_lines": 12,
                        "bank_reconciliations_seeded": 1,
                        "tax_transactions": 6,
                        "budgets": 1,
                        "budget_lines": 12,
                        "period_closings_seeded": 1,
                        "financial_snapshots": 6,
                        "unit_cost_snapshots": 1,
                        "recurring_payment_rules": 1,
                        "recurring_payment_runs": 1,
                        "credit_facilities": 1,
                        "project_wip_snapshots": 1,
                        "project_fundings": 1,
                        "project_funding_transactions": 1,
                        "cost_baselines": 1,
                        "cost_baseline_lines": 3,
                        "cost_variances": 2,
                        "overhead_rules": 1,
                        "overhead_allocations": 1,
                        "project_cost_snapshots": 1,
                    },
                    "coverage": {
                        "finance_crud_resources": "33/33",
                        "finance_business_commands": "7/7",
                        "command_results": command_reports,
                    },
                    "financial_seed_summary": {
                        "revenue": money(total_revenue),
                        "expense": money(total_expense),
                        "profit": money(total_revenue - total_expense),
                        "cash_in": money(total_cash_in),
                        "cash_out": money(total_cash_out),
                        "net_cash_movement": money(total_cash_in - total_cash_out),
                    },
                    "reports": [
                        {
                            "endpoint": report["endpoint"],
                            "success": report["success"],
                            "tests": report["tests"],
                            "errors": report["errors"],
                        }
                        for report in reports
                    ],
                },
                ensure_ascii=False,
                indent=2,
            )
        )

        return bool(success)

    except SeederError as exc:
        print(f"\n[FINANCE SEED FAILED] {exc}")
        return False


if __name__ == "__main__":
    raise SystemExit(0 if run_stage() else 1)
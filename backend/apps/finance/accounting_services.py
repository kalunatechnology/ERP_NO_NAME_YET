"""
Accounting & Double-Entry General Ledger Services.

Handles:
- Standard Chart of Accounts (CoA) provisioning.
- Automated Journal Entry posting on Invoices, Payments, 3-Way Matches, and Project Costs.
- Real-time Trial Balance (Neraca Saldo) and General Ledger aggregation.
"""

from decimal import Decimal
import uuid
from django.db import transaction
from django.db.models import Sum, Q
from django.utils import timezone

from apps.finance.models import Account, Journal, JournalEntry, JournalLine


ZERO = Decimal("0.00")

# Standard Master Chart of Accounts Codes
DEFAULT_COA = [
    {"code": "1101", "name": "Kas dan Rekening Bank", "type": "ASSET", "balance": "DEBIT"},
    {"code": "1103", "name": "Piutang Usaha (AR)", "type": "ASSET", "balance": "DEBIT"},
    {"code": "1105", "name": "Persediaan Bahan & Barang", "type": "ASSET", "balance": "DEBIT"},
    {"code": "1108", "name": "Pekerjaan Dalam Proses (WIP Proyek)", "type": "ASSET", "balance": "DEBIT"},
    {"code": "2101", "name": "Hutang Usaha (AP)", "type": "LIABILITY", "balance": "CREDIT"},
    {"code": "2103", "name": "Hutang Pajak Pertambahan Nilai (PPN)", "type": "LIABILITY", "balance": "CREDIT"},
    {"code": "3101", "name": "Modal Disetor / Ekuitas", "type": "EQUITY", "balance": "CREDIT"},
    {"code": "3102", "name": "Laba Ditahan", "type": "EQUITY", "balance": "CREDIT"},
    {"code": "4101", "name": "Pendapatan Proyek & Jasa", "type": "REVENUE", "balance": "CREDIT"},
    {"code": "5101", "name": "Beban Pokok Proyek (HPP / COGS)", "type": "EXPENSE", "balance": "DEBIT"},
    {"code": "6101", "name": "Beban Operasional & Umum", "type": "EXPENSE", "balance": "DEBIT"},
]


def ensure_standard_coa(company=None):
    """Initializes standard Chart of Accounts for a company."""
    accounts = {}
    for item in DEFAULT_COA:
        acc, _ = Account.objects.get_or_create(
            company=company,
            account_code=item["code"],
            defaults={
                "account_name": item["name"],
                "account_type": item["type"],
                "normal_balance": item["balance"],
                "allow_manual_posting": True,
                "status": "ACTIVE",
            },
        )
        accounts[item["code"]] = acc
    return accounts


def ensure_journal(company, journal_code, journal_name, journal_type="GENERAL"):
    journal, _ = Journal.objects.get_or_create(
        company=company,
        journal_code=journal_code,
        defaults={
            "journal_name": journal_name,
            "journal_type": journal_type,
            "status": "ACTIVE",
        },
    )
    return journal


@transaction.atomic
def post_invoice_journal(billing_document, user=None):
    """
    Automated Double-Entry Posting for Billing Invoice:
    - Debit: Piutang Usaha (AR) (Total Amount)
    - Credit: Pendapatan Proyek (Subtotal)
    - Credit: Hutang Pajak PPN (Tax Amount)
    """
    if not billing_document or billing_document.total_amount is None or billing_document.total_amount <= ZERO:
        return None

    company = billing_document.company
    coa = ensure_standard_coa(company)
    journal = ensure_journal(company, "JRN-SALES", "Jurnal Penjualan & Billing", "SALES")

    entry_num = f"JV-INV-{billing_document.invoice_number or billing_document.id.hex[:6].upper()}"
    existing = JournalEntry.objects.filter(entry_number=entry_num).first()
    if existing:
        return existing

    entry = JournalEntry.objects.create(
        journal=journal,
        entry_number=entry_num,
        posting_date=billing_document.posting_date or billing_document.invoice_date or timezone.localdate(),
        description=f"Pengakuan Piutang Invoice #{billing_document.invoice_number} ({billing_document.billing_type or 'AR'})",
        status="POSTED",
    )

    # Line 1: Debit AR
    JournalLine.objects.create(
        journal_entry=entry,
        account=coa["1103"],
        party=billing_document.party,
        project=billing_document.project,
        debit_base=billing_document.total_amount,
        credit_base=ZERO,
        transaction_amount=billing_document.total_amount,
    )

    # Line 2: Credit Revenue
    subtotal = billing_document.subtotal or billing_document.total_amount
    JournalLine.objects.create(
        journal_entry=entry,
        account=coa["4101"],
        party=billing_document.party,
        project=billing_document.project,
        debit_base=ZERO,
        credit_base=subtotal,
        transaction_amount=subtotal,
    )

    # Line 3: Credit Tax (if any)
    if billing_document.tax_amount and billing_document.tax_amount > ZERO:
        JournalLine.objects.create(
            journal_entry=entry,
            account=coa["2103"],
            party=billing_document.party,
            project=billing_document.project,
            debit_base=ZERO,
            credit_base=billing_document.tax_amount,
            transaction_amount=billing_document.tax_amount,
        )

    return entry


@transaction.atomic
def post_payment_journal(billing_document, paid_amount, payment_type="RECEIPT", user=None):
    """
    Automated Double-Entry Posting for Payment Receipt / Disbursement:
    For Customer Invoice Payment (Receipt):
    - Debit: Kas / Bank
    - Credit: Piutang Usaha (AR)
    """
    paid = Decimal(str(paid_amount or 0))
    if paid <= ZERO:
        return None

    company = billing_document.company if billing_document else None
    coa = ensure_standard_coa(company)
    journal = ensure_journal(company, "JRN-CASH", "Jurnal Kas & Bank", "CASH")

    entry_num = f"JV-PAY-{uuid.uuid4().hex[:8].upper()}"
    entry = JournalEntry.objects.create(
        journal=journal,
        entry_number=entry_num,
        posting_date=timezone.localdate(),
        description=f"Penerimaan Pembayaran Invoice #{getattr(billing_document, 'invoice_number', '')}",
        status="POSTED",
    )

    if payment_type == "RECEIPT":
        # Debit Bank, Credit AR
        JournalLine.objects.create(
            journal_entry=entry,
            account=coa["1101"],
            party=getattr(billing_document, "party", None),
            project=getattr(billing_document, "project", None),
            debit_base=paid,
            credit_base=ZERO,
            transaction_amount=paid,
        )
        JournalLine.objects.create(
            journal_entry=entry,
            account=coa["1103"],
            party=getattr(billing_document, "party", None),
            project=getattr(billing_document, "project", None),
            debit_base=ZERO,
            credit_base=paid,
            transaction_amount=paid,
        )
    else:
        # Debit AP, Credit Bank
        JournalLine.objects.create(
            journal_entry=entry,
            account=coa["2101"],
            party=getattr(billing_document, "party", None),
            project=getattr(billing_document, "project", None),
            debit_base=paid,
            credit_base=ZERO,
            transaction_amount=paid,
        )
        JournalLine.objects.create(
            journal_entry=entry,
            account=coa["1101"],
            party=getattr(billing_document, "party", None),
            project=getattr(billing_document, "project", None),
            debit_base=ZERO,
            credit_base=paid,
            transaction_amount=paid,
        )

    return entry


@transaction.atomic
def post_project_expense_journal(project_expense, user=None):
    """
    Automated Double-Entry Posting for Project Direct Expense / Material / Labor:
    - Debit: HPP Beban Pokok Proyek (atau WIP)
    - Credit: Kas & Bank (atau Hutang Usaha)
    """
    amount = Decimal(str(getattr(project_expense, "amount", 0) or 0))
    if amount <= ZERO:
        return None

    project = getattr(project_expense, "project", None)
    company = getattr(project, "company", None)
    coa = ensure_standard_coa(company)
    journal = ensure_journal(company, "JRN-PROJ", "Jurnal Proyek & Biaya Operasional", "PROJECT")

    entry_num = f"JV-EXP-{uuid.uuid4().hex[:8].upper()}"
    entry = JournalEntry.objects.create(
        journal=journal,
        entry_number=entry_num,
        posting_date=getattr(project_expense, "expense_date", None) or timezone.localdate(),
        description=f"Beban Proyek [{getattr(project, 'project_code', '')}]: {getattr(project_expense, 'title', '') or getattr(project_expense, 'description', '')}",
        status="POSTED",
    )

    # Line 1: Debit Project COGS / WIP
    JournalLine.objects.create(
        journal_entry=entry,
        account=coa["5101"],
        project=project,
        debit_base=amount,
        credit_base=ZERO,
        transaction_amount=amount,
    )

    # Line 2: Credit Kas / Bank
    JournalLine.objects.create(
        journal_entry=entry,
        account=coa["1101"],
        project=project,
        debit_base=ZERO,
        credit_base=amount,
        transaction_amount=amount,
    )

    return entry


def get_trial_balance_summary(company=None, start_date=None, end_date=None):
    """
    Calculates dynamic Trial Balance (Neraca Saldo) across all accounts.
    """
    ensure_standard_coa(company)
    accounts = Account.objects.filter(company=company) if company else Account.objects.all()

    trial_balance = []
    total_debit = ZERO
    total_credit = ZERO

    for acc in accounts:
        line_filter = Q(account=acc)
        if start_date:
            line_filter &= Q(journal_entry__posting_date__gte=start_date)
        if end_date:
            line_filter &= Q(journal_entry__posting_date__lte=end_date)

        lines = JournalLine.objects.filter(line_filter)
        dr_sum = lines.aggregate(total=Sum("debit_base"))["total"] or ZERO
        cr_sum = lines.aggregate(total=Sum("credit_base"))["total"] or ZERO

        if acc.normal_balance == "DEBIT":
            net_balance = dr_sum - cr_sum
        else:
            net_balance = cr_sum - dr_sum

        trial_balance.append({
            "account_id": str(acc.id),
            "account_code": acc.account_code,
            "account_name": acc.account_name,
            "account_type": acc.account_type,
            "normal_balance": acc.normal_balance,
            "total_debit": float(dr_sum),
            "total_credit": float(cr_sum),
            "net_balance": float(net_balance),
        })

        total_debit += dr_sum
        total_credit += cr_sum

    return {
        "accounts": trial_balance,
        "total_debit": float(total_debit),
        "total_credit": float(total_credit),
        "is_balanced": total_debit == total_credit,
    }

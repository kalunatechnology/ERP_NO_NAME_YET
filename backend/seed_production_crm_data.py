import os
import django
from decimal import Decimal
from datetime import date, datetime, timedelta

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from django.contrib.auth import get_user_model
from apps.core.models import Tenant, Company
from apps.master_data.models import Party
from apps.crm.models import CustomerInquiry, Opportunity, CostEstimate, CreditStatusSnapshot
from apps.sales.models import Quotation, Order, Contract
from apps.service.models import Case
from apps.projects.models import Project

User = get_user_model()
admin_user = User.objects.filter(email="admin@arsalynk.id").first() or User.objects.first()

tenant = Tenant.objects.first()
company = Company.objects.first()
print(f"Menggunakan Tenant: {tenant.name} | Company: {company.legal_name} ({company.id})")

# 1. Master Parties
parties_data = [
    {"name": "PT Industri Otomasi Nusantara", "code": "CUST-001", "type": "CUSTOMER"},
    {"name": "PT Sinar Surya Manufaktur", "code": "CUST-002", "type": "CUSTOMER"},
    {"name": "PT Mega Logistik Sentosa", "code": "CUST-003", "type": "CUSTOMER"},
    {"name": "PT Jaya Teknik Mandiri", "code": "VEND-001", "type": "VENDOR"},
]

parties = []
for p_data in parties_data:
    party, _ = Party.objects.get_or_create(
        tenant=tenant,
        party_code=p_data["code"],
        defaults={
            "display_name": p_data["name"],
            "legal_name": p_data["name"],
            "party_type": p_data["type"],
            "status": "ACTIVE",
        }
    )
    parties.append(party)

c1 = parties[0]
c2 = parties[1]

# 2. Inquiries
inqs = [
    {"subject": "Pengadaan Sistem Conveyor & Sensor Packaging Line #1", "status": "QUALIFIED", "name": c1.display_name, "email": "procurement@otomasi-nusantara.co.id"},
    {"subject": "Instalasi PLC & Panel Distribusi Otomatis Pabrik Cikarang", "status": "DRAFT", "name": c2.display_name, "email": "purchasing@sinarsurya.com"},
    {"subject": "Retrofit Mesin CNC & SCADA Monitoring System", "status": "NEW", "name": c1.display_name, "email": "procurement@otomasi-nusantara.co.id"},
]

for inq_data in inqs:
    CustomerInquiry.objects.get_or_create(
        tenant=tenant,
        company=company,
        subject=inq_data["subject"],
        defaults={
            "customer_name": inq_data["name"],
            "customer_email": inq_data["email"],
            "status": inq_data["status"],
            "customer_party": c1,
        }
    )

# 3. Opportunities
opp_1, _ = Opportunity.objects.get_or_create(
    tenant=tenant,
    company=company,
    opportunity_name="Proyek Conveyor Line 1 - PT Industri Otomasi",
    defaults={
        "customer_party": c1,
        "owner_user": admin_user,
        "pipeline_stage": "WON",
        "status": "WON",
        "expected_amount": Decimal("750000000.0"),
        "expected_margin": Decimal("350000000.0"),
        "probability_percent": Decimal("100.0"),
    }
)

opp_2, _ = Opportunity.objects.get_or_create(
    tenant=tenant,
    company=company,
    opportunity_name="Instalasi Panel Otomatis - PT Sinar Surya",
    defaults={
        "customer_party": c2,
        "owner_user": admin_user,
        "pipeline_stage": "PROPOSAL_SENT",
        "status": "OPEN",
        "expected_amount": Decimal("420000000.0"),
        "expected_margin": Decimal("150000000.0"),
        "probability_percent": Decimal("70.0"),
    }
)

# 4. Credit Snapshot
CreditStatusSnapshot.objects.get_or_create(
    company=company,
    customer_party=c1,
    defaults={
        "credit_limit": Decimal("1000000000.0"),
        "outstanding_receivable": Decimal("150000000.0"),
        "overdue_amount": Decimal("0.0"),
        "credit_status": "AVAILABLE",
    }
)

# 5. Cost Estimates
CostEstimate.objects.get_or_create(
    company=company,
    estimate_number="EST-2026-001",
    defaults={
        "opportunity": opp_1,
        "direct_cost": Decimal("375000000.0"),
        "overhead_cost": Decimal("25000000.0"),
        "total_cost": Decimal("400000000.0"),
        "markup_percent": Decimal("35.0"),
        "offered_amount": Decimal("750000000.0"),
        "status": "FINALIZED",
    }
)

# 6. Quotations
quot_1, _ = Quotation.objects.get_or_create(
    customer_party=c1,
    opportunity=opp_1,
    defaults={
        "status": "ACCEPTED",
        "subtotal": Decimal("750000000.0"),
        "tax_amount": Decimal("82500000.0"),
        "total_amount": Decimal("832500000.0"),
        "valid_until": date.today() + timedelta(days=30),
    }
)

# 7. Orders & Contracts
order_1, _ = Order.objects.get_or_create(
    customer_party=c1,
    quotation=quot_1,
    defaults={
        "status": "CONFIRMED",
        "total_amount": Decimal("832500000.0"),
        "order_date": date.today() - timedelta(days=1),
    }
)

Contract.objects.get_or_create(
    customer_party=c1,
    contract_number="CTR-2026-001",
    defaults={
        "contract_type": "MAINTENANCE",
        "start_date": date.today() - timedelta(days=1),
        "end_date": date.today() + timedelta(days=365),
        "status": "ACTIVE",
    }
)

# 8. Cases
Case.objects.get_or_create(
    customer_party=c1,
    subject="Sensor Photoelectric Line Packaging Tidak Merespon",
    defaults={
        "sales_order": order_1,
        "priority": "HIGH",
        "status": "OPEN",
        "description": "Sensor photo-eye pada stasiun packaging berhenti mendeteksi botol saat speed di atas 80 BPM.",
    }
)

# 9. Projects
Project.objects.get_or_create(
    tenant=tenant,
    company=company,
    project_code="PRJ-2026-001",
    defaults={
        "project_name": "Implementasi Sistem Otomasi Conveyor Line 1",
        "customer_party": c1,
        "status": "ACTIVE",
        "lifecycle_status": "STARTED",
        "budget_amount": Decimal("750000000.0"),
        "contract_amount": Decimal("832500000.0"),
        "progress_percent": Decimal("65.0"),
        "planned_start_date": date.today() - timedelta(days=10),
        "planned_end_date": date.today() + timedelta(days=50),
    }
)

print("SUCCESS: 100% data riil CRM, Sales, Contract, Service, dan Proyek telah aktif di database!")

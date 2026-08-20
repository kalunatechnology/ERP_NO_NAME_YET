import os
import django
from decimal import Decimal
from datetime import date, datetime, timedelta

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from django.contrib.auth import get_user_model
from apps.core.models import Tenant, Company
from apps.master_data.models import Party
from apps.crm.models import (
    CustomerInquiry, Opportunity,
    CostEstimate
)
from apps.sales.models import Quotation, Order, Contract
from apps.service.models import Case
from apps.projects.models import Project
from apps.finance.models import BillingProposal, ProjectCostEntry

User = get_user_model()
admin_user = User.objects.filter(email="admin@arsalynk.id").first() or User.objects.first()

tenant = Tenant.objects.first()
if not tenant:
    tenant = Tenant.objects.create(name="Arsalynk ERP Tenant", code="TENANT-ARSALYNK")

company = Company.objects.first()
if not company:
    company = Company.objects.create(tenant=tenant, legal_name="PT Arsalynk Technology Indonesia", code="COMP-ARSALYNK")

print(f"Menggunakan Company: {company.legal_name} (ID: {company.id})")

# 1. Master Data Parties
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

customer_1 = parties[0]
customer_2 = parties[1]

# 2. Customer Inquiries
inquiries_data = [
    {"subject": "Pengadaan Sistem Conveyor & Sensor Packaging Line #1", "status": "QUALIFIED", "customer_name": customer_1.display_name, "customer_email": "procurement@otomasi-nusantara.co.id"},
    {"subject": "Instalasi PLC & Panel Distribusi Otomatis Pabrik Cikarang", "status": "DRAFT", "customer_name": customer_2.display_name, "customer_email": "purchasing@sinarsurya.com"},
    {"subject": "Retrofit Mesin CNC & SCADA Monitoring System", "status": "IN_REVIEW", "customer_name": customer_1.display_name, "customer_email": "procurement@otomasi-nusantara.co.id"},
]

for inq in inquiries_data:
    CustomerInquiry.objects.get_or_create(
        tenant=tenant,
        company=company,
        subject=inq["subject"],
        defaults={
            "customer_name": inq["customer_name"],
            "customer_email": inq["customer_email"],
            "status": inq["status"],
            "received_at": datetime.now(),
        }
    )

# 3. Opportunities
opp_1, _ = Opportunity.objects.get_or_create(
    tenant=tenant,
    company=company,
    opportunity_name="Proyek Conveyor Line 1 - PT Industri Otomasi",
    defaults={
        "customer_party": customer_1,
        "owner_user": admin_user,
        "pipeline_stage": "WON",
        "status": "WON",
        "expected_amount": Decimal("750000000.0"),
        "expected_margin": Decimal("350000000.0"),
        "probability_percent": Decimal("100.0"),
        "opened_at": datetime.now() - timedelta(days=15),
        "closed_at": datetime.now() - timedelta(days=2),
    }
)

opp_2, _ = Opportunity.objects.get_or_create(
    tenant=tenant,
    company=company,
    opportunity_name="Instalasi Panel Otomatis - PT Sinar Surya",
    defaults={
        "customer_party": customer_2,
        "owner_user": admin_user,
        "pipeline_stage": "PROPOSAL_SENT",
        "status": "OPEN",
        "expected_amount": Decimal("420000000.0"),
        "expected_margin": Decimal("150000000.0"),
        "probability_percent": Decimal("70.0"),
        "opened_at": datetime.now() - timedelta(days=5),
    }
)

# 4. Cost Estimates & Quotations
est_1, _ = CostEstimate.objects.get_or_create(
    tenant=tenant,
    company=company,
    title="Estimasi HPP Conveyor Packaging Line 1",
    defaults={
        "opportunity": opp_1,
        "total_material_cost": Decimal("280000000.0"),
        "total_labor_cost": Decimal("95000000.0"),
        "total_overhead_cost": Decimal("25000000.0"),
        "total_estimated_cost": Decimal("400000000.0"),
        "markup_percent": Decimal("40.0"),
        "quoted_price": Decimal("750000000.0"),
        "status": "FINALIZED",
    }
)

quot_1, _ = Quotation.objects.get_or_create(
    tenant=tenant,
    company=company,
    quotation_number="QUOT-2026-001",
    defaults={
        "customer_party": customer_1,
        "opportunity": opp_1,
        "status": "ACCEPTED",
        "subtotal": Decimal("750000000.0"),
        "tax_amount": Decimal("82500000.0"),
        "total_amount": Decimal("832500000.0"),
        "valid_until": date.today() + timedelta(days=30),
    }
)

order_1, _ = Order.objects.get_or_create(
    tenant=tenant,
    company=company,
    order_number="SO-2026-001",
    defaults={
        "customer_party": customer_1,
        "opportunity": opp_1,
        "status": "CONFIRMED",
        "total_amount": Decimal("832500000.0"),
        "order_date": date.today() - timedelta(days=1),
    }
)

contract_1, _ = Contract.objects.get_or_create(
    tenant=tenant,
    company=company,
    contract_number="CTR-2026-001",
    defaults={
        "customer_party": customer_1,
        "title": "Kontrak Pengadaan & Maintenance Conveyor Line 1",
        "contract_value": Decimal("832500000.0"),
        "start_date": date.today() - timedelta(days=1),
        "end_date": date.today() + timedelta(days=365),
        "status": "ACTIVE",
    }
)

# 5. Service Support Tickets & Cases
case_1, _ = Case.objects.get_or_create(
    tenant=tenant,
    company=company,
    title="Sensor Photoelectric Line Packaging Tidak Merespon",
    defaults={
        "customer_party": customer_1,
        "contract": contract_1,
        "case_type": "WARRANTY_CLAIM",
        "priority": "HIGH",
        "status": "OPEN",
        "opened_at": datetime.now() - timedelta(hours=6),
        "description": "Sensor photo-eye pada stasiun packaging berhenti mendeteksi botol saat speed di atas 80 BPM.",
    }
)

# 6. Projects
prj_1, _ = Project.objects.get_or_create(
    tenant=tenant,
    company=company,
    project_code="PRJ-2026-001",
    defaults={
        "project_name": "Implementasi Sistem Otomasi Conveyor Line 1",
        "status": "ACTIVE",
        "lifecycle_status": "STARTED",
        "budget_amount": Decimal("750000000.0"),
        "contract_amount": Decimal("832500000.0"),
        "progress_percent": Decimal("65.0"),
        "planned_start_date": date.today() - timedelta(days=10),
        "planned_end_date": date.today() + timedelta(days=50),
    }
)

# 7. Cost Entries
ProjectCostEntry.objects.get_or_create(
    tenant=tenant,
    company=company,
    project=prj_1,
    description="Pemakaian Motor Servo & Sensor Optical",
    defaults={
        "source_type": "WAREHOUSE",
        "cost_element": "MATERIAL",
        "total_cost": Decimal("280000000.0"),
        "quantity": Decimal("1.0"),
        "unit_cost": Decimal("280000000.0"),
        "transaction_date": date.today() - timedelta(days=3),
        "status": "POSTED",
    }
)

ProjectCostEntry.objects.get_or_create(
    tenant=tenant,
    company=company,
    project=prj_1,
    description="Upah Teknisi & Engineer Lapangan Sprint 1",
    defaults={
        "source_type": "TIMESHEET",
        "cost_element": "LABOR",
        "total_cost": Decimal("95000000.0"),
        "quantity": Decimal("1.0"),
        "unit_cost": Decimal("95000000.0"),
        "transaction_date": date.today() - timedelta(days=1),
        "status": "POSTED",
    }
)

# 8. Billing Proposals
BillingProposal.objects.get_or_create(
    tenant=tenant,
    company=company,
    project=prj_1,
    description="Termin 1 (Progress Selesai 65%) PRJ-2026-001",
    defaults={
        "trigger_type": "PROGRESS_APPROVED",
        "subtotal": Decimal("500000000.0"),
        "tax_rate": Decimal("11.0"),
        "tax_amount": Decimal("55000000.0"),
        "total_amount": Decimal("555000000.0"),
        "status": "APPROVED",
    }
)

print("SUCCESS: Database berhasil di-seed dengan data lengkap CRM, Proyek, dan Finance!")

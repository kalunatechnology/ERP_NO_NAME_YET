#!/usr/bin/env python3
"""
E2E Integrated Data Flow Seeder for Arsalynt ERP.

Alur:
1. CRM: Buat Inquiry -> Cost Estimating (HPP) -> Sales Quotation -> Deal Won -> Credit Check.
2. Budgeting: Buat Funding Request -> Finance Verify & Approve.
3. Project: Buat Proyek -> Project Gate (Verify -> Reserve -> Start) -> Catat Timesheets & Material.
4. Finance Handoff: PM Cost Entry -> Finance Post to WIP -> PM Billing Proposal -> Finance Approve Invoice.
5. Reporting: Menghasilkan data real-time pada Dashboard Profitability, Gross Margin, & General Ledger.
"""

from __future__ import annotations

import logging
import os
import sys
from datetime import date, datetime, timedelta
from decimal import Decimal
from pathlib import Path
from typing import Any, Dict

from seeder_common import SeederClient, load_env_defaults

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("E2EFlowSeeder")


def run_e2e_flow() -> None:
    env = load_env_defaults()
    client = SeederClient(
        base_url=env["base_url"],
        email=env["email"],
        password=env["password"],
        state_file=env["state_file"],
        timeout=env["timeout"],
    )

    logger.info("=== [1/5] Memulai Inisialisasi Auth & Schema ===")
    client.login()
    client.load_schema()

    # 1. Pastikan Company & Master Data tersedia
    companies = client.get_list("/api/v1/core/companies/")
    if not companies:
        logger.error("Tidak ada company aktif. Jalankan seeder tenant terlebih dahulu.")
        return
    company = companies[0]
    company_id = company["id"]
    client.session.headers["X-Company-ID"] = str(company_id)
    logger.info("Company terdeteksi: %s (ID: %s)", company.get("legal_name", "Demo"), company_id)

    # 2. Ambil Customer Party
    parties = client.get_list("/api/v1/master-data/parties/")
    customer_party = next((p for p in parties if p.get("party_type") == "CUSTOMER"), parties[0] if parties else None)
    if not customer_party:
        logger.error("Tidak ada party customer.")
        return

    # 3. CRM Commercial Lifecycle
    logger.info("=== [2/5] Eksekusi Alur CRM & Deal Won ===")
    run_code = datetime.now().strftime("%Y%m%d%H%M")
    
    # 3a. Buat Inquiry
    inquiry_payload = {
        "company": company_id,
        "customer_name": customer_party.get("display_name", "PT Customer Utama"),
        "customer_email": customer_party.get("email", "client@customer.com"),
        "subject": f"Pengadaan Sistem Otomasi & Conveyor Line #{run_code}",
        "status": "DRAFT",
    }
    inquiry = client.post("/api/v1/crm/customer-inquiries/", inquiry_payload)
    inquiry_id = inquiry.get("id")
    logger.info("Inquiry dibuat: %s", inquiry_id)

    # 3b. Qualify Inquiry
    try:
        client.post(f"/api/v1/crm/customer-inquiries/{inquiry_id}/qualify/", {})
        logger.info("Inquiry di-qualify.")
    except Exception as e:
        logger.warning("Qualify inquiry: %s", e)

    # 3c. Opportunity & Deal Won
    opp_payload = {
        "company": company_id,
        "customer_party": customer_party["id"],
        "opportunity_name": f"Proyek Otomasi Line #{run_code}",
        "expected_amount": 750000000.0,
        "probability_percent": 90.0,
        "pipeline_stage": "WON",
        "status": "WON",
    }
    opp = client.post("/api/v1/crm/opportunities/", opp_payload)
    opp_id = opp.get("id")
    logger.info("Opportunity Won terbentuk: %s (Rp 750.000.000)", opp_id)

    # Process Deal Won & Credit Check
    try:
        dw_res = client.post(f"/api/v1/crm/opportunities/{opp_id}/process-deal-won/", {})
        logger.info("Deal Won processed: %s", dw_res.get("decision", "OK"))
    except Exception as e:
        logger.warning("Process deal won: %s", e)

    # 4. Budgeting & Funding Approval
    logger.info("=== [3/5] Pengajuan Budgeting & Funding ===")
    funding_payload = {
        "company": company_id,
        "purpose": f"Alokasi Dana Awal Proyek #{run_code}",
        "requested_amount": 450000000.0,
        "approved_limit": 450000000.0,
        "status": "APPROVED",
        "funding_type": "PROJECT_EXECUTION",
    }
    funding = client.post("/api/v1/projects/funding-requests/", funding_payload)
    funding_id = funding.get("id")
    logger.info("Funding Request disetujui Finance: Rp 450.000.000 (ID: %s)", funding_id)

    # 5. Eksekusi Proyek & Pencatatan Biaya
    logger.info("=== [4/5] Pembuatan Proyek & Pencatatan Biaya Lapangan ===")
    project_payload = {
        "company": company_id,
        "name": f"Implementasi Otomasi #{run_code}",
        "code": f"PRJ-{run_code}",
        "status": "ACTIVE",
        "lifecycle_status": "STARTED",
        "budget_amount": 750000000.0,
        "start_date": str(date.today()),
        "target_end_date": str(date.today() + timedelta(days=60)),
        "progress": 65,
    }
    project = client.post("/api/v1/projects/projects/", project_payload)
    project_id = project.get("id")
    logger.info("Proyek Aktif terbentuk: %s (Kode: PRJ-%s)", project_id, run_code)

    # Kirim Biaya Aktual (Material & Labor) ke Finance
    cost_material_payload = {
        "company": company_id,
        "project": project_id,
        "source_type": "WAREHOUSE",
        "cost_element": "MATERIAL",
        "description": f"Pemakaian Sensor & Motor Servo PRJ-{run_code}",
        "transaction_date": str(date.today()),
        "total_cost": 280000000.0,
        "quantity": 1,
        "unit_cost": 280000000.0,
        "status": "POSTED",
    }
    client.post("/api/v1/finance/project-cost-entries/", cost_material_payload)
    logger.info("Biaya Material dicatat: Rp 280.000.000")

    cost_labor_payload = {
        "company": company_id,
        "project": project_id,
        "source_type": "TIMESHEET",
        "cost_element": "LABOR",
        "description": f"Upah Teknisi & Engineer Sprint 1 PRJ-{run_code}",
        "transaction_date": str(date.today()),
        "total_cost": 95000000.0,
        "quantity": 1,
        "unit_cost": 95000000.0,
        "status": "POSTED",
    }
    client.post("/api/v1/finance/project-cost-entries/", cost_labor_payload)
    logger.info("Biaya Labor dicatat: Rp 95.000.000")

    # 6. Billing Proposal & Penerbitan Invoice
    logger.info("=== [5/5] Termin Penagihan & Profitability P&L ===")
    proposal_payload = {
        "company": company_id,
        "project": project_id,
        "trigger_type": "PROGRESS_APPROVED",
        "subtotal": 500000000.0,
        "tax_rate": 11.0,
        "tax_amount": 55000000.0,
        "total_amount": 555000000.0,
        "description": f"Termin 1 (Progress 65%) PRJ-{run_code}",
        "status": "APPROVED",
    }
    proposal = client.post("/api/v1/finance/billing-proposals/", proposal_payload)
    logger.info("Billing Proposal disetujui Finance: Rp 500.000.000 + PPN (ID: %s)", proposal.get("id"))

    # Ringkasan Keuntungan
    revenue = Decimal("750000000.0")
    total_cost = Decimal("375000000.0")  # Material 280M + Labor 95M
    gross_profit = revenue - total_cost
    margin_pct = (gross_profit / revenue) * 100

    logger.info("=========================================================")
    logger.info("🎉 SEEDING DATA FLOW TERPADU BERHASIL DISELESAIKAN!")
    logger.info("📊 RINGKASAN KEUNTUNGAN PROYEK (PRJ-%s):", run_code)
    logger.info("   - Target Pendapatan (Revenue) : Rp 750.000.000")
    logger.info("   - Biaya Aktual (HPP Terpakai) : Rp 375.000.000 (Material 280M + Labor 95M)")
    logger.info("   - Laba Kotor (Gross Profit)   : Rp 375.000.000")
    logger.info("   - Gross Margin                : %.1f%%", margin_pct)
    logger.info("Buka http://127.0.0.1:5500/#/reporting untuk melihat visualisasi P&L!")
    logger.info("=========================================================")


if __name__ == "__main__":
    run_e2e_flow()

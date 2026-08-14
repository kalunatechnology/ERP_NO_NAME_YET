from __future__ import annotations

import json
from typing import Optional

from seeder_common import (
    SeederClient,
    SeederError,
    build_client,
    configure_logging,
    stage_is_successful,
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
        supplier_id = client.require_state_id(
            ("stage_3", "parties", "PARTY-SUPP-01"),
            "supplier party",
        )

        reports = []

        categories = [
            {
                "_key": "ACAT-IT",
                "company": company_id,
                "category_code": "ACAT-IT",
                "category_name": "IT Hardware and Equipment",
            },
            {
                "_key": "ACAT-VEHICLE",
                "company": company_id,
                "category_code": "ACAT-VEHICLE",
                "category_name": "Operational Vehicles",
            },
            {
                "_key": "ACAT-MACHINERY",
                "company": company_id,
                "category_code": "ACAT-MACHINERY",
                "category_name": "Manufacturing Machinery",
            },
            {
                "_key": "ACAT-BUILDING",
                "company": company_id,
                "category_code": "ACAT-BUILDING",
                "category_name": "Buildings and Real Estate",
            },
            {
                "_key": "ACAT-DEL",
                "company": company_id,
                "category_code": "ACAT-DEL",
                "category_name": "Asset Category Delete Test",
            },
        ]
        category_report = client.seed_resource(
            stage_name="stage_7.asset_categories",
            state_path=("stage_7", "asset_categories"),
            endpoint="/api/v1/assets/categories/",
            items=categories,
            match_fields=("category_code", "company"),
            patch_payload={
                "category_name": "IT Hardware and Equipment Updated"
            },
            delete_key="ACAT-DEL",
            search_term="Hardware",
            company_id=company_id,
        )
        reports.append(category_report)

        category_id = client.require_state_id(
            ("stage_7", "asset_categories", "ACAT-IT"),
            "ACAT-IT asset category",
        )

        assets = [
            {
                "_key": "AST-SERVER-01",
                "company": company_id,
                "category": category_id,
                "supplier_party": supplier_id,
                "asset_code": "AST-SERVER-01",
                "asset_name": "Main Data Center Server Rack",
                "serial_number": "SRV-DC-2026-0001",
                "acquisition_date": "2026-01-15",
                "available_for_use_date": "2026-02-01",
                "acquisition_cost": "650000000.00",
                "salvage_value": "50000000.00",
                "useful_life_months": 60,
                "status": "ACTIVE",
            },
            {
                "_key": "AST-LAPTOP-01",
                "company": company_id,
                "category": category_id,
                "supplier_party": supplier_id,
                "asset_code": "AST-LAPTOP-01",
                "asset_name": "Developer Laptop Unit",
                "serial_number": "LTP-DEV-2026-0001",
                "acquisition_date": "2026-02-10",
                "available_for_use_date": "2026-02-12",
                "acquisition_cost": "45000000.00",
                "salvage_value": "5000000.00",
                "useful_life_months": 48,
                "status": "ACTIVE",
            },
            {
                "_key": "AST-CAR-01",
                "company": company_id,
                "category": category_id,
                "supplier_party": supplier_id,
                "asset_code": "AST-CAR-01",
                "asset_name": "Operational Delivery Van",
                "serial_number": "VEH-OPS-2026-0001",
                "acquisition_date": "2025-06-01",
                "available_for_use_date": "2025-06-05",
                "acquisition_cost": "420000000.00",
                "salvage_value": "80000000.00",
                "useful_life_months": 96,
                "status": "UNDER_MAINTENANCE",
            },
            {
                "_key": "AST-DISPOSED",
                "company": company_id,
                "category": category_id,
                "asset_code": "AST-DISPOSED",
                "asset_name": "Old Office Printer 2020",
                "serial_number": "PRN-OLD-2020-0001",
                "acquisition_date": "2020-01-10",
                "available_for_use_date": "2020-01-15",
                "acquisition_cost": "15000000.00",
                "salvage_value": "1000000.00",
                "useful_life_months": 48,
                "status": "DISPOSED",
            },
            {
                "_key": "AST-DEL",
                "company": company_id,
                "category": category_id,
                "asset_code": "AST-DEL",
                "asset_name": "Asset Delete Test",
                "serial_number": "AST-DELETE-TEST",
                "acquisition_date": "2026-12-01",
                "available_for_use_date": "2026-12-02",
                "acquisition_cost": "1000.00",
                "salvage_value": "0.00",
                "useful_life_months": 1,
                "status": "DRAFT",
            },
        ]
        asset_report = client.seed_resource(
            stage_name="stage_7.assets",
            state_path=("stage_7", "assets"),
            endpoint="/api/v1/assets/assets/",
            items=assets,
            match_fields=("asset_code", "company"),
            patch_payload={"asset_name": "Main Data Center Server Rack Updated"},
            delete_key="AST-DEL",
            search_term="Server",
            company_id=company_id,
        )
        reports.append(asset_report)

        asset_id = client.require_state_id(
            ("stage_7", "assets", "AST-SERVER-01"),
            "AST-SERVER-01 asset",
        )

        books = [
            {
                "_key": "BOOK-TAX-2026",
                "asset": asset_id,
                "book_type": "TAX",
                "depreciation_method": "STRAIGHT_LINE",
                "cost_basis": "650000000.00",
                "salvage_value": "50000000.00",
                "useful_life_periods": 60,
                "depreciation_start_date": "2026-02-01",
                "accumulated_depreciation": "50000000.00",
                "net_book_value": "600000000.00",
            },
            {
                "_key": "BOOK-COMM-2026",
                "asset": asset_id,
                "book_type": "COMMERCIAL",
                "depreciation_method": "STRAIGHT_LINE",
                "cost_basis": "650000000.00",
                "salvage_value": "50000000.00",
                "useful_life_periods": 60,
                "depreciation_start_date": "2026-02-01",
                "accumulated_depreciation": "50000000.00",
                "net_book_value": "600000000.00",
            },
            {
                "_key": "BOOK-IFRS-2026",
                "asset": asset_id,
                "book_type": "IFRS",
                "depreciation_method": "DECLINING_BALANCE",
                "cost_basis": "650000000.00",
                "salvage_value": "50000000.00",
                "useful_life_periods": 60,
                "depreciation_start_date": "2026-02-01",
                "accumulated_depreciation": "62500000.00",
                "net_book_value": "587500000.00",
            },
            {
                "_key": "BOOK-ARCHIVED",
                "asset": asset_id,
                "book_type": "ARCHIVED",
                "depreciation_method": "STRAIGHT_LINE",
                "cost_basis": "500000000.00",
                "salvage_value": "25000000.00",
                "useful_life_periods": 48,
                "depreciation_start_date": "2024-01-01",
                "accumulated_depreciation": "200000000.00",
                "net_book_value": "300000000.00",
            },
            {
                "_key": "BOOK-DEL",
                "asset": asset_id,
                "book_type": "DELETE_TEST",
                "depreciation_method": "STRAIGHT_LINE",
                "cost_basis": "1000.00",
                "salvage_value": "0.00",
                "useful_life_periods": 1,
                "depreciation_start_date": "2026-12-01",
                "accumulated_depreciation": "0.00",
                "net_book_value": "1000.00",
            },
        ]
        book_report = client.seed_resource(
            stage_name="stage_7.asset_books",
            state_path=("stage_7", "asset_books"),
            endpoint="/api/v1/assets/books/",
            items=books,
            match_fields=("book_type", "asset"),
            patch_payload={"net_book_value": "599000000.00"},
            delete_key="BOOK-DEL",
            search_term="TAX",
            company_id=company_id,
        )
        reports.append(book_report)

        maintenances = [
            {
                "_key": "MNT-2026-Q1",
                "asset": asset_id,
                "scheduled_date": "2026-03-15",
                "completed_date": "2026-03-15",
                "maintenance_type": "PREVENTIVE",
                "maintenance_cost": "15000000.00",
                "status": "COMPLETED",
            },
            {
                "_key": "MNT-2026-EMG",
                "asset": asset_id,
                "scheduled_date": "2026-08-20",
                "maintenance_type": "EMERGENCY",
                "maintenance_cost": "35000000.00",
                "status": "IN_PROGRESS",
            },
            {
                "_key": "MNT-2025-Q4",
                "asset": asset_id,
                "scheduled_date": "2025-12-15",
                "completed_date": "2025-12-15",
                "maintenance_type": "CALIBRATION",
                "maintenance_cost": "12000000.00",
                "status": "COMPLETED",
            },
            {
                "_key": "MNT-CANCELLED",
                "asset": asset_id,
                "scheduled_date": "2026-07-10",
                "maintenance_type": "CLEANING",
                "maintenance_cost": "2500000.00",
                "status": "CANCELLED",
            },
            {
                "_key": "MNT-DEL",
                "asset": asset_id,
                "scheduled_date": "2026-12-31",
                "maintenance_type": "DELETE_TEST",
                "maintenance_cost": "1000.00",
                "status": "SCHEDULED",
            },
        ]
        maintenance_report = client.seed_resource(
            stage_name="stage_7.asset_maintenances",
            state_path=("stage_7", "asset_maintenances"),
            endpoint="/api/v1/assets/maintenances/",
            items=maintenances,
            match_fields=("scheduled_date", "maintenance_type", "asset"),
            patch_payload={"status": "COMPLETED"},
            delete_key="MNT-DEL",
            search_term="PREVENTIVE",
            company_id=company_id,
        )
        reports.append(maintenance_report)

        disposals = [
            {
                "_key": "DSP-2026-001",
                "asset": asset_id,
                "disposal_date": "2026-11-01",
                "disposal_proceeds": "550000000.00",
                "net_book_value": "500000000.00",
                "gain_or_loss": "50000000.00",
                "status": "APPROVED",
            },
            {
                "_key": "DSP-2026-002",
                "asset": asset_id,
                "disposal_date": "2026-11-15",
                "disposal_proceeds": "480000000.00",
                "net_book_value": "500000000.00",
                "gain_or_loss": "-20000000.00",
                "status": "DRAFT",
            },
            {
                "_key": "DSP-2026-003",
                "asset": asset_id,
                "disposal_date": "2026-10-01",
                "disposal_proceeds": "510000000.00",
                "net_book_value": "500000000.00",
                "gain_or_loss": "10000000.00",
                "status": "COMPLETED",
            },
            {
                "_key": "DSP-REJECTED",
                "asset": asset_id,
                "disposal_date": "2026-09-01",
                "disposal_proceeds": "450000000.00",
                "net_book_value": "500000000.00",
                "gain_or_loss": "-50000000.00",
                "status": "REJECTED",
            },
            {
                "_key": "DSP-DEL",
                "asset": asset_id,
                "disposal_date": "2026-12-31",
                "disposal_proceeds": "1000.00",
                "net_book_value": "1000.00",
                "gain_or_loss": "0.00",
                "status": "DRAFT",
            },
        ]
        disposal_report = client.seed_resource(
            stage_name="stage_7.asset_disposals",
            state_path=("stage_7", "asset_disposals"),
            endpoint="/api/v1/assets/disposals/",
            items=disposals,
            match_fields=("disposal_date", "asset"),
            patch_payload={"status": "APPROVED"},
            delete_key="DSP-DEL",
            search_term="APPROVED",
            company_id=company_id,
        )
        reports.append(disposal_report)

        success = stage_is_successful(reports)

        print("\n" + "=" * 68)
        print("HASIL SEEDING TAHAP 7 — ASSETS")
        print("=" * 68)
        print(
            json.dumps(
                {
                    "success": success,
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
        return success

    except SeederError as exc:
        print(f"\n[STAGE 7 FAILED] {exc}")
        return False


if __name__ == "__main__":
    raise SystemExit(0 if run_stage() else 1)

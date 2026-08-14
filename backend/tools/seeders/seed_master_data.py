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

        tenant_id = client.require_state_id(
            ("created_records", "DUMMY-HOLDING"),
            "DUMMY-HOLDING tenant",
        )
        company_id = client.require_state_id(
            ("stage_2", "companies", "COMP-HOLDING"),
            "COMP-HOLDING company",
        )

        reports = []

        currencies = [
            {
                "_key": "IDR",
                "currency_code": "IDR",
                "currency_name": "Indonesian Rupiah",
                "symbol": "Rp",
                "decimal_places": 2,
            },
            {
                "_key": "USD",
                "currency_code": "USD",
                "currency_name": "US Dollar",
                "symbol": "$",
                "decimal_places": 2,
            },
            {
                "_key": "EUR",
                "currency_code": "EUR",
                "currency_name": "Euro",
                "symbol": "€",
                "decimal_places": 2,
            },
            {
                "_key": "SGD",
                "currency_code": "SGD",
                "currency_name": "Singapore Dollar",
                "symbol": "S$",
                "decimal_places": 2,
            },
            {
                "_key": "DEL",
                "currency_code": "DEL",
                "currency_name": "Delete Test Currency",
                "symbol": "D$",
                "decimal_places": 2,
            },
        ]
        currency_report = client.seed_resource(
            stage_name="stage_3.currencies",
            state_path=("stage_3", "currencies"),
            endpoint="/api/v1/master-data/currencies/",
            items=currencies,
            match_fields=("currency_code",),
            patch_payload={"currency_name": "Indonesian Rupiah Updated"},
            delete_key="DEL",
            search_term="Rupiah",
            company_id=company_id,
        )
        reports.append(currency_report)

        currency_id = client.require_state_id(
            ("stage_3", "currencies", "IDR"),
            "IDR currency",
        )

        uoms = [
            {
                "_key": "PCS",
                "tenant": tenant_id,
                "uom_code": "PCS",
                "uom_name": "Pieces",
                "dimension_type": "COUNT",
                "base_uom": True,
            },
            {
                "_key": "BOX",
                "tenant": tenant_id,
                "uom_code": "BOX",
                "uom_name": "Box",
                "dimension_type": "COUNT",
                "base_uom": False,
            },
            {
                "_key": "KG",
                "tenant": tenant_id,
                "uom_code": "KG",
                "uom_name": "Kilogram",
                "dimension_type": "WEIGHT",
                "base_uom": True,
            },
            {
                "_key": "MTR",
                "tenant": tenant_id,
                "uom_code": "MTR",
                "uom_name": "Meter",
                "dimension_type": "LENGTH",
                "base_uom": True,
            },
            {
                "_key": "UOM-DEL",
                "tenant": tenant_id,
                "uom_code": "UOM-DEL",
                "uom_name": "UOM Delete Test",
                "dimension_type": "COUNT",
                "base_uom": False,
            },
        ]
        uom_report = client.seed_resource(
            stage_name="stage_3.uoms",
            state_path=("stage_3", "uoms"),
            endpoint="/api/v1/master-data/uoms/",
            items=uoms,
            match_fields=("uom_code", "tenant"),
            patch_payload={"uom_name": "Pieces Updated"},
            delete_key="UOM-DEL",
            search_term="Pieces",
            company_id=company_id,
        )
        reports.append(uom_report)

        pcs_uom_id = client.require_state_id(
            ("stage_3", "uoms", "PCS"),
            "PCS UOM",
        )

        categories = [
            {
                "_key": "CAT-RAW",
                "tenant": tenant_id,
                "category_code": "CAT-RAW",
                "category_name": "Raw Materials",
                "status": "ACTIVE",
            },
            {
                "_key": "CAT-FG",
                "tenant": tenant_id,
                "category_code": "CAT-FG",
                "category_name": "Finished Goods",
                "status": "ACTIVE",
            },
            {
                "_key": "CAT-SERVICE",
                "tenant": tenant_id,
                "category_code": "CAT-SERVICE",
                "category_name": "Services",
                "status": "ACTIVE",
            },
            {
                "_key": "CAT-SPARE",
                "tenant": tenant_id,
                "category_code": "CAT-SPARE",
                "category_name": "Spare Parts",
                "status": "ACTIVE",
            },
            {
                "_key": "CAT-DEL",
                "tenant": tenant_id,
                "category_code": "CAT-DEL",
                "category_name": "Category Delete Test",
                "status": "ACTIVE",
            },
        ]
        category_report = client.seed_resource(
            stage_name="stage_3.categories",
            state_path=("stage_3", "categories"),
            endpoint="/api/v1/master-data/product-categories/",
            items=categories,
            match_fields=("category_code", "tenant"),
            patch_payload={"category_name": "Raw Materials Updated"},
            delete_key="CAT-DEL",
            search_term="Goods",
            company_id=company_id,
        )
        reports.append(category_report)

        fg_category_id = client.require_state_id(
            ("stage_3", "categories", "CAT-FG"),
            "CAT-FG product category",
        )
        service_category_id = client.require_state_id(
            ("stage_3", "categories", "CAT-SERVICE"),
            "CAT-SERVICE product category",
        )

        products = [
            {
                "_key": "PROD-ITEM-A",
                "tenant": tenant_id,
                "category": fg_category_id,
                "base_uom": pcs_uom_id,
                "product_code": "PROD-ITEM-A",
                "product_name": "Standard Product Item A",
                "product_type": "GOODS",
                "costing_method": "AVERAGE",
                "stock_item": True,
                "purchase_item": True,
                "sales_item": True,
                "manufactured_item": True,
                "lot_controlled": False,
                "serial_controlled": False,
                "status": "ACTIVE",
            },
            {
                "_key": "PROD-ITEM-B",
                "tenant": tenant_id,
                "category": fg_category_id,
                "base_uom": pcs_uom_id,
                "product_code": "PROD-ITEM-B",
                "product_name": "Advanced Product Item B",
                "product_type": "GOODS",
                "costing_method": "STANDARD",
                "stock_item": True,
                "purchase_item": True,
                "sales_item": True,
                "manufactured_item": False,
                "lot_controlled": True,
                "serial_controlled": False,
                "status": "ACTIVE",
            },
            {
                "_key": "PROD-SVC-A",
                "tenant": tenant_id,
                "category": service_category_id,
                "base_uom": pcs_uom_id,
                "product_code": "PROD-SVC-A",
                "product_name": "Consulting Service A",
                "product_type": "SERVICE",
                "costing_method": "STANDARD",
                "stock_item": False,
                "purchase_item": False,
                "sales_item": True,
                "manufactured_item": False,
                "lot_controlled": False,
                "serial_controlled": False,
                "status": "ACTIVE",
            },
            {
                "_key": "PROD-INACTIVE",
                "tenant": tenant_id,
                "category": fg_category_id,
                "base_uom": pcs_uom_id,
                "product_code": "PROD-INACTIVE",
                "product_name": "Discontinued Product",
                "product_type": "GOODS",
                "costing_method": "AVERAGE",
                "stock_item": True,
                "purchase_item": False,
                "sales_item": False,
                "manufactured_item": False,
                "lot_controlled": False,
                "serial_controlled": False,
                "status": "INACTIVE",
            },
            {
                "_key": "PROD-DEL",
                "tenant": tenant_id,
                "category": fg_category_id,
                "base_uom": pcs_uom_id,
                "product_code": "PROD-DEL",
                "product_name": "Product Delete Test",
                "product_type": "GOODS",
                "costing_method": "AVERAGE",
                "stock_item": False,
                "purchase_item": False,
                "sales_item": False,
                "manufactured_item": False,
                "lot_controlled": False,
                "serial_controlled": False,
                "status": "ACTIVE",
            },
        ]
        product_report = client.seed_resource(
            stage_name="stage_3.products",
            state_path=("stage_3", "products"),
            endpoint="/api/v1/master-data/products/",
            items=products,
            match_fields=("product_code", "tenant"),
            patch_payload={"product_name": "Standard Product Item A Updated"},
            delete_key="PROD-DEL",
            search_term="Standard",
            company_id=company_id,
        )
        reports.append(product_report)

        parties = [
            {
                "_key": "PARTY-CUST-01",
                "tenant": tenant_id,
                "party_code": "PARTY-CUST-01",
                "party_type": "CUSTOMER",
                "legal_name": "PT Pelanggan Utama",
                "display_name": "Pelanggan Utama",
                "tax_number": "02.000.000.0-001.000",
                "status": "ACTIVE",
                "default_currency": currency_id,
            },
            {
                "_key": "PARTY-SUPP-01",
                "tenant": tenant_id,
                "party_code": "PARTY-SUPP-01",
                "party_type": "SUPPLIER",
                "legal_name": "PT Pemasok Bahan Baku",
                "display_name": "Pemasok Bahan Baku",
                "tax_number": "02.000.000.0-002.000",
                "status": "ACTIVE",
                "default_currency": currency_id,
            },
            {
                "_key": "PARTY-BOTH-01",
                "tenant": tenant_id,
                "party_code": "PARTY-BOTH-01",
                "party_type": "BOTH",
                "legal_name": "PT Mitra Dual Fungsi",
                "display_name": "Mitra Dual Fungsi",
                "status": "ACTIVE",
                "default_currency": currency_id,
            },
            {
                "_key": "PARTY-INACTIVE",
                "tenant": tenant_id,
                "party_code": "PARTY-INACTIVE",
                "party_type": "CUSTOMER",
                "legal_name": "PT Inactive Partner",
                "display_name": "Inactive Partner",
                "status": "INACTIVE",
                "default_currency": currency_id,
            },
            {
                "_key": "PARTY-DEL",
                "tenant": tenant_id,
                "party_code": "PARTY-DEL",
                "party_type": "CUSTOMER",
                "legal_name": "Party Delete Test",
                "display_name": "Party Delete Test",
                "status": "ACTIVE",
                "default_currency": currency_id,
            },
        ]
        party_report = client.seed_resource(
            stage_name="stage_3.parties",
            state_path=("stage_3", "parties"),
            endpoint="/api/v1/master-data/parties/",
            items=parties,
            match_fields=("party_code", "tenant"),
            patch_payload={"display_name": "Pelanggan Utama Updated"},
            delete_key="PARTY-DEL",
            search_term="Pelanggan",
            company_id=company_id,
        )
        reports.append(party_report)

        success = stage_is_successful(reports)

        print("\n" + "=" * 68)
        print("HASIL SEEDING TAHAP 3 — MASTER DATA")
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
        print(f"\n[STAGE 3 FAILED] {exc}")
        return False


if __name__ == "__main__":
    raise SystemExit(0 if run_stage() else 1)

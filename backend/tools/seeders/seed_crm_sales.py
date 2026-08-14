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
        customer_id = client.require_state_id(
            ("stage_3", "parties", "PARTY-CUST-01"),
            "customer party",
        )
        currency_id = client.require_state_id(
            ("stage_3", "currencies", "IDR"),
            "IDR currency",
        )
        owner_user_id = client.require_state_id(
            ("stage_2", "users", "dummy.manager@example.com"),
            "dummy manager user",
        )

        reports = []

        leads = [
            {
                "_key": "LEAD-001",
                "tenant": tenant_id,
                "company": company_id,
                "party": customer_id,
                "owner_user": owner_user_id,
                "lead_source": "REFERRAL",
                "lead_status": "QUALIFIED",
                "estimated_value": "250000000.00",
                "expected_close_date": "2026-09-15",
            },
            {
                "_key": "LEAD-002",
                "tenant": tenant_id,
                "company": company_id,
                "party": customer_id,
                "owner_user": owner_user_id,
                "lead_source": "WEBSITE",
                "lead_status": "NEW",
                "estimated_value": "75000000.00",
                "expected_close_date": "2026-10-01",
            },
            {
                "_key": "LEAD-003",
                "tenant": tenant_id,
                "company": company_id,
                "party": customer_id,
                "owner_user": owner_user_id,
                "lead_source": "CAMPAIGN",
                "lead_status": "IN_PROGRESS",
                "estimated_value": "425000000.00",
                "expected_close_date": "2026-11-20",
            },
            {
                "_key": "LEAD-INACTIVE",
                "tenant": tenant_id,
                "company": company_id,
                "party": customer_id,
                "owner_user": owner_user_id,
                "lead_source": "COLD_CALL",
                "lead_status": "LOST",
                "estimated_value": "50000000.00",
                "expected_close_date": "2026-08-31",
            },
            {
                "_key": "LEAD-DEL",
                "tenant": tenant_id,
                "company": company_id,
                "party": customer_id,
                "owner_user": owner_user_id,
                "lead_source": "TEST",
                "lead_status": "NEW",
                "estimated_value": "1000.00",
                "expected_close_date": "2026-12-31",
            },
        ]
        lead_report = client.seed_resource(
            stage_name="stage_4.leads",
            state_path=("stage_4", "leads"),
            endpoint="/api/v1/crm/leads/",
            items=leads,
            match_fields=(
                "lead_source",
                "expected_close_date",
                "party",
                "company",
            ),
            patch_payload={"lead_status": "QUALIFIED"},
            delete_key="LEAD-DEL",
            search_term="QUALIFIED",
            company_id=company_id,
        )
        reports.append(lead_report)

        quotations = [
            {
                "_key": "SQ-2026-001",
                "customer_party": customer_id,
                "currency": currency_id,
                "valid_until": "2026-09-30",
                "subtotal": "200000000.00",
                "tax_amount": "22000000.00",
                "total_amount": "222000000.00",
                "estimated_total_cost": "165000000.00",
                "estimated_margin": "35000000.00",
                "status": "DRAFT",
            },
            {
                "_key": "SQ-2026-002",
                "customer_party": customer_id,
                "currency": currency_id,
                "valid_until": "2026-10-31",
                "subtotal": "85000000.00",
                "tax_amount": "9350000.00",
                "total_amount": "94350000.00",
                "estimated_total_cost": "60000000.00",
                "estimated_margin": "25000000.00",
                "status": "SENT",
            },
            {
                "_key": "SQ-2026-003",
                "customer_party": customer_id,
                "currency": currency_id,
                "valid_until": "2026-11-30",
                "subtotal": "125000000.00",
                "tax_amount": "13750000.00",
                "total_amount": "138750000.00",
                "estimated_total_cost": "95000000.00",
                "estimated_margin": "30000000.00",
                "status": "APPROVED",
            },
            {
                "_key": "SQ-2026-EXPIRED",
                "customer_party": customer_id,
                "currency": currency_id,
                "valid_until": "2026-07-31",
                "subtotal": "45000000.00",
                "tax_amount": "4950000.00",
                "total_amount": "49950000.00",
                "estimated_total_cost": "35000000.00",
                "estimated_margin": "10000000.00",
                "status": "EXPIRED",
            },
            {
                "_key": "SQ-DEL",
                "customer_party": customer_id,
                "currency": currency_id,
                "valid_until": "2026-12-31",
                "subtotal": "1000.00",
                "tax_amount": "110.00",
                "total_amount": "1110.00",
                "estimated_total_cost": "900.00",
                "estimated_margin": "100.00",
                "status": "DRAFT",
            },
        ]
        quotation_report = client.seed_resource(
            stage_name="stage_4.quotations",
            state_path=("stage_4", "quotations"),
            endpoint="/api/v1/sales/quotations/",
            items=quotations,
            match_fields=("valid_until", "total_amount", "customer_party"),
            patch_payload={"status": "DRAFT"},
            delete_key="SQ-DEL",
            search_term="APPROVED",
            company_id=company_id,
        )
        reports.append(quotation_report)

        approved_quotation_id = client.require_state_id(
            ("stage_4", "quotations", "SQ-2026-003"),
            "approved sales quotation",
        )

        sales_orders = [
            {
                "_key": "SO-2026-001",
                "quotation": approved_quotation_id,
                "customer_party": customer_id,
                "currency": currency_id,
                "order_date": "2026-08-10",
                "requested_delivery_date": "2026-09-10",
                "subtotal": "125000000.00",
                "tax_amount": "13750000.00",
                "total_amount": "138750000.00",
                "status": "CONFIRMED",
            },
            {
                "_key": "SO-2026-002",
                "customer_party": customer_id,
                "currency": currency_id,
                "order_date": "2026-08-12",
                "requested_delivery_date": "2026-09-20",
                "subtotal": "85000000.00",
                "tax_amount": "9350000.00",
                "total_amount": "94350000.00",
                "status": "DRAFT",
            },
            {
                "_key": "SO-2026-003",
                "customer_party": customer_id,
                "currency": currency_id,
                "order_date": "2026-08-15",
                "requested_delivery_date": "2026-10-01",
                "subtotal": "60000000.00",
                "tax_amount": "6600000.00",
                "total_amount": "66600000.00",
                "status": "IN_PROGRESS",
            },
            {
                "_key": "SO-CANCELLED",
                "customer_party": customer_id,
                "currency": currency_id,
                "order_date": "2026-07-15",
                "requested_delivery_date": "2026-08-15",
                "subtotal": "25000000.00",
                "tax_amount": "2750000.00",
                "total_amount": "27750000.00",
                "status": "CANCELLED",
            },
            {
                "_key": "SO-DEL",
                "customer_party": customer_id,
                "currency": currency_id,
                "order_date": "2026-12-01",
                "requested_delivery_date": "2026-12-15",
                "subtotal": "1000.00",
                "tax_amount": "110.00",
                "total_amount": "1110.00",
                "status": "DRAFT",
            },
        ]
        order_report = client.seed_resource(
            stage_name="stage_4.sales_orders",
            state_path=("stage_4", "sales_orders"),
            endpoint="/api/v1/sales/orders/",
            items=sales_orders,
            match_fields=("order_date", "total_amount", "customer_party"),
            patch_payload={"status": "CONFIRMED"},
            delete_key="SO-DEL",
            search_term="CONFIRMED",
            company_id=company_id,
        )
        reports.append(order_report)

        confirmed_order_id = client.require_state_id(
            ("stage_4", "sales_orders", "SO-2026-001"),
            "confirmed sales order",
        )

        deliveries = [
            {
                "_key": "DO-2026-001",
                "sales_order": confirmed_order_id,
                "customer_party": customer_id,
                "delivery_date": "2026-09-01",
                "delivery_status": "READY",
            },
            {
                "_key": "DO-2026-002",
                "sales_order": confirmed_order_id,
                "customer_party": customer_id,
                "delivery_date": "2026-09-05",
                "delivery_status": "SHIPPED",
            },
            {
                "_key": "DO-2026-003",
                "sales_order": confirmed_order_id,
                "customer_party": customer_id,
                "delivery_date": "2026-09-10",
                "delivery_status": "DELIVERED",
            },
            {
                "_key": "DO-RETURNED",
                "sales_order": confirmed_order_id,
                "customer_party": customer_id,
                "delivery_date": "2026-09-12",
                "delivery_status": "RETURNED",
            },
            {
                "_key": "DO-DEL",
                "sales_order": confirmed_order_id,
                "customer_party": customer_id,
                "delivery_date": "2026-12-31",
                "delivery_status": "DRAFT",
            },
        ]
        delivery_report = client.seed_resource(
            stage_name="stage_4.deliveries",
            state_path=("stage_4", "deliveries"),
            endpoint="/api/v1/sales/deliveries/",
            items=deliveries,
            match_fields=(
                "delivery_date",
                "delivery_status",
                "sales_order",
            ),
            patch_payload={"delivery_status": "READY"},
            delete_key="DO-DEL",
            search_term="SHIPPED",
            company_id=company_id,
        )
        reports.append(delivery_report)

        success = stage_is_successful(reports)

        print("\n" + "=" * 68)
        print("HASIL SEEDING TAHAP 4 — CRM & SALES")
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
        print(f"\n[STAGE 4 FAILED] {exc}")
        return False


if __name__ == "__main__":
    raise SystemExit(0 if run_stage() else 1)

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
        currency_id = client.require_state_id(
            ("stage_3", "currencies", "IDR"),
            "IDR currency",
        )
        product_id = client.require_state_id(
            ("stage_3", "products", "PROD-ITEM-A"),
            "purchased product",
        )
        uom_id = client.require_state_id(
            ("stage_3", "uoms", "PCS"),
            "PCS unit of measure",
        )
        requested_by_id = client.require_state_id(
            ("stage_2", "users", "dummy.staff@example.com"),
            "dummy staff user",
        )

        reports = []

        requisitions = [
            {
                "_key": "PR-2026-001",
                "company": company_id,
                "requested_by": requested_by_id,
                "request_date": "2026-08-10",
                "required_date": "2026-08-30",
                "status": "APPROVED",
            },
            {
                "_key": "PR-2026-002",
                "company": company_id,
                "requested_by": requested_by_id,
                "request_date": "2026-08-11",
                "required_date": "2026-09-05",
                "status": "DRAFT",
            },
            {
                "_key": "PR-2026-003",
                "company": company_id,
                "requested_by": requested_by_id,
                "request_date": "2026-08-12",
                "required_date": "2026-09-10",
                "status": "SUBMITTED",
            },
            {
                "_key": "PR-CANCELLED",
                "company": company_id,
                "requested_by": requested_by_id,
                "request_date": "2026-07-15",
                "required_date": "2026-08-01",
                "status": "CANCELLED",
            },
            {
                "_key": "PR-DEL",
                "company": company_id,
                "requested_by": requested_by_id,
                "request_date": "2026-12-01",
                "required_date": "2026-12-15",
                "status": "DRAFT",
            },
        ]
        requisition_report = client.seed_resource(
            stage_name="stage_5.purchase_requisitions",
            state_path=("stage_5", "purchase_requisitions"),
            endpoint="/api/v1/procurement/purchase-requisitions/",
            items=requisitions,
            match_fields=(
                "request_date",
                "required_date",
                "company",
                "requested_by",
            ),
            patch_payload={"status": "APPROVED"},
            delete_key="PR-DEL",
            search_term="APPROVED",
            company_id=company_id,
        )
        reports.append(requisition_report)

        approved_requisition_id = client.require_state_id(
            ("stage_5", "purchase_requisitions", "PR-2026-001"),
            "approved purchase requisition",
        )

        rfqs = [
            {
                "_key": "RFQ-2026-001",
                "requisition": approved_requisition_id,
                "issue_date": "2026-08-12",
                "closing_date": "2026-08-20",
                "status": "SENT",
            },
            {
                "_key": "RFQ-2026-002",
                "issue_date": "2026-08-15",
                "closing_date": "2026-08-25",
                "status": "DRAFT",
            },
            {
                "_key": "RFQ-2026-003",
                "issue_date": "2026-07-01",
                "closing_date": "2026-07-15",
                "status": "CLOSED",
            },
            {
                "_key": "RFQ-EXPIRED",
                "issue_date": "2026-06-01",
                "closing_date": "2026-06-10",
                "status": "EXPIRED",
            },
            {
                "_key": "RFQ-DEL",
                "issue_date": "2026-12-01",
                "closing_date": "2026-12-05",
                "status": "DRAFT",
            },
        ]
        rfq_report = client.seed_resource(
            stage_name="stage_5.rfqs",
            state_path=("stage_5", "rfqs"),
            endpoint="/api/v1/procurement/rfqs/",
            items=rfqs,
            match_fields=("issue_date", "closing_date", "status"),
            patch_payload={"status": "SENT"},
            delete_key="RFQ-DEL",
            search_term="SENT",
            company_id=company_id,
        )
        reports.append(rfq_report)

        purchase_orders = [
            {
                "_key": "PO-2026-001",
                "supplier_party": supplier_id,
                "currency": currency_id,
                "order_date": "2026-08-20",
                "expected_receipt_date": "2026-09-10",
                "subtotal": "150000000.00",
                "tax_amount": "16500000.00",
                "total_amount": "166500000.00",
                "status": "APPROVED",
            },
            {
                "_key": "PO-2026-002",
                "supplier_party": supplier_id,
                "currency": currency_id,
                "order_date": "2026-08-21",
                "expected_receipt_date": "2026-09-15",
                "subtotal": "45000000.00",
                "tax_amount": "4950000.00",
                "total_amount": "49950000.00",
                "status": "DRAFT",
            },
            {
                "_key": "PO-2026-003",
                "supplier_party": supplier_id,
                "currency": currency_id,
                "order_date": "2026-08-22",
                "expected_receipt_date": "2026-09-20",
                "subtotal": "75000000.00",
                "tax_amount": "8250000.00",
                "total_amount": "83250000.00",
                "status": "SENT",
            },
            {
                "_key": "PO-CANCELLED",
                "supplier_party": supplier_id,
                "currency": currency_id,
                "order_date": "2026-07-01",
                "expected_receipt_date": "2026-07-20",
                "subtotal": "20000000.00",
                "tax_amount": "2200000.00",
                "total_amount": "22200000.00",
                "status": "CANCELLED",
            },
            {
                "_key": "PO-DEL",
                "supplier_party": supplier_id,
                "currency": currency_id,
                "order_date": "2026-12-01",
                "expected_receipt_date": "2026-12-10",
                "subtotal": "1000.00",
                "tax_amount": "110.00",
                "total_amount": "1110.00",
                "status": "DRAFT",
            },
        ]
        purchase_order_report = client.seed_resource(
            stage_name="stage_5.purchase_orders",
            state_path=("stage_5", "purchase_orders"),
            endpoint="/api/v1/procurement/purchase-orders/",
            items=purchase_orders,
            match_fields=("order_date", "total_amount", "supplier_party"),
            patch_payload={"status": "APPROVED"},
            delete_key="PO-DEL",
            search_term="APPROVED",
            company_id=company_id,
        )
        reports.append(purchase_order_report)

        matched_po_id = client.require_state_id(
            ("stage_5", "purchase_orders", "PO-2026-003"),
            "purchase order for three-way matching",
        )
        purchase_order_line_report = client.seed_resource(
            stage_name="stage_5.purchase_order_lines",
            state_path=("stage_5", "purchase_order_lines"),
            endpoint="/api/v1/procurement/purchase-order-lines/",
            items=[{
                "_key": "POL-2026-003-01",
                "purchase_order": matched_po_id,
                "product": product_id,
                "ordered_quantity": "10.00",
                "received_quantity": "10.00",
                "invoiced_quantity": "10.00",
                "uom": uom_id,
                "unit_price": "7500000.00",
            }],
            match_fields=("purchase_order", "product", "uom"),
            patch_payload={"received_quantity": "10.00"},
            delete_key=None,
            search_term="10.00",
            company_id=company_id,
        )
        reports.append(purchase_order_line_report)

        po_line_id = client.require_state_id(
            ("stage_5", "purchase_order_lines", "POL-2026-003-01"),
            "purchase order line for three-way matching",
        )
        goods_receipt_report = client.seed_resource(
            stage_name="stage_5.goods_receipts",
            state_path=("stage_5", "goods_receipts"),
            endpoint="/api/v1/procurement/goods-receipts/",
            items=[{
                "_key": "GR-2026-003",
                "purchase_order": matched_po_id,
                "supplier_party": supplier_id,
                "receipt_date": "2026-09-20",
                "inspection_status": "ACCEPTED",
                "status": "COMPLETED",
            }],
            match_fields=("purchase_order", "receipt_date", "supplier_party"),
            patch_payload={"status": "COMPLETED", "inspection_status": "ACCEPTED"},
            delete_key=None,
            search_term="COMPLETED",
            company_id=company_id,
        )
        reports.append(goods_receipt_report)

        goods_receipt_id = client.require_state_id(
            ("stage_5", "goods_receipts", "GR-2026-003"),
            "goods receipt for three-way matching",
        )
        goods_receipt_line_report = client.seed_resource(
            stage_name="stage_5.goods_receipt_lines",
            state_path=("stage_5", "goods_receipt_lines"),
            endpoint="/api/v1/procurement/goods-receipt-lines/",
            items=[{
                "_key": "GRL-2026-003-01",
                "goods_receipt": goods_receipt_id,
                "purchase_order_line": po_line_id,
                "product": product_id,
                "received_quantity": "10.00",
                "accepted_quantity": "10.00",
                "rejected_quantity": "0.00",
                "uom": uom_id,
            }],
            match_fields=("goods_receipt", "purchase_order_line", "product"),
            patch_payload={"accepted_quantity": "10.00", "rejected_quantity": "0.00"},
            delete_key=None,
            search_term="10.00",
            company_id=company_id,
        )
        reports.append(goods_receipt_line_report)

        stock_moves = [
            {
                "_key": "SM-2026-001",
                "company": company_id,
                "move_type": "RECEIPT",
                "scheduled_at": "2026-09-10T08:00:00+07:00",
                "completed_at": "2026-09-10T15:00:00+07:00",
                "status": "DONE",
            },
            {
                "_key": "SM-2026-002",
                "company": company_id,
                "move_type": "TRANSFER",
                "scheduled_at": "2026-09-11T08:00:00+07:00",
                "status": "READY",
            },
            {
                "_key": "SM-2026-003",
                "company": company_id,
                "move_type": "ISSUE",
                "scheduled_at": "2026-09-12T08:00:00+07:00",
                "status": "DRAFT",
            },
            {
                "_key": "SM-CANCELLED",
                "company": company_id,
                "move_type": "TRANSFER",
                "scheduled_at": "2026-08-01T08:00:00+07:00",
                "status": "CANCELLED",
            },
            {
                "_key": "SM-DEL",
                "company": company_id,
                "move_type": "ADJUSTMENT",
                "scheduled_at": "2026-12-31T08:00:00+07:00",
                "status": "DRAFT",
            },
        ]
        stock_move_report = client.seed_resource(
            stage_name="stage_5.stock_moves",
            state_path=("stage_5", "stock_moves"),
            endpoint="/api/v1/inventory/stock-moves/",
            items=stock_moves,
            match_fields=("move_type", "scheduled_at", "company"),
            patch_payload={"status": "READY"},
            delete_key="SM-DEL",
            search_term="TRANSFER",
            company_id=company_id,
        )
        reports.append(stock_move_report)

        stock_counts = [
            {
                "_key": "SC-2026-Q1",
                "count_date": "2026-03-31",
                "count_type": "FULL",
                "status": "IN_PROGRESS",
            },
            {
                "_key": "SC-2026-Q2",
                "count_date": "2026-06-30",
                "count_type": "CYCLE",
                "status": "DRAFT",
            },
            {
                "_key": "SC-2025-FINISH",
                "count_date": "2025-12-31",
                "count_type": "FULL",
                "status": "COMPLETED",
            },
            {
                "_key": "SC-CANCELLED",
                "count_date": "2026-01-31",
                "count_type": "CYCLE",
                "status": "CANCELLED",
            },
            {
                "_key": "SC-DEL",
                "count_date": "2026-12-31",
                "count_type": "TEST",
                "status": "DRAFT",
            },
        ]
        stock_count_report = client.seed_resource(
            stage_name="stage_5.stock_counts",
            state_path=("stage_5", "stock_counts"),
            endpoint="/api/v1/inventory/stock-counts/",
            items=stock_counts,
            match_fields=("count_date", "count_type", "status"),
            patch_payload={"status": "IN_PROGRESS"},
            delete_key="SC-DEL",
            search_term="FULL",
            company_id=company_id,
        )
        reports.append(stock_count_report)

        success = stage_is_successful(reports)

        print("\n" + "=" * 68)
        print("HASIL SEEDING TAHAP 5 — PROCUREMENT & INVENTORY")
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
        print(f"\n[STAGE 5 FAILED] {exc}")
        return False


if __name__ == "__main__":
    raise SystemExit(0 if run_stage() else 1)

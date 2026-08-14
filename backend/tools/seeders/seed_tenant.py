from __future__ import annotations

import json
import sys
from typing import Optional

from seeder_common import (
    SeederClient,
    SeederError,
    build_client,
    configure_logging,
)


def run_stage(client: Optional[SeederClient] = None) -> bool:
    configure_logging()
    own_client = client is None
    client = client or build_client()

    try:
        if own_client:
            client.bootstrap()

        endpoint = "/api/v1/core/tenants/"
        items = [
            {
                "_key": "DUMMY-HOLDING",
                "code": "DUMMY-HOLDING",
                "name": "Dummy Holding Indonesia",
                "status": "ACTIVE",
            },
            {
                "_key": "DUMMY-MANUFACTURING",
                "code": "DUMMY-MANUFACTURING",
                "name": "Dummy Manufacturing Group",
                "status": "ACTIVE",
            },
            {
                "_key": "DUMMY-SERVICE",
                "code": "DUMMY-SERVICE",
                "name": "Dummy Service Corporation",
                "status": "ACTIVE",
            },
            {
                "_key": "DUMMY-INACTIVE",
                "code": "DUMMY-INACTIVE",
                "name": "Dummy Inactive Tenant",
                "status": "INACTIVE",
            },
            {
                "_key": "DUMMY-DELETE",
                "code": "DUMMY-DELETE",
                "name": "Dummy Tenant for Delete Test",
                "status": "ACTIVE",
            },
        ]

        report = client.seed_resource(
            stage_name="stage_1.tenants",
            state_path=("created_records",),
            endpoint=endpoint,
            items=items,
            match_fields=("code",),
            patch_payload={"name": "Dummy Holding Indonesia Updated"},
            delete_key="DUMMY-DELETE",
            search_term="Manufacturing",
        )

        negative = client.run_tenant_negative_tests(endpoint)
        report["negative_tests"] = negative
        report["success"] = bool(report["success"]) and all(
            value == "PASS" for value in negative.values()
        )
        client.state_mapping(("reports",))["stage_1.tenants"] = report
        client.save_state()

        print("\n" + "=" * 68)
        print("HASIL SEEDING TAHAP 1 — CORE TENANT")
        print("=" * 68)
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return bool(report["success"])

    except SeederError as exc:
        print(f"\n[STAGE 1 FAILED] {exc}")
        return False


if __name__ == "__main__":
    raise SystemExit(0 if run_stage() else 1)

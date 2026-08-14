from __future__ import annotations

import json
import sys
from datetime import datetime

from seeder_common import SeederError, build_client, configure_logging
from seed_tenant import run_stage as run_stage_1
from seed_iam_core import run_stage as run_stage_2
from seed_master_data import run_stage as run_stage_3
from seed_crm_sales import run_stage as run_stage_4
from seed_procurement_inventory import run_stage as run_stage_5
from seed_project_manufacturing import run_stage as run_stage_6
from seed_finance_assets import run_stage as run_stage_7


STAGES = [
    ("Stage 1 — Tenant", run_stage_1),
    ("Stage 2 — Core & IAM", run_stage_2),
    ("Stage 3 — Master Data", run_stage_3),
    ("Stage 4 — CRM & Sales", run_stage_4),
    ("Stage 5 — Procurement & Inventory", run_stage_5),
    ("Stage 6 — Project & Manufacturing", run_stage_6),
    ("Stage 7 — Assets", run_stage_7),
]


def main() -> int:
    configure_logging()
    client = build_client()

    try:
        client.bootstrap()
    except SeederError as exc:
        print(f"[BOOTSTRAP FAILED] {exc}")
        return 1

    summary = {
        "started_at": datetime.now().isoformat(),
        "stages": [],
        "success": True,
    }

    for label, runner in STAGES:
        print("\n" + "#" * 76)
        print(label)
        print("#" * 76)

        success = bool(runner(client))
        summary["stages"].append(
            {
                "name": label,
                "success": success,
            }
        )

        if not success:
            summary["success"] = False
            print(
                "\nProses dihentikan agar stage berikutnya tidak memakai "
                "dependency yang gagal."
            )
            break

    summary["finished_at"] = datetime.now().isoformat()

    print("\n" + "=" * 76)
    print("RINGKASAN SELURUH SEEDING")
    print("=" * 76)
    print(json.dumps(summary, ensure_ascii=False, indent=2))

    return 0 if summary["success"] else 1


if __name__ == "__main__":
    raise SystemExit(main())

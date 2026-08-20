"""
Default Project Monitoring Strategy.
Standard ERP fallback strategy for tenants/companies without custom weekly flow.
"""
from __future__ import annotations

from decimal import Decimal
from typing import Any
from django.utils import timezone

from apps.projects.weekly_monitoring.base import BaseProjectMonitoringStrategy

ZERO = Decimal("0")


class DefaultProjectMonitoringStrategy(BaseProjectMonitoringStrategy):
    TENANT_CODE = "default"

    def calculate_progress(self, project: Any) -> dict:
        from apps.projects.models import Task

        tasks = list(Task.objects.filter(project=project))
        if not tasks:
            return {
                "progress_percent": Decimal(str(project.progress_percent or ZERO)),
                "total_tasks": 0,
                "completed_tasks": 0,
                "weight_total": "0",
            }

        completed = sum(1 for t in tasks if str(t.status).upper() in {"DONE", "COMPLETED"})
        explicit = sum((Decimal(str(task.weight_percent or ZERO)) for task in tasks), ZERO)

        if explicit > ZERO:
            weighted = sum(
                (Decimal(str(task.weight_percent or ZERO)) * Decimal(str(task.progress_percent or ZERO)) / Decimal("100"))
                for task in tasks
            )
            denominator = explicit
            progress = min(Decimal("100"), weighted * Decimal("100") / denominator)
        else:
            fallback = Decimal("100") / Decimal(len(tasks))
            weighted = sum(
                (fallback * Decimal(str(task.progress_percent or (100 if str(task.status).upper() in {"DONE", "COMPLETED"} else 0))) / Decimal("100"))
                for task in tasks
            )
            progress = min(Decimal("100"), weighted)

        return {
            "progress_percent": round(progress, 2),
            "total_tasks": len(tasks),
            "completed_tasks": completed,
            "weight_total": str(explicit or Decimal("100")),
        }

    def get_monitoring_summary(self, project: Any, user: Any = None) -> dict:
        progress_info = self.calculate_progress(project)
        progress_val = progress_info["progress_percent"]

        status = "ON_TRACK"
        if progress_val >= Decimal("100"):
            status = "COMPLETED"

        return {
            "tenant_code": self.TENANT_CODE,
            "has_weekly_monitoring": False,
            "project_id": str(project.id),
            "project_code": project.project_code,
            "project_name": project.project_name,
            "current_progress": str(progress_val),
            "total_tasks": progress_info["total_tasks"],
            "completed_tasks": progress_info["completed_tasks"],
            "monitoring_status": status,
            "history": [],
        }

    def record_weekly_snapshot(self, project: Any, user: Any, data: dict) -> dict:
        from apps.projects.models import ProgressSnapshot

        calc = self.calculate_progress(project)
        actual = calc["progress_percent"]
        planned = Decimal(str(data.get("planned_progress_percent", actual)))

        snap = ProgressSnapshot.objects.create(
            project=project,
            snapshot_at=timezone.now(),
            planned_progress_percent=planned,
            actual_progress_percent=actual,
            progress_status="COMPLETED" if actual >= 100 else ("ON_TRACK" if actual >= planned else "BEHIND"),
        )
        project.progress_percent = actual
        project.save(update_fields=["progress_percent"])
        return {
            "success": True,
            "project_id": str(project.id),
            "actual_progress_percent": str(actual),
            "snapshot_id": str(snap.id),
        }

"""
Arsalynk Weekly Project Monitoring & Progress Tracking Strategy.

Implements multi-week timeline distribution, snapshot management,
target vs actual gap analysis, and historical progress retention.
"""
from __future__ import annotations

import math
from datetime import date, timedelta
from decimal import Decimal
from typing import Any

from django.db import transaction
from django.utils import timezone

from apps.projects.weekly_monitoring.base import BaseProjectMonitoringStrategy

ZERO = Decimal("0")


class ArsalynkWeeklyMonitoringStrategy(BaseProjectMonitoringStrategy):
    TENANT_CODE = "arsalynk"

    def calculate_progress(self, project: Any) -> dict:
        """
        Calculate current actual progress from tasks completion and task weights.
        """
        from apps.projects.models import Task

        tasks = list(Task.objects.filter(project=project))
        if not tasks:
            current_p = Decimal(str(project.progress_percent or ZERO))
            return {
                "progress_percent": round(current_p, 2),
                "total_tasks": 0,
                "completed_tasks": 0,
                "weight_total": "0",
            }

        completed = sum(1 for t in tasks if str(t.status).upper() in {"DONE", "COMPLETED"})
        explicit = sum((Decimal(str(task.weight_percent or ZERO)) for task in tasks), ZERO)

        if explicit > ZERO:
            weighted = sum(
                (Decimal(str(task.weight_percent or ZERO)) * Decimal(str(task.progress_percent if task.progress_percent is not None else (100 if str(task.status).upper() in {"DONE", "COMPLETED"} else 0))) / Decimal("100"))
                for task in tasks
            )
            progress = min(Decimal("100"), weighted * Decimal("100") / explicit)
        else:
            fallback = Decimal("100") / Decimal(len(tasks))
            weighted = sum(
                (fallback * Decimal(str(task.progress_percent if task.progress_percent is not None else (100 if str(task.status).upper() in {"DONE", "COMPLETED"} else 0))) / Decimal("100"))
                for task in tasks
            )
            progress = min(Decimal("100"), weighted)

        return {
            "progress_percent": round(progress, 2),
            "total_tasks": len(tasks),
            "completed_tasks": completed,
            "weight_total": str(explicit or Decimal("100")),
        }

    def _get_project_dates(self, project: Any) -> tuple[date, date]:
        """Resolve start and end date for weekly schedule generation."""
        today = timezone.localdate()
        start = project.planned_start_date or project.actual_start_date
        if not start:
            if hasattr(project, "created_at") and project.created_at:
                start = project.created_at.date()
            else:
                start = today

        end = project.planned_end_date or project.actual_end_date
        if not end or end <= start:
            end = start + timedelta(days=28)  # default 4 weeks

        return start, end

    def _ensure_weekly_schedule(self, project: Any) -> list:
        """
        Auto-create or fetch all ProjectWeeklyProgress records for project timeline.
        """
        from apps.projects.models import ProjectWeeklyProgress

        start_date, end_date = self._get_project_dates(project)
        total_days = max(1, (end_date - start_date).days + 1)
        total_weeks = max(1, math.ceil(total_days / 7))

        existing = {
            wp.week_number: wp
            for wp in ProjectWeeklyProgress.objects.filter(project=project)
        }

        records = []
        for w in range(1, total_weeks + 1):
            w_start = start_date + timedelta(days=(w - 1) * 7)
            w_end = min(end_date, w_start + timedelta(days=6))
            target_pct = min(Decimal("100.00"), Decimal(str(round((w / total_weeks) * 100, 2))))

            if w in existing:
                wp = existing[w]
                # Update dates if project timeline shifted
                changed = False
                if wp.start_date != w_start or wp.end_date != w_end:
                    wp.start_date = w_start
                    wp.end_date = w_end
                    changed = True
                if not wp.is_locked and wp.target_progress == ZERO and target_pct > ZERO:
                    wp.target_progress = target_pct
                    changed = True
                if changed:
                    wp.save(update_fields=["start_date", "end_date", "target_progress"])
                records.append(wp)
            else:
                wp = ProjectWeeklyProgress.objects.create(
                    project=project,
                    week_number=w,
                    start_date=w_start,
                    end_date=w_end,
                    target_progress=target_pct,
                    actual_progress=ZERO,
                    previous_progress=ZERO,
                    progress_difference=ZERO,
                    gap_to_target=-target_pct,
                    status="PLANNED",
                )
                records.append(wp)

        return sorted(records, key=lambda x: x.week_number)

    def _determine_current_week(self, weekly_records: list) -> tuple[int, Any]:
        """Find the active week record based on current date."""
        today = timezone.localdate()
        if not weekly_records:
            return 1, None

        for wp in weekly_records:
            if wp.start_date <= today <= wp.end_date:
                return wp.week_number, wp

        if today < weekly_records[0].start_date:
            return 1, weekly_records[0]

        # past all weeks -> return last week
        return weekly_records[-1].week_number, weekly_records[-1]

    def _evaluate_status(self, actual: Decimal, target: Decimal, is_past_deadline: bool = False) -> str:
        """
        Calculate monitoring status from actual progress vs weekly target.
        """
        if actual >= Decimal("100"):
            return "COMPLETED"
        if is_past_deadline and actual < Decimal("100"):
            return "BEHIND"

        gap = actual - target
        if gap >= ZERO:
            return "ON_TRACK"
        if gap >= Decimal("-10.00"):
            return "AT_RISK"
        return "BEHIND"

    @transaction.atomic
    def get_monitoring_summary(self, project: Any, user: Any = None) -> dict:
        """
        Fetch full weekly monitoring summary and update current week stats.
        """
        calc = self.calculate_progress(project)
        current_actual = calc["progress_percent"]

        weekly_records = self._ensure_weekly_schedule(project)
        curr_week_num, curr_wp = self._determine_current_week(weekly_records)

        today = timezone.localdate()
        start_date, end_date = self._get_project_dates(project)
        is_past_deadline = today > end_date

        # Update previous progress for each week
        prev_actual = ZERO
        for wp in weekly_records:
            if wp.week_number < curr_week_num:
                # Lock past weeks if not locked
                if not wp.is_locked:
                    wp.is_locked = True
                    wp.save(update_fields=["is_locked"])
                prev_actual = wp.actual_progress
            elif wp.week_number == curr_week_num:
                wp.previous_progress = prev_actual
                wp.actual_progress = current_actual
                wp.progress_difference = current_actual - prev_actual
                wp.gap_to_target = current_actual - wp.target_progress
                wp.status = self._evaluate_status(current_actual, wp.target_progress, is_past_deadline)
                wp.save(update_fields=[
                    "previous_progress", "actual_progress",
                    "progress_difference", "gap_to_target", "status",
                ])
                prev_actual = current_actual

        # Sync back to project.progress_percent
        if project.progress_percent != current_actual:
            project.progress_percent = current_actual
            project.save(update_fields=["progress_percent"])

        # Prepare summary fields
        active_wp = next((w for w in weekly_records if w.week_number == curr_week_num), weekly_records[0])
        weekly_diff = active_wp.progress_difference
        diff_str = f"+{weekly_diff:.2f}%" if weekly_diff > ZERO else f"{weekly_diff:.2f}%"

        history_payload = []
        for wp in weekly_records:
            history_payload.append({
                "id": str(wp.id),
                "week_number": wp.week_number,
                "label": f"Week {wp.week_number}",
                "start_date": wp.start_date.isoformat(),
                "end_date": wp.end_date.isoformat(),
                "target_progress": str(wp.target_progress),
                "actual_progress": str(wp.actual_progress),
                "previous_progress": str(wp.previous_progress),
                "progress_difference": str(wp.progress_difference),
                "gap_to_target": str(wp.gap_to_target),
                "status": wp.status,
                "notes": wp.notes,
                "issues": wp.issues,
                "achievements": wp.achievements,
                "next_week_plan": wp.next_week_plan,
                "is_current": wp.week_number == curr_week_num,
                "is_locked": wp.is_locked,
            })

        return {
            "tenant_code": self.TENANT_CODE,
            "has_weekly_monitoring": True,
            "project_id": str(project.id),
            "project_code": project.project_code,
            "project_name": project.project_name,
            "current_week": {
                "week_number": curr_week_num,
                "start_date": active_wp.start_date.isoformat(),
                "end_date": active_wp.end_date.isoformat(),
            },
            "current_progress": str(current_actual),
            "target_this_week": str(active_wp.target_progress),
            "previous_week_progress": str(active_wp.previous_progress),
            "weekly_improvement": diff_str,
            "gap_to_target": str(active_wp.gap_to_target),
            "monitoring_status": active_wp.status,
            "total_weeks": len(weekly_records),
            "total_tasks": calc["total_tasks"],
            "completed_tasks": calc["completed_tasks"],
            "history": history_payload,
        }

    @transaction.atomic
    def record_weekly_snapshot(self, project: Any, user: Any, data: dict) -> dict:
        """
        Record / update PM review notes and optional target adjustments for current or specified week.
        """
        weekly_records = self._ensure_weekly_schedule(project)
        curr_week_num, _ = self._determine_current_week(weekly_records)

        target_week = int(data.get("week_number", curr_week_num))
        wp = next((w for w in weekly_records if w.week_number == target_week), None)
        if not wp:
            raise ValueError(f"Week {target_week} does not exist for project {project.project_code}")

        calc = self.calculate_progress(project)
        current_actual = calc["progress_percent"]

        if "target_progress" in data and data["target_progress"] is not None:
            wp.target_progress = Decimal(str(data["target_progress"]))
        if "notes" in data:
            wp.notes = str(data["notes"])
        if "issues" in data:
            wp.issues = str(data["issues"])
        if "achievements" in data:
            wp.achievements = str(data["achievements"])
        if "next_week_plan" in data:
            wp.next_week_plan = str(data["next_week_plan"])

        wp.actual_progress = current_actual
        wp.gap_to_target = current_actual - wp.target_progress
        start_date, end_date = self._get_project_dates(project)
        wp.status = self._evaluate_status(current_actual, wp.target_progress, timezone.localdate() > end_date)
        wp.recorded_by = user
        wp.save()

        return {
            "success": True,
            "message": f"Weekly review for Week {wp.week_number} recorded successfully.",
            "week_number": wp.week_number,
            "actual_progress": str(wp.actual_progress),
            "target_progress": str(wp.target_progress),
            "status": wp.status,
        }

"""
Business services for Hierarchical Project & Task Management.
Handles bottom-up rollup progress calculations, status mapping,
ownership validations, and task transfer request workflows.
"""

from decimal import Decimal
from django.db import models, transaction
from django.utils import timezone
from apps.projects.models import (
    Project,
    ProjectMainTask,
    ProjectWeeklyTask,
    ProjectDailyTask,
    TaskAssignment,
    TaskTransferRequest,
    TaskActivityLog,
)


def log_task_activity(
    project,
    actor,
    task_level,
    task_id,
    task_title,
    action,
    field_name="",
    old_value="",
    new_value="",
    reason="",
):
    """
    Utility to record an audit log for project & task modifications.
    """
    return TaskActivityLog.objects.create(
        project=project,
        actor=actor,
        task_level=task_level,
        task_id=task_id,
        task_title=task_title or "",
        action=action,
        field_name=field_name or "",
        old_value=str(old_value) if old_value is not None else "",
        new_value=str(new_value) if new_value is not None else "",
        reason=reason or "",
    )


def recalculate_task_tree(daily_task=None, weekly_task=None, main_task=None, project=None):
    """
    Hierarchical bottom-up rollup engine:
    Daily Tasks (avg) -> Weekly Task (avg) -> Main Task (weighted) -> Overall Project Progress.
    """
    if daily_task is not None:
        weekly_task = daily_task.weekly_task

    if weekly_task is not None:
        daily_qs = weekly_task.daily_tasks.all()
        if not weekly_task.is_progress_overridden:
            if daily_qs.exists():
                avg = daily_qs.aggregate(models.Avg("progress"))["progress__avg"] or 0
                weekly_task.progress = round(Decimal(str(avg)), 2)
            else:
                weekly_task.progress = Decimal("0.00")

            # Status derivation
            if daily_qs.filter(models.Q(is_blocked=True) | models.Q(status="BLOCKED")).exists():
                weekly_task.status = "BLOCKED"
            elif daily_qs.exists() and not daily_qs.exclude(status="COMPLETED").exists():
                weekly_task.status = "COMPLETED"
            elif daily_qs.filter(status__in=["IN_PROGRESS", "REVIEW"]).exists():
                weekly_task.status = "IN_PROGRESS"
            elif not daily_qs.exists():
                weekly_task.status = "PLANNED"

            weekly_task.save(update_fields=["progress", "status", "updated_at"])

        main_task = weekly_task.main_task

    if main_task is not None:
        weekly_qs = main_task.weekly_tasks.all()
        if not main_task.is_progress_overridden:
            if weekly_qs.exists():
                avg = weekly_qs.aggregate(models.Avg("progress"))["progress__avg"] or 0
                main_task.progress = round(Decimal(str(avg)), 2)
            else:
                main_task.progress = Decimal("0.00")

            # Status derivation
            if weekly_qs.filter(status="BLOCKED").exists():
                main_task.status = "BLOCKED"
            elif weekly_qs.exists() and not weekly_qs.exclude(status="COMPLETED").exists():
                main_task.status = "COMPLETED"
            elif weekly_qs.filter(status="IN_PROGRESS").exists():
                main_task.status = "IN_PROGRESS"

            main_task.save(update_fields=["progress", "status", "updated_at"])

        project = main_task.project

    if project is not None:
        main_tasks = project.main_tasks.all()
        total_weight = sum([Decimal(str(m.weight or 1.0)) for m in main_tasks])
        if total_weight > 0 and main_tasks.exists():
            weighted_sum = sum(
                [Decimal(str(m.progress or 0)) * Decimal(str(m.weight or 1.0)) for m in main_tasks]
            )
            overall = round(weighted_sum / total_weight, 2)
        else:
            overall = Decimal("0.00")

        project.progress_percent = overall
        project.save(update_fields=["progress_percent"])
        return overall

    return Decimal("0.00")


@transaction.atomic
def process_transfer_approval(transfer_request, approved: bool, pm_user, review_note=""):
    """
    Handles PM approval/rejection of a task transfer request.
    """
    daily_task = transfer_request.daily_task
    project = daily_task.weekly_task.main_task.project

    if approved:
        transfer_request.status = "APPROVED"
        transfer_request.reviewed_by = pm_user
        transfer_request.reviewed_at = timezone.now()
        transfer_request.review_note = review_note
        transfer_request.save(update_fields=["status", "reviewed_by", "reviewed_at", "review_note"])

        old_owner = daily_task.owner
        daily_task.owner = transfer_request.target_user
        daily_task.save(update_fields=["owner", "updated_at"])

        log_task_activity(
            project=project,
            actor=pm_user,
            task_level="DAILY",
            task_id=daily_task.id,
            task_title=daily_task.title,
            action="TRANSFER_APPROVED",
            field_name="owner",
            old_value=str(old_owner),
            new_value=str(transfer_request.target_user),
            reason=f"Transfer approved. Note: {review_note}. Transfer Reason: {transfer_request.reason}",
        )
    else:
        transfer_request.status = "REJECTED"
        transfer_request.reviewed_by = pm_user
        transfer_request.reviewed_at = timezone.now()
        transfer_request.review_note = review_note
        transfer_request.save(update_fields=["status", "reviewed_by", "reviewed_at", "review_note"])

        log_task_activity(
            project=project,
            actor=pm_user,
            task_level="DAILY",
            task_id=daily_task.id,
            task_title=daily_task.title,
            action="TRANSFER_REJECTED",
            field_name="status",
            old_value="PENDING",
            new_value="REJECTED",
            reason=review_note,
        )

    return transfer_request


@transaction.atomic
def direct_reassign_task(daily_task, new_owner, pm_user, reason=""):
    """
    Direct reassignment by PM bypassing the transfer request flow.
    """
    project = daily_task.weekly_task.main_task.project
    old_owner = daily_task.owner
    daily_task.owner = new_owner
    daily_task.save(update_fields=["owner", "updated_at"])

    log_task_activity(
        project=project,
        actor=pm_user,
        task_level="DAILY",
        task_id=daily_task.id,
        task_title=daily_task.title,
        action="DIRECT_REASSIGNED",
        field_name="owner",
        old_value=str(old_owner),
        new_value=str(new_owner),
        reason=reason,
    )
    return daily_task


@transaction.atomic
def override_task_progress(task_instance, new_progress, pm_user, reason=""):
    """
    PM manual progress override on Main Task or Weekly Task level with mandatory audit reason.
    """
    old_progress = task_instance.progress
    task_instance.progress = Decimal(str(new_progress))
    task_instance.is_progress_overridden = True
    task_instance.override_reason = reason
    task_instance.save(update_fields=["progress", "is_progress_overridden", "override_reason", "updated_at"])

    if isinstance(task_instance, ProjectMainTask):
        project = task_instance.project
        task_level = "MAIN"
        recalculate_task_tree(main_task=task_instance)
    elif isinstance(task_instance, ProjectWeeklyTask):
        project = task_instance.main_task.project
        task_level = "WEEKLY"
        recalculate_task_tree(weekly_task=task_instance)
    else:
        project = None
        task_level = "TASK"

    if project:
        log_task_activity(
            project=project,
            actor=pm_user,
            task_level=task_level,
            task_id=task_instance.id,
            task_title=getattr(task_instance, "name", str(task_instance)),
            action="PROGRESS_OVERRIDDEN",
            field_name="progress",
            old_value=str(old_progress),
            new_value=str(new_progress),
            reason=reason,
        )

    return task_instance

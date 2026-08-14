from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from apps.core.models import Notification
from apps.accounts.models import UserRole
from apps.master_data.models import Machine, WorkCenter
from apps.projects.models import Member, Project, ProjectDispatch
from apps.projects.workflow_services import ensure_project_start_handoffs, ensure_shortage_procurement
from config.commands import project_flow_data


class Command(BaseCommand):
    help = "Backfill legacy project data for the cross-module workflow. Safe to run repeatedly."

    @transaction.atomic
    def handle(self, *args, **options):
        counters = {
            "manager_repaired": 0,
            "membership_created": 0,
            "procurement_ready": 0,
            "production_ready": 0,
            "dispatch_ready": 0,
            "machines_ready": 0,
        }

        for project in Project.objects.select_related("document", "company", "tenant"):
            manager = project.project_manager
            if manager is None and project.document_id and project.document.created_by_id:
                manager = project.document.created_by
            if manager is None:
                assignment = UserRole.objects.filter(
                    company=project.company,
                    role__role_code__in=["PROJECT_MANAGEMENT", "PROJECT_MANAGER"],
                ).select_related("user").first()
                manager = assignment.user if assignment else None
            if manager is not None and project.project_manager_id is None:
                project.project_manager = manager
                project.save(update_fields=["project_manager"])
                counters["manager_repaired"] += 1
            if manager:
                _, created = Member.objects.get_or_create(
                    project=project,
                    user=manager,
                    defaults={"project_role": "PROJECT_MANAGER", "status": "ACTIVE", "assigned_at": timezone.now()},
                )
                counters["membership_created"] += int(created)

            flow = project_flow_data(project)
            if flow["shortages"] and manager:
                ensure_shortage_procurement(project, flow["shortages"], manager)
                counters["procurement_ready"] += 1

            started = (project.lifecycle_status or project.status) in {"IN_PROGRESS", "QA_REVIEW", "COMPLETED", "CLOSED"}
            if started and manager:
                orders = ensure_project_start_handoffs(project, manager)
                counters["production_ready"] += len(orders)
                for target, title in [
                    ("FINANCE", "Project dimulai: kontrol biaya"),
                    ("WAREHOUSE", "Project dimulai: material reserved"),
                    ("PRODUCTION", "Project dimulai: production instruction"),
                ]:
                    _, created = ProjectDispatch.objects.update_or_create(
                        project=project,
                        target_department=target,
                        dispatch_type="PROJECT_START_REPORT" if target == "FINANCE" else "PROJECT_START_INSTRUCTION",
                        defaults={
                            "subject": title,
                            "payload_json": {"project_code": project.project_code, "backfilled": True},
                            "status": "SENT",
                            "sent_by": manager,
                        },
                    )
                    counters["dispatch_ready"] += int(created)
                    Notification.objects.get_or_create(
                        source_document=project.document,
                        notification_type=f"PROJECT_START_{target}",
                        defaults={
                            "tenant": project.tenant,
                            "company": project.company,
                            "title": title,
                            "message": f"{project.project_code} - {project.project_name}",
                            "action_url": "/api/v1/projects/projects/",
                            "priority": "HIGH",
                            "created_at": timezone.now(),
                        },
                    )

        for company_id in Project.objects.exclude(company__isnull=True).values_list("company_id", flat=True).distinct():
            center, _ = WorkCenter.objects.get_or_create(
                company_id=company_id,
                work_center_code="WF-BACKUP",
                defaults={"work_center_name": "Workflow Backup Center", "status": "ACTIVE"},
            )
            _, created = Machine.objects.get_or_create(
                company_id=company_id,
                machine_code="MACHINE-BACKUP",
                defaults={"machine_name": "Workflow Backup Machine", "work_center": center, "status": "ACTIVE"},
            )
            counters["machines_ready"] += int(created)

        self.stdout.write(self.style.SUCCESS("Project workflow backfill selesai."))
        for key, value in counters.items():
            self.stdout.write(f"{key}={value}")

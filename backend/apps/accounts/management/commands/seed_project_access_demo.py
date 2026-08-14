from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from apps.accounts.models import Role, UserRole
from apps.core.models import Company, Tenant
from apps.finance.models import ProjectFunding
from apps.master_data.models import Currency
from apps.projects.models import Member, Project, Task


User = get_user_model()
DEMO_PASSWORD = "DemoERP2026!"
USERS = (
    ("demo.executive", "executive.demo@erp.local", "Executive Demo", "EXECUTIVE"),
    ("demo.project_manager", "project.manager.demo@erp.local", "Project Manager Demo", "PROJECT_MANAGEMENT"),
    ("demo.finance", "finance.demo@erp.local", "Finance Demo", "ACCOUNTING_FINANCE"),
    ("demo.assignee", "assignee.demo@erp.local", "Project Assignee Demo", "PROJECT_ASSIGNEE"),
)


class Command(BaseCommand):
    help = "Seed user dan workflow demo funding-project-task yang idempotent."

    def add_arguments(self, parser):
        parser.add_argument("--tenant-code", default="DUMMY-HOLDING")
        parser.add_argument("--company-code", default="COMP-HOLDING")

    @transaction.atomic
    def handle(self, *args, **options):
        try:
            tenant = Tenant.objects.get(code=options["tenant_code"])
            company = Company.objects.get(tenant=tenant, company_code=options["company_code"])
        except (Tenant.DoesNotExist, Company.DoesNotExist) as exc:
            raise CommandError("Tenant atau company demo tidak ditemukan.") from exc

        created_users = {}
        for username, email, full_name, role_code in USERS:
            role, _ = Role.objects.update_or_create(
                tenant=tenant,
                role_code=role_code,
                defaults={"role_name": role_code.replace("_", " ").title()},
            )
            user, _ = User.objects.update_or_create(
                username=username,
                defaults={
                    "email": email,
                    "full_name": full_name,
                    "tenant": tenant,
                    "status": "ACTIVE",
                    "is_active": True,
                    "is_staff": role_code == "EXECUTIVE",
                    "is_superuser": role_code == "EXECUTIVE",
                },
            )
            user.set_password(DEMO_PASSWORD)
            user.save()
            UserRole.objects.update_or_create(
                user=user, role=role, company=company,
                defaults={"organization": None},
            )
            created_users[role_code] = user

        pm = created_users["PROJECT_MANAGEMENT"]
        finance = created_users["ACCOUNTING_FINANCE"]
        assignee = created_users["PROJECT_ASSIGNEE"]
        currency = company.base_currency or Currency.objects.filter(currency_code="IDR").first()
        funding, _ = ProjectFunding.objects.update_or_create(
            tenant=tenant,
            company=company,
            requested_by=pm,
            purpose="Pengembangan ERP Project Alpha",
            defaults={
                "currency": currency,
                "funding_type": "INTERNAL",
                "requested_amount": Decimal("100000000"),
                "approved_limit": Decimal("90000000"),
                "status": "ACTIVE",
                "submitted_at": timezone.now(),
                "verified_by": finance,
                "verified_at": timezone.now(),
                "approved_by": finance,
                "approved_at": timezone.now(),
                "review_note": "Approved untuk eksperimen role dan project workflow.",
            },
        )
        project, _ = Project.objects.update_or_create(
            tenant=tenant,
            company=company,
            project_code="DEMO-ALPHA",
            defaults={
                "project_name": "Demo Project Alpha",
                "description": funding.purpose,
                "project_manager": pm,
                "manager_name": pm.full_name,
                "budget_amount": funding.approved_limit,
                "progress_percent": Decimal("25"),
                "status": "IN_PROGRESS",
                "lifecycle_status": "IN_PROGRESS",
                "source_type": "FUNDING_REQUEST",
            },
        )
        if funding.project_id != project.id:
            funding.project = project
            funding.save(update_fields=["project"])

        for user, project_role in ((pm, "PROJECT_MANAGER"), (assignee, "MEMBER")):
            Member.objects.update_or_create(
                project=project, user=user,
                defaults={
                    "project_role": project_role,
                    "status": "ACTIVE",
                    "assigned_at": timezone.now(),
                    "joined_at": timezone.localdate(),
                },
            )
        Task.objects.update_or_create(
            project=project,
            task_code="DEMO-TASK-001",
            defaults={
                "task_name": "Implementasi halaman Project Alpha",
                "description": "Task contoh untuk pengujian akses assignee.",
                "priority": "HIGH",
                "assigned_to": assignee,
                "created_by": pm,
                "updated_by": pm,
                "progress_percent": Decimal("25"),
                "weight_percent": Decimal("100"),
                "status": "IN_PROGRESS",
            },
        )

        self.stdout.write(self.style.SUCCESS(f"Tenant: {tenant.code}; Company: {company.company_code}"))
        self.stdout.write(self.style.SUCCESS(f"Password seluruh demo user: {DEMO_PASSWORD}"))
        for username, email, _, role_code in USERS:
            self.stdout.write(f"{role_code}: {username} / {email}")
        self.stdout.write(self.style.SUCCESS(f"Project: {project.project_code}; Funding: {funding.id}"))

from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from apps.core.models import Company, Tenant
from apps.projects.models import Project, Member
from apps.accounts.models import Role, UserRole

User = get_user_model()


class Command(BaseCommand):
    help = "Seed akses lengkap untuk PM Demo dan PM Arsalynk ke semua Project dan Main Tasks"

    def handle(self, *args, **options):
        tenant = Tenant.objects.first()
        if not tenant:
            tenant = Tenant.objects.create(name="Arsalynk ERP Tenant", code="TENANT-ARSALYNK", status="ACTIVE")

        company = (
            Company.objects.filter(company_code__in=["ARSLN", "arsalynk", "COMP-ARSALYNK", "COMP-DEMO", "arsalyn", "MAIN"]).first()
            or Company.objects.first()
        )
        if not company:
            company = Company.objects.create(
                tenant=tenant,
                company_code="COMP-ARSALYNK",
                legal_name="PT Arsalynk Teknologi Utama",
                status="ACTIVE",
            )

        pm_role, _ = Role.objects.get_or_create(
            role_code="PROJECT_MANAGER",
            defaults={"role_name": "Project Manager", "description": "Full access to projects and tasks", "tenant": tenant}
        )

        # Daftar user PM yang akan disinkronkan
        pm_usernames = [
            ("pm_user", "pm.user@arsalynk.id", "PM User"),
            ("pm_arsalynk", "pm@arsalynk.id", "Project Manager Arsalynk"),
            ("pm", "pm@arsalynk.id", "Project Manager Arsalynk"),
            ("pm_demo", "project.manager.demo@erp.local", "Project Manager Demo"),
        ]

        synced_users = []
        for username, default_email, full_name in pm_usernames:
            user = User.objects.filter(username=username).first() or User.objects.filter(email=default_email).first()
            if not user:
                user = User.objects.create_user(
                    email=default_email,
                    username=username,
                    password="password123",
                    full_name=full_name,
                    tenant=tenant,
                )
            else:
                if not user.username:
                    user.username = username
                if not user.full_name:
                    user.full_name = full_name
                if tenant and not user.tenant:
                    user.tenant = tenant
                user.is_active = True
                user.status = "ACTIVE"
                user.save()

            UserRole.objects.get_or_create(user=user, role=pm_role, company=company)
            synced_users.append(user)

        # Daftarkan ke seluruh project yang ada
        projects = Project.objects.all()
        for proj in projects:
            if not proj.company:
                proj.company = company
            if not proj.tenant and tenant:
                proj.tenant = tenant
            if not proj.project_manager and synced_users:
                proj.project_manager = synced_users[0]
            proj.save()

            for u in synced_users:
                Member.objects.get_or_create(
                    project=proj,
                    user=u,
                    defaults={"project_role": "PROJECT_MANAGER", "status": "ACTIVE"}
                )

        for u in synced_users:
            self.stdout.write(self.style.SUCCESS(f"Akses PM untuk '{u.username}' berhasil disinkronkan ke {projects.count()} project."))

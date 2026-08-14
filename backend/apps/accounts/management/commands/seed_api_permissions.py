from django.apps import apps
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.accounts.models import Permission, Role, RolePermission
from apps.core.models import Tenant


ACTIONS = ("view", "create", "update", "delete", "export", "approve", "post")
ROLE_MODULES = {
    "EXECUTIVE": "*",
    "PROJECT_MANAGEMENT": {"core", "master_data", "projects", "sales", "inventory", "procurement", "analytics", "reporting"},
    "ACCOUNTING_FINANCE": {"core", "master_data", "finance", "projects", "procurement", "inventory", "analytics", "reporting"},
    "CRM": {"core", "master_data", "crm", "sales", "projects", "analytics", "reporting"},
    "PROJECT_MANAGEMENT_TECHNICAL": {"core", "master_data", "projects", "inventory", "manufacturing", "quality", "assets", "analytics", "reporting"},
    "PROJECT_ASSIGNEE": {"core", "projects", "reporting"},
}
LOCAL_APPS = {
    "core", "accounts", "master_data", "crm", "sales", "projects", "procurement", "inventory",
    "manufacturing", "quality", "finance", "assets", "service", "analytics", "logistics",
    "implementation", "reporting",
}


class Command(BaseCommand):
    help = "Seed permission API untuk seluruh model ERP dan hubungkan ke role dasar."

    def add_arguments(self, parser):
        parser.add_argument("--tenant-code", required=True)

    @transaction.atomic
    def handle(self, *args, **options):
        try:
            tenant = Tenant.objects.get(code=options["tenant_code"])
        except Tenant.DoesNotExist as exc:
            raise CommandError("Tenant tidak ditemukan.") from exc

        roles = {role.role_code: role for role in Role.objects.filter(tenant=tenant)}
        missing = set(ROLE_MODULES) - set(roles)
        if missing:
            raise CommandError(f"Role belum tersedia: {', '.join(sorted(missing))}. Jalankan seed_erp_roles dahulu.")

        permission_count = 0
        assignment_count = 0
        for model in apps.get_models():
            app_label = model._meta.app_label
            if app_label not in LOCAL_APPS:
                continue
            resource = model._meta.model_name
            for action in ACTIONS:
                code = f"{app_label}.{resource}.{action}"
                permission, _ = Permission.objects.update_or_create(
                    permission_code=code,
                    defaults={
                        "module_code": app_label,
                        "resource_name": resource,
                        "action_name": action,
                    },
                )
                permission_count += 1
                for role_code, modules in ROLE_MODULES.items():
                    allowed = modules == "*" or app_label in modules
                    _, created = RolePermission.objects.update_or_create(
                        role=roles[role_code],
                        permission=permission,
                        defaults={"allowed": allowed},
                    )
                    assignment_count += int(created)

        self.stdout.write(self.style.SUCCESS(f"Permissions processed: {permission_count}"))
        self.stdout.write(self.style.SUCCESS(f"Role assignments created: {assignment_count}"))

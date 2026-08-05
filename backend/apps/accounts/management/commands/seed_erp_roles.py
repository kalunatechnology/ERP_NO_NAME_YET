from django.core.management.base import BaseCommand, CommandError

from apps.accounts.models import Role
from apps.core.models import Tenant


ROLE_SEEDS = [
    ("EXECUTIVE", "Executive", "Akses penuh seluruh modul dan seluruh data."),
    (
        "PROJECT_MANAGEMENT",
        "Project Management",
        "Akses penuh Project Management dan akses terbatas ke Finance/CRM.",
    ),
    (
        "ACCOUNTING_FINANCE",
        "Accounting / Finance",
        "Akses penuh Finance dan akses terbatas ke Project/CRM.",
    ),
    (
        "CRM",
        "CRM",
        "Akses penuh CRM/Sales dan akses terbatas ke status, nilai, serta approval proyek.",
    ),
    (
        "PROJECT_MANAGEMENT_TECHNICAL",
        "Project Management Technical",
        "Akses technical brief, resource, work order, progress, dan QA.",
    ),
]


class Command(BaseCommand):
    help = "Seed role dasar ERP untuk sebuah tenant."

    def add_arguments(self, parser):
        parser.add_argument("--tenant-code", required=True)

    def handle(self, *args, **options):
        try:
            tenant = Tenant.objects.get(code=options["tenant_code"])
        except Tenant.DoesNotExist as exc:
            raise CommandError("Tenant tidak ditemukan.") from exc

        for code, name, description in ROLE_SEEDS:
            role, created = Role.objects.update_or_create(
                tenant=tenant,
                role_code=code,
                defaults={
                    "role_name": name,
                    "description": description,
                },
            )
            state = "created" if created else "updated"
            self.stdout.write(self.style.SUCCESS(f"{code}: {state}"))

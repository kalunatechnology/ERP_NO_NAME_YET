from django.core.management import call_command
from django.core.management.base import BaseCommand
from django.db import transaction

from apps.core.models import Company, Organization, Tenant


class Command(BaseCommand):
    help = "Buat tenant/company awal lalu seed role dan permission API."

    def add_arguments(self, parser):
        parser.add_argument("--tenant-code", default="DEFAULT")
        parser.add_argument("--tenant-name", default="Default Tenant")
        parser.add_argument("--company-code", default="MAIN")
        parser.add_argument("--company-name", default="Main Company")

    @transaction.atomic
    def handle(self, *args, **options):
        tenant, _ = Tenant.objects.update_or_create(
            code=options["tenant_code"],
            defaults={"name": options["tenant_name"], "status": "ACTIVE"},
        )
        company, _ = Company.objects.update_or_create(
            tenant=tenant,
            company_code=options["company_code"],
            defaults={"legal_name": options["company_name"], "status": "ACTIVE"},
        )
        Organization.objects.get_or_create(
            tenant=tenant,
            company=company,
            organization_code="HQ",
            defaults={"organization_name": "Head Office", "organization_type": "HEAD_OFFICE", "status": "ACTIVE"},
        )
        call_command("seed_erp_roles", tenant_code=tenant.code)
        call_command("seed_api_permissions", tenant_code=tenant.code)
        self.stdout.write(self.style.SUCCESS(f"Bootstrap selesai untuk tenant {tenant.code} dan company {company.company_code}."))

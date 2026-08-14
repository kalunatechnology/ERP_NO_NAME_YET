from decimal import Decimal

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from apps.accounts.models import User
from apps.core.models import BusinessDocument, Company
from apps.inventory.models import StockBalance
from apps.master_data.models import Product, Warehouse, WarehouseLocation
from apps.projects.models import Project
from apps.sales.models import Order, OrderLine


class Command(BaseCommand):
    help = "Create an idempotent, company-scoped incoming order and stock baseline for the seven-flow UAT."

    def add_arguments(self, parser):
        parser.add_argument("--company", default="aa1d8ce0-7117-4e7d-8733-6a325f962e0b")

    @transaction.atomic
    def handle(self, *args, **options):
        try:
            company = Company.objects.select_related("tenant", "base_currency").get(pk=options["company"])
        except Company.DoesNotExist as error:
            raise CommandError("Company UAT tidak ditemukan.") from error

        manager = User.objects.filter(email="project.manager.demo@erp.local").first()
        product = Product.objects.filter(product_code="MAT-UAT-001").first()
        warehouse = Warehouse.objects.filter(company=company, warehouse_code="WH-UAT-01").first()
        if not product or not warehouse:
            raise CommandError("Jalankan master-data UAT dahulu: MAT-UAT-001 dan WH-UAT-01 wajib tersedia.")

        location, _ = WarehouseLocation.objects.get_or_create(
            warehouse=warehouse,
            location_code="STOCK-UAT-READY",
            defaults={"location_name": "Stock UAT Ready", "location_type": "STORAGE", "active": True},
        )
        if not location.active:
            location.active = True
            location.save(update_fields=["active"])

        balance = StockBalance.objects.filter(company=company, product=product, warehouse_location=location, lot__isnull=True, serial_number__isnull=True).first()
        if not balance:
            balance = StockBalance.objects.create(
                company=company, product=product, warehouse_location=location,
                on_hand_quantity=Decimal("25"), reserved_quantity=Decimal("0"),
                available_quantity=Decimal("25"), inventory_value=Decimal("25000000"),
            )
        elif (balance.available_quantity or Decimal("0")) < Decimal("10"):
            balance.on_hand_quantity = (balance.reserved_quantity or Decimal("0")) + Decimal("25")
            balance.available_quantity = Decimal("25")
            balance.inventory_value = Decimal("25000000")
            balance.save(update_fields=["on_hand_quantity", "available_quantity", "inventory_value"])

        ready = Order.objects.filter(
            document__company=company,
            document__document_number__startswith="SO-UAT-7FLOW-READY-",
            status__in=["CONFIRMED", "ALLOCATED"],
        ).exclude(projects_project_sales_order_set__isnull=False).select_related("document").first()

        created = False
        if not ready:
            used = set(BusinessDocument.objects.filter(company=company, document_number__startswith="SO-UAT-7FLOW-READY-").values_list("document_number", flat=True))
            sequence = 1
            while f"SO-UAT-7FLOW-READY-{sequence:03d}" in used:
                sequence += 1
            number = f"SO-UAT-7FLOW-READY-{sequence:03d}"
            document = BusinessDocument.objects.create(
                tenant=company.tenant, company=company, document_type="SALES_ORDER",
                document_number=number, status="APPROVED", document_date=timezone.localdate(),
                created_by=manager, created_at=timezone.now(), updated_at=timezone.now(),
            )
            ready = Order.objects.create(
                document=document, currency=company.base_currency, order_date=timezone.localdate(),
                requested_delivery_date=timezone.localdate() + timezone.timedelta(days=30),
                subtotal=Decimal("50000000"), tax_amount=Decimal("5500000"),
                total_amount=Decimal("55500000"), status="CONFIRMED",
            )
            OrderLine.objects.create(
                sales_order=ready, product=product, ordered_quantity=Decimal("5"),
                delivered_quantity=Decimal("0"), invoiced_quantity=Decimal("0"),
                unit_price=Decimal("10000000"), fulfillment_method="PROJECT",
            )
            created = True

        if Project.objects.filter(sales_order=ready).exists():
            raise CommandError("Seed menghasilkan order yang sudah terhubung ke project; jalankan ulang untuk sequence baru.")

        self.stdout.write(self.style.SUCCESS(
            f"UAT ready: order={ready.document.document_number} id={ready.id} status={ready.status} "
            f"product={product.product_code} warehouse={warehouse.warehouse_code} "
            f"location={location.location_code} available={balance.available_quantity} created={created}"
        ))

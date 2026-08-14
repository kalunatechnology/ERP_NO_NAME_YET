import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("finance", "0003_initial"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(model_name="billingdocument", name="verified_by", field=models.ForeignKey(blank=True, db_column="verified_by_id", null=True, on_delete=django.db.models.deletion.PROTECT, related_name="verified_billing_documents", to=settings.AUTH_USER_MODEL)),
        migrations.AddField(model_name="billingdocument", name="verified_at", field=models.DateTimeField(blank=True, null=True)),
        migrations.AddField(model_name="billingdocument", name="approved_by", field=models.ForeignKey(blank=True, db_column="approved_by_id", null=True, on_delete=django.db.models.deletion.PROTECT, related_name="approved_billing_documents", to=settings.AUTH_USER_MODEL)),
        migrations.AddField(model_name="billingdocument", name="approved_at", field=models.DateTimeField(blank=True, null=True)),
        migrations.AddField(model_name="billingdocument", name="rejection_reason", field=models.TextField(blank=True, default="")),
        migrations.AddField(model_name="payment", name="allocation_plan", field=models.JSONField(blank=True, default=list)),
        migrations.AddField(model_name="payment", name="submitted_by", field=models.ForeignKey(blank=True, db_column="submitted_by_id", null=True, on_delete=django.db.models.deletion.PROTECT, related_name="submitted_payments", to=settings.AUTH_USER_MODEL)),
        migrations.AddField(model_name="payment", name="submitted_at", field=models.DateTimeField(blank=True, null=True)),
        migrations.AddField(model_name="payment", name="approved_by", field=models.ForeignKey(blank=True, db_column="approved_by_id", null=True, on_delete=django.db.models.deletion.PROTECT, related_name="approved_payments", to=settings.AUTH_USER_MODEL)),
        migrations.AddField(model_name="payment", name="approved_at", field=models.DateTimeField(blank=True, null=True)),
        migrations.AddField(model_name="payment", name="executed_by", field=models.ForeignKey(blank=True, db_column="executed_by_id", null=True, on_delete=django.db.models.deletion.PROTECT, related_name="executed_payments", to=settings.AUTH_USER_MODEL)),
        migrations.AddField(model_name="payment", name="executed_at", field=models.DateTimeField(blank=True, null=True)),
        migrations.AddField(model_name="payment", name="execution_reference", field=models.CharField(blank=True, default="", max_length=255)),
        migrations.AddField(model_name="payment", name="execution_note", field=models.TextField(blank=True, default="")),
        migrations.AddField(model_name="payment", name="failure_reason", field=models.TextField(blank=True, default="")),
    ]

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0001_initial"),
        ("finance", "0004_payment_workflow"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(model_name="projectfunding", name="tenant", field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name="project_fundings", to="core.tenant")),
        migrations.AddField(model_name="projectfunding", name="company", field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name="project_fundings", to="core.company")),
        migrations.AddField(model_name="projectfunding", name="purpose", field=models.TextField(blank=True, default="")),
        migrations.AddField(model_name="projectfunding", name="requested_amount", field=models.DecimalField(blank=True, decimal_places=6, max_digits=24, null=True)),
        migrations.AddField(model_name="projectfunding", name="requested_by", field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name="requested_project_fundings", to=settings.AUTH_USER_MODEL)),
        migrations.AddField(model_name="projectfunding", name="submitted_at", field=models.DateTimeField(blank=True, null=True)),
        migrations.AddField(model_name="projectfunding", name="verified_by", field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name="verified_project_fundings", to=settings.AUTH_USER_MODEL)),
        migrations.AddField(model_name="projectfunding", name="verified_at", field=models.DateTimeField(blank=True, null=True)),
        migrations.AddField(model_name="projectfunding", name="approved_by", field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name="approved_project_fundings", to=settings.AUTH_USER_MODEL)),
        migrations.AddField(model_name="projectfunding", name="approved_at", field=models.DateTimeField(blank=True, null=True)),
        migrations.AddField(model_name="projectfunding", name="rejected_by", field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name="rejected_project_fundings", to=settings.AUTH_USER_MODEL)),
        migrations.AddField(model_name="projectfunding", name="rejected_at", field=models.DateTimeField(blank=True, null=True)),
        migrations.AddField(model_name="projectfunding", name="review_note", field=models.TextField(blank=True, default="")),
        migrations.AddIndex(model_name="projectfunding", index=models.Index(fields=["status", "project"], name="fin_funding_workflow")),
    ]

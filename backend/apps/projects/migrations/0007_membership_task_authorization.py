from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("projects", "0006_project_customer_name_project_description_and_more")]

    operations = [
        migrations.AddField(model_name="member", name="status", field=models.CharField(blank=True, default="ACTIVE", max_length=32)),
        migrations.AddField(model_name="member", name="permissions_json", field=models.JSONField(blank=True, default=dict)),
        migrations.AddField(model_name="member", name="assigned_at", field=models.DateTimeField(blank=True, null=True)),
        migrations.AddField(model_name="task", name="description", field=models.TextField(blank=True, default="")),
        migrations.AddField(model_name="task", name="priority", field=models.CharField(blank=True, default="MEDIUM", max_length=16)),
        migrations.AddField(model_name="task", name="evidence_json", field=models.JSONField(blank=True, default=list)),
        migrations.AddConstraint(model_name="member", constraint=models.UniqueConstraint(fields=("project", "user"), name="uniq_project_member_user")),
        migrations.AddIndex(model_name="member", index=models.Index(fields=["user", "status"], name="project_member_access")),
    ]

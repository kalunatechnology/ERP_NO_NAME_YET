from django.db import migrations
from django.utils import timezone


def repair_sales_order_project_ownership(apps, schema_editor):
    Project = apps.get_model("projects", "Project")
    Member = apps.get_model("projects", "Member")

    projects = Project.objects.filter(
        source_type="SALES_ORDER",
        project_manager__isnull=True,
        document__created_by__isnull=False,
    ).select_related("document")

    for project in projects.iterator():
        manager_id = project.document.created_by_id
        project.project_manager_id = manager_id
        project.save(update_fields=["project_manager"])
        Member.objects.get_or_create(
            project_id=project.id,
            user_id=manager_id,
            defaults={
                "project_role": "PROJECT_MANAGER",
                "status": "ACTIVE",
                "assigned_at": timezone.now(),
            },
        )


class Migration(migrations.Migration):
    dependencies = [("projects", "0008_changerequest_analyzed_at_changerequest_analyzed_by_and_more")]
    operations = [migrations.RunPython(repair_sales_order_project_ownership, migrations.RunPython.noop)]

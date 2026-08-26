import os
import sys
import json
import inspect
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings.base')
django.setup()

from django.apps import apps
from rest_framework.viewsets import ViewSetMixin
from rest_framework.views import APIView

analysis = {}

for app in apps.get_app_configs():
    if not app.name.startswith('apps.'):
        continue
    app_label = app.label
    analysis[app_label] = {
        "models": {},
        "viewsets": {},
        "views": {},
        "services": []
    }
    
    # Models
    for m in app.get_models():
        fields = []
        for f in m._meta.get_fields():
            fields.append({
                "name": f.name,
                "type": f.get_internal_type() if hasattr(f, 'get_internal_type') else f.__class__.__name__,
                "null": getattr(f, 'null', False),
                "blank": getattr(f, 'blank', False),
                "unique": getattr(f, 'unique', False),
                "default": str(getattr(f, 'default', '')) if getattr(f, 'default', None) is not None else None,
                "is_relation": f.is_relation,
                "related_model": f.related_model._meta.label if f.is_relation and hasattr(f, 'related_model') and f.related_model else None,
                "related_name": getattr(f, 'related_name', None),
            })
        analysis[app_label]["models"][m.__name__] = {
            "table": m._meta.db_table,
            "fields": fields
        }

    # Inspect api/views or views
    app_path = app.path
    api_path = os.path.join(app_path, "api")
    view_files = []
    if os.path.exists(api_path):
        for root, _, files in os.walk(api_path):
            for f in files:
                if f.endswith('.py') and not f.startswith('__'):
                    view_files.append(os.path.join(root, f))
    for f in os.listdir(app_path):
        if (f.startswith('views') or f.startswith('viewsets')) and f.endswith('.py'):
            view_files.append(os.path.join(app_path, f))

    # Services
    srv_path = os.path.join(app_path, "services")
    if os.path.exists(srv_path):
        for root, _, files in os.walk(srv_path):
            for f in files:
                if f.endswith('.py') and not f.startswith('__'):
                    analysis[app_label]["services"].append(os.path.relpath(os.path.join(root, f), app_path))
    if os.path.exists(os.path.join(app_path, "services.py")):
        analysis[app_label]["services"].append("services.py")

with open("backend_detailed_analysis.json", "w", encoding="utf-8") as f:
    json.dump(analysis, f, indent=2)

print("Detailed analysis dumped.")

import os
import sys
import json
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings.base')
django.setup()

from django.apps import apps
from django.urls import get_resolver
from django.db import models
from rest_framework import serializers

def inspect_models():
    model_data = {}
    for app in apps.get_app_configs():
        if not app.name.startswith('apps.'):
            continue
        app_models = list(app.get_models())
        model_data[app.label] = {}
        for m in app_models:
            fields = []
            for f in m._meta.get_fields():
                field_info = {
                    "name": f.name,
                    "type": f.get_internal_type() if hasattr(f, 'get_internal_type') else f.__class__.__name__,
                    "null": getattr(f, 'null', False),
                    "blank": getattr(f, 'blank', False),
                    "unique": getattr(f, 'unique', False),
                    "primary_key": getattr(f, 'primary_key', False),
                    "default": str(getattr(f, 'default', '')) if getattr(f, 'default', models.NOT_PROVIDED) is not models.NOT_PROVIDED else None,
                    "is_relation": f.is_relation,
                    "many_to_one": f.many_to_one,
                    "one_to_one": f.one_to_one,
                    "many_to_many": f.many_to_many,
                    "one_to_many": f.one_to_many,
                }
                if f.is_relation and hasattr(f, 'related_model') and f.related_model:
                    field_info["related_model"] = f.related_model._meta.label
                    field_info["related_name"] = getattr(f, 'related_name', None)
                fields.append(field_info)
            model_data[app.label][m.__name__] = {
                "db_table": m._meta.db_table,
                "fields": fields,
                "unique_together": [list(u) for u in m._meta.unique_together] if m._meta.unique_together else [],
            }
    return model_data

def inspect_urls():
    resolver = get_resolver()
    url_patterns = []

    def extract_patterns(patterns, prefix=""):
        for p in patterns:
            if hasattr(p, 'url_patterns'):
                extract_patterns(p.url_patterns, prefix + str(p.pattern))
            else:
                view_name = ""
                callback_name = ""
                if hasattr(p, 'name'):
                    view_name = p.name or ""
                if hasattr(p, 'callback'):
                    callback = p.callback
                    if hasattr(callback, 'cls'):
                        callback_name = f"{callback.cls.__module__}.{callback.cls.__name__}"
                    elif hasattr(callback, '__name__'):
                        callback_name = f"{callback.__module__}.{callback.__name__}"
                    else:
                        callback_name = str(callback)
                url_patterns.append({
                    "pattern": prefix + str(p.pattern),
                    "name": view_name,
                    "callback": callback_name
                })

    extract_patterns(resolver.url_patterns)
    return url_patterns

with open("backend_model_audit.json", "w", encoding="utf-8") as f:
    json.dump(inspect_models(), f, indent=2)

with open("backend_url_audit.json", "w", encoding="utf-8") as f:
    json.dump(inspect_urls(), f, indent=2)

print("Inspection completed successfully. Total apps:", len(inspect_models()))

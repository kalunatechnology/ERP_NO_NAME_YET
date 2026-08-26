import os
import django
import json

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings.base')
django.setup()

from django.urls import get_resolver
from rest_framework.routers import DefaultRouter

# Let's inspect each app's urls.py
app_routers = {}
apps_dir = "apps"

for app_name in os.listdir(apps_dir):
    app_path = os.path.join(apps_dir, app_name)
    if not os.path.isdir(app_path):
        continue
    api_urls_path = os.path.join(app_path, "api", "urls.py")
    urls_path = os.path.join(app_path, "urls.py")
    
    target_path = None
    if os.path.exists(api_urls_path):
        target_path = f"apps.{app_name}.api.urls"
    elif os.path.exists(urls_path):
        target_path = f"apps.{app_name}.urls"
        
    if target_path:
        try:
            mod = __import__(target_path, fromlist=['router', 'urlpatterns'])
            routes = []
            if hasattr(mod, 'router') and isinstance(mod.router, DefaultRouter):
                for prefix, viewset, basename in mod.router.registry:
                    viewset_name = f"{viewset.__module__}.{viewset.__name__}"
                    routes.append({
                        "prefix": prefix,
                        "viewset": viewset_name,
                        "basename": basename,
                        "model": viewset.queryset.model._meta.label if hasattr(viewset, 'queryset') and viewset.queryset is not None else None
                    })
            app_routers[app_name] = routes
        except Exception as e:
            app_routers[app_name] = f"Error: {str(e)}"

with open("routers_inventory.json", "w", encoding="utf-8") as f:
    json.dump(app_routers, f, indent=2)

print("Router inventory dumped.")

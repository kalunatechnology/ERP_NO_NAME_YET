from importlib import import_module

from django.apps import apps
from django.test import SimpleTestCase


LOCAL_APPS = {
    "core", "accounts", "master_data", "crm", "sales", "projects", "procurement",
    "inventory", "manufacturing", "quality", "finance", "assets", "service",
    "analytics", "logistics", "implementation", "reporting",
}


class APICoverageTests(SimpleTestCase):
    def test_every_local_model_has_a_router_registration(self):
        models = {
            model._meta.label_lower
            for model in apps.get_models()
            if model._meta.app_label in LOCAL_APPS
        }
        routed = set()
        for app_label in LOCAL_APPS:
            module = import_module(f"apps.{app_label}.api.urls")
            for _, viewset, _ in module.router.registry:
                routed.add(viewset.queryset.model._meta.label_lower)
        self.assertEqual(models, routed)

    def test_no_placeholder_commands_remain(self):
        commands = import_module("config.commands")
        self.assertFalse(hasattr(commands, "DomainCommandPlaceholderView"))

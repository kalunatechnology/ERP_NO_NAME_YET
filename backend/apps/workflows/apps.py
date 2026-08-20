"""
Workflow app configuration.
Loads workflow registry at startup using post_migrate signal to avoid
database access during app initialization.
"""
from django.apps import AppConfig


class WorkflowsConfig(AppConfig):
    name = 'apps.workflows'
    label = 'workflows'
    verbose_name = 'Workflow Engine'

    def ready(self):
        # Auto-import all tenant workflow modules so @register_workflow decorators fire
        # (pure Python imports, no DB access)
        from apps.workflows import _autodiscover
        _autodiscover()

        # Load DB-driven configs AFTER migrations are complete (via post_migrate signal)
        from django.db.models.signals import post_migrate
        post_migrate.connect(self._load_db_configs, sender=self)

    @staticmethod
    def _load_db_configs(sender, **kwargs):
        try:
            from apps.workflows.registry import WorkflowRegistry
            WorkflowRegistry.load_from_db()
        except Exception:
            pass

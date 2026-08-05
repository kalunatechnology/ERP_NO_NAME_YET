from django.apps import AppConfig


class APICommonConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.api_common"
    verbose_name = "ERP API Common"

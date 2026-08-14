"""
Central API URL configuration.

Semua endpoint di file ini otomatis mendapat prefix /api/v1/
dari config/urls.py.
"""

from django.urls import include, path
from apps.accounts.api.user_seed import SeedUsersView


urlpatterns = [
    # Authentication

    path(
        "dev/seed/users/",
        SeedUsersView.as_view(),
        name="dev-seed-users",
    ),
    path(
        "auth/",
        include("apps.accounts.api.auth_urls"),
    ),

    # IAM / Accounts
    path(
        "accounts/",
        include("apps.accounts.api.urls"),
    ),

    # ERP modules
    path(
        "analytics/",
        include("apps.analytics.api.urls"),
    ),
    path(
        "assets/",
        include("apps.assets.api.urls"),
    ),
    path(
        "core/",
        include("apps.core.api.urls"),
    ),
    path(
        "crm/",
        include("apps.crm.api.urls"),
    ),
    path(
        "finance/",
        include("apps.finance.api.urls"),
    ),
    path(
        "implementation/",
        include("apps.implementation.api.urls"),
    ),
    path(
        "inventory/",
        include("apps.inventory.api.urls"),
    ),
    path(
        "logistics/",
        include("apps.logistics.api.urls"),
    ),
    path(
        "manufacturing/",
        include("apps.manufacturing.api.urls"),
    ),
    path(
        "master-data/",
        include("apps.master_data.api.urls"),
    ),
    path(
        "procurement/",
        include("apps.procurement.api.urls"),
    ),
    path(
        "projects/",
        include("apps.projects.api.urls"),
    ),
    path(
        "quality/",
        include("apps.quality.api.urls"),
    ),
    path(
        "reporting/",
        include("apps.reporting.api.urls"),
    ),
    path(
        "sales/",
        include("apps.sales.api.urls"),
    ),
    path(
        "service/",
        include("apps.service.api.urls"),
    ),

    # Operational commands
    path(
        "commands/",
        include("config.command_urls"),
    ),
]
from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularRedocView, SpectacularSwaggerView

from config.health import HealthView


urlpatterns = [
    path("admin/", admin.site.urls),
    path("health/", HealthView.as_view(), name="health"),
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    path("api/docs/", SpectacularSwaggerView.as_view(url_name="schema"), name="swagger-ui"),
    path("api/redoc/", SpectacularRedocView.as_view(url_name="schema"), name="redoc"),
    path("api/v1/auth/", include("apps.accounts.api.auth_urls")),
    path("api/v1/accounts/", include("apps.accounts.api.urls")),
    path("api/v1/analytics/", include("apps.analytics.api.urls")),
    path("api/v1/assets/", include("apps.assets.api.urls")),
    path("api/v1/core/", include("apps.core.api.urls")),
    path("api/v1/crm/", include("apps.crm.api.urls")),
    path("api/v1/finance/", include("apps.finance.api.urls")),
    path("api/v1/implementation/", include("apps.implementation.api.urls")),
    path("api/v1/inventory/", include("apps.inventory.api.urls")),
    path("api/v1/logistics/", include("apps.logistics.api.urls")),
    path("api/v1/manufacturing/", include("apps.manufacturing.api.urls")),
    path("api/v1/master-data/", include("apps.master_data.api.urls")),
    path("api/v1/procurement/", include("apps.procurement.api.urls")),
    path("api/v1/projects/", include("apps.projects.api.urls")),
    path("api/v1/quality/", include("apps.quality.api.urls")),
    path("api/v1/reporting/", include("apps.reporting.api.urls")),
    path("api/v1/sales/", include("apps.sales.api.urls")),
    path("api/v1/service/", include("apps.service.api.urls")),
    path("api/v1/commands/", include("config.command_urls")),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
    urlpatterns += [path("api-auth/", include("rest_framework.urls", namespace="rest_framework"))]

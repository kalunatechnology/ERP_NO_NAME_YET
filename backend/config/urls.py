from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path

from drf_spectacular.views import (
    SpectacularAPIView,
    SpectacularRedocView,
    SpectacularSwaggerView,
)

from config.health import HealthView


urlpatterns = [
    # Django Admin — hanya satu kali
    path(
        "admin/",
        admin.site.urls,
    ),

    # Health check
    path(
        "health/",
        HealthView.as_view(),
        name="health",
    ),

    # OpenAPI schema
    path(
        "api/schema/",
        SpectacularAPIView.as_view(),
        name="api-schema",
    ),

    # Swagger UI
    path(
        "api/docs/",
        SpectacularSwaggerView.as_view(
            url_name="api-schema",
        ),
        name="swagger-ui",
    ),

    # ReDoc
    path(
        "api/redoc/",
        SpectacularRedocView.as_view(
            url_name="api-schema",
        ),
        name="redoc",
    ),

    # Seluruh ERP API masuk melalui satu file pusat
    path(
        "api/v1/",
        include("config.api_urls"),
    ),
]


if settings.DEBUG:
    urlpatterns += static(
        settings.MEDIA_URL,
        document_root=settings.MEDIA_ROOT,
    )

    urlpatterns += [
        path(
            "api-auth/",
            include(
                "rest_framework.urls",
                namespace="rest_framework",
            ),
        ),
    ]
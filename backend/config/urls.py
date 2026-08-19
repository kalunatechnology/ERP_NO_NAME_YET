from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path

from drf_spectacular.views import SpectacularAPIView
from django_scalar.views import scalar_viewer

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

    # OpenAPI schema (JSON/YAML)
    path(
        "api/schema/",
        SpectacularAPIView.as_view(),
        name="api-schema",
    ),

    # Scalar API Documentation (menggantikan Swagger UI & ReDoc)
    path(
        "api/docs/",
        scalar_viewer,
        {"openapi_url": "/api/schema/"},
        name="scalar-docs",
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
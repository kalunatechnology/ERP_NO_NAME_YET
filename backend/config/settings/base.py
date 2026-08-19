from __future__ import annotations

import os
import sys
from datetime import timedelta
from pathlib import Path

import dj_database_url
from dotenv import load_dotenv


BASE_DIR = Path(__file__).resolve().parent.parent.parent
load_dotenv(BASE_DIR / ".env")


def env_bool(name: str, default: bool = False) -> bool:
    return os.getenv(name, str(default)).strip().lower() in {"1", "true", "yes", "on"}


SECRET_KEY = os.getenv("SECRET_KEY", "unsafe-development-key-change-me")
DEBUG = env_bool("DEBUG", False)
ALLOWED_HOSTS = [item.strip() for item in os.getenv("ALLOWED_HOSTS", "127.0.0.1,localhost").split(",") if item.strip()]
CSRF_TRUSTED_ORIGINS = [item.strip() for item in os.getenv("CSRF_TRUSTED_ORIGINS", "").split(",") if item.strip()]

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "corsheaders",
    "rest_framework",
    "rest_framework_simplejwt.token_blacklist",
    "django_filters",
    "drf_spectacular",
    "django_scalar",
    "apps.api_common.apps.APICommonConfig",
    "apps.core.apps.CoreConfig",
    "apps.accounts.apps.AccountsConfig",
    "apps.master_data.apps.MasterDataConfig",
    "apps.crm.apps.CrmConfig",
    "apps.sales.apps.SalesConfig",
    "apps.projects.apps.ProjectsConfig",
    "apps.procurement.apps.ProcurementConfig",
    "apps.inventory.apps.InventoryConfig",
    "apps.manufacturing.apps.ManufacturingConfig",
    "apps.quality.apps.QualityConfig",
    "apps.finance.apps.FinanceConfig",
    "apps.assets.apps.AssetsConfig",
    "apps.service.apps.ServiceConfig",
    "apps.analytics.apps.AnalyticsConfig",
    "apps.logistics.apps.LogisticsConfig",
    "apps.implementation.apps.ImplementationConfig",
    "apps.reporting.apps.ReportingConfig",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"
TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    }
]
WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///db.sqlite3")
DATABASES = {
    "default": dj_database_url.parse(
        DATABASE_URL,
        # Django's threaded development server can otherwise exhaust the
        # small Supabase session-pool limit during API-heavy seed runs.
        conn_max_age=int(os.getenv("DB_CONN_MAX_AGE", "0" if DEBUG else "60")),
        conn_health_checks=True,
        ssl_require=DATABASE_URL.startswith("postgres"),
    )
}

if "test" in sys.argv:
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": BASE_DIR / "test_db.sqlite3",
        }
    }

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {
        "console": {"class": "logging.StreamHandler"},
    },
    "loggers": {
        "django.request": {
            "handlers": ["console"],
            "level": "ERROR",
            "propagate": False,
        },
        "django.db.backends": {
            "handlers": ["console"],
            "level": "ERROR",
            "propagate": False,
        },
    },
}

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "id-id"
TIME_ZONE = os.getenv("TIME_ZONE", "Asia/Jakarta")
USE_I18N = True
USE_TZ = True
STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
MEDIA_URL = "media/"
MEDIA_ROOT = BASE_DIR / "media"
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
AUTH_USER_MODEL = "accounts.User"

CORS_ALLOW_ALL_ORIGINS = DEBUG
CORS_ALLOWED_ORIGINS = [
    item.strip()
    for item in os.getenv(
        "CORS_ALLOWED_ORIGINS",
        "http://127.0.0.1:4173,http://localhost:4173,http://127.0.0.1:5500,http://localhost:5500,http://127.0.0.1:8080,http://localhost:8080,http://127.0.0.1:3000,http://localhost:3000,http://127.0.0.1:5173,http://localhost:5173",
    ).split(",")
    if item.strip()
]
CORS_ALLOW_CREDENTIALS = True
CORS_ALLOW_HEADERS = [
    "accept",
    "authorization",
    "content-type",
    "origin",
    "user-agent",
    "x-company-id",
    "x-csrftoken",
    "x-requested-with",
]

ERP_ENFORCE_IAM = env_bool("ERP_ENFORCE_IAM", False)
ERP_ENFORCE_FIELD_PERMISSIONS = env_bool("ERP_ENFORCE_FIELD_PERMISSIONS", False)

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
    "DEFAULT_PAGINATION_CLASS": "apps.api_common.pagination.ERPPageNumberPagination",
    "DEFAULT_FILTER_BACKENDS": [
        "apps.api_common.filters.ERPQueryFilterBackend",
        "rest_framework.filters.SearchFilter",
        "rest_framework.filters.OrderingFilter",
    ],
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    "PAGE_SIZE": 20,
    "EXCEPTION_HANDLER": "apps.api_common.exceptions.erp_exception_handler",
    "COERCE_DECIMAL_TO_STRING": True,
    "DATETIME_FORMAT": "%Y-%m-%dT%H:%M:%S%z",
}

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=int(os.getenv("JWT_ACCESS_MINUTES", "30"))),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=int(os.getenv("JWT_REFRESH_DAYS", "7"))),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
    "UPDATE_LAST_LOGIN": True,
    "AUTH_HEADER_TYPES": ("Bearer",),
}

SPECTACULAR_SETTINGS = {
    "TITLE": "ERP Operational API",
    "DESCRIPTION": (
        "Dokumentasi API ERP untuk Core, IAM, Master Data, CRM, "
        "Sales, Project, Procurement, Inventory, Manufacturing, "
        "Quality, Finance, Asset, Service, Analytics, dan Reporting."
    ),
    "VERSION": "1.0.0",

    # Schema tidak ditampilkan sebagai endpoint tambahan
    # di dalam daftar Swagger.
    "SERVE_INCLUDE_SCHEMA": False,

    # Memisahkan bentuk request dan response agar dokumentasi
    # serializer lebih jelas.
    "COMPONENT_SPLIT_REQUEST": True,

    # Menampilkan schema dengan path /api/v1/.
    "SCHEMA_PATH_PREFIX": r"/api/v1",

    "TAGS": [
        {
            "name": "Authentication",
            "description": "Login, refresh token, logout, dan profil pengguna.",
        },
        {
            "name": "Core",
            "description": "Tenant, company, organization, document, workflow, dan audit.",
        },
        {
            "name": "Accounts & IAM",
            "description": "User, role, permission, data scope, dan approval limit.",
        },
        {
            "name": "Master Data",
            "description": "Customer, supplier, product, employee, currency, dan warehouse.",
        },
        {
            "name": "CRM",
            "description": "Lead, opportunity, pipeline, activity, dan communication.",
        },
        {
            "name": "Sales",
            "description": "Quotation, contract, order, delivery, dan recurring order.",
        },
        {
            "name": "Projects",
            "description": "Project, task, milestone, budget, resource, risk, dan issue.",
        },
        {
            "name": "Procurement",
            "description": "PR, RFQ, supplier quotation, PO, receipt, dan matching.",
        },
        {
            "name": "Inventory",
            "description": "Stock movement, reservation, ledger, balance, dan counting.",
        },
        {
            "name": "Manufacturing",
            "description": "BOM, routing, production order, work order, dan costing.",
        },
        {
            "name": "Finance",
            "description": "Account, journal, billing, payment, bank, budget, dan closing.",
        },
        {
            "name": "Commands",
            "description": "Aksi transaksi seperti submit, approve, post, dan reverse.",
        },
        {
            "name": "Reporting",
            "description": "Dashboard dan database view yang bersifat read-only.",
        },
    ],
}
from corsheaders.defaults import default_headers

CORS_ALLOWED_ORIGINS = [
    "http://127.0.0.1:5500",
    "http://localhost:5500",
]

CORS_ALLOW_CREDENTIALS = False

CORS_ALLOW_HEADERS = [
    *default_headers,
    "x-company-id",
]


SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SESSION_COOKIE_SECURE = env_bool("SESSION_COOKIE_SECURE", not DEBUG)
CSRF_COOKIE_SECURE = env_bool("CSRF_COOKIE_SECURE", not DEBUG)

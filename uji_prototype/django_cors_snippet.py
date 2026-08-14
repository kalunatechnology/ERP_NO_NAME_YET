"""Salin bagian yang relevan ke config/settings.py."""

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

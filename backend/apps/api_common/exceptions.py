from __future__ import annotations

import logging
from typing import Any

from django.db.models import ProtectedError, RestrictedError
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import exception_handler as drf_exception_handler

logger = logging.getLogger(__name__)


def custom_exception_handler(exc: Exception, context: dict[str, Any]):
    # Panggil default exception handler DRF terlebih dahulu
    response = drf_exception_handler(exc, context)

    # Tangani ProtectedError & RestrictedError (Foreign Key dengan on_delete=models.PROTECT / RESTRICT)
    if isinstance(exc, (ProtectedError, RestrictedError)):
        protected_objects = list(getattr(exc, "protected_objects", None) or getattr(exc, "restricted_objects", []))
        class_names = list({obj.__class__.__name__ for obj in protected_objects})

        detail_message = (
            f"Data tidak dapat dihapus karena masih digunakan atau terikat dengan entitas lain "
            f"({', '.join(class_names)}). Harap selesaikan atau hapus relasi terkait terlebih dahulu."
        )

        return Response(
            {
                "success": False,
                "error": "PROTECTED_RELATION_ERROR",
                "message": detail_message,
                "detail": detail_message,
                "referenced_entities": class_names,
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    if response is not None:
        # Standardize error response shape
        if isinstance(response.data, dict) and "detail" in response.data:
            response.data = {
                "success": False,
                "error": response.data.get("detail", "Error"),
                "detail": response.data.get("detail", "Error"),
            }
        elif isinstance(response.data, dict):
            response.data = {
                "success": False,
                "status_code": response.status_code,
                "errors": response.data,
            }
        elif isinstance(response.data, list):
            response.data = {
                "success": False,
                "status_code": response.status_code,
                "errors": response.data,
            }

    return response


# Alias for backward compatibility
erp_exception_handler = custom_exception_handler

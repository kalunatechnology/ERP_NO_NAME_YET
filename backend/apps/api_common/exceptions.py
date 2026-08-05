from __future__ import annotations

from typing import Any

from rest_framework.views import exception_handler as drf_exception_handler


def erp_exception_handler(exc: Exception, context: dict[str, Any]):
    response = drf_exception_handler(exc, context)
    if response is None:
        return None

    detail = response.data
    response.data = {
        "success": False,
        "status_code": response.status_code,
        "errors": detail,
    }
    return response

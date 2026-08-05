from __future__ import annotations

from django.core.exceptions import FieldDoesNotExist
from rest_framework.filters import BaseFilterBackend
from rest_framework.exceptions import ValidationError


ALLOWED_LOOKUPS = {
    "exact",
    "in",
    "gte",
    "lte",
    "gt",
    "lt",
    "icontains",
    "contains",
    "istartswith",
    "iendswith",
    "isnull",
    "range",
}

RESERVED_QUERY_PARAMS = {
    "page",
    "page_size",
    "search",
    "ordering",
    "format",
    "include",
}


class ERPQueryFilterBackend(BaseFilterBackend):
    """Safe dynamic filtering for concrete fields and FK ids.

    Examples:
      ?status=APPROVED
      ?company_id=<uuid>
      ?posting_date__gte=2026-08-01
      ?id__in=<uuid>,<uuid>
      ?name__icontains=server
    """

    def filter_queryset(self, request, queryset, view):
        filters: dict[str, object] = {}
        model = queryset.model

        for raw_key, raw_value in request.query_params.items():
            if raw_key in RESERVED_QUERY_PARAMS or raw_value == "":
                continue

            parts = raw_key.split("__")
            lookup = "exact"
            if parts[-1] in ALLOWED_LOOKUPS:
                lookup = parts.pop()

            field_path = "__".join(parts)
            if not self._is_allowed_field(model, field_path):
                raise ValidationError({raw_key: "Field filter tidak valid."})

            key = field_path if lookup == "exact" else f"{field_path}__{lookup}"
            filters[key] = self._coerce(raw_value, lookup)

        if not filters:
            return queryset

        try:
            return queryset.filter(**filters)
        except (TypeError, ValueError) as exc:
            raise ValidationError({"filters": str(exc)}) from exc

    @staticmethod
    def _coerce(value: str, lookup: str):
        if lookup in {"in", "range"}:
            return [item.strip() for item in value.split(",") if item.strip()]
        if lookup == "isnull":
            normalized = value.strip().lower()
            if normalized not in {"true", "false", "1", "0"}:
                raise ValidationError({"isnull": "Gunakan true/false atau 1/0."})
            return normalized in {"true", "1"}
        return value

    @staticmethod
    def _is_allowed_field(model, field_path: str) -> bool:
        parts = field_path.split("__")
        current_model = model
        for index, part in enumerate(parts):
            if part.endswith("_id") and index == len(parts) - 1:
                part = part[:-3]
            try:
                field = current_model._meta.get_field(part)
            except FieldDoesNotExist:
                return False
            if index < len(parts) - 1:
                if not getattr(field, "is_relation", False) or field.related_model is None:
                    return False
                current_model = field.related_model
        return True

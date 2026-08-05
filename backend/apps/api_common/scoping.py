from __future__ import annotations

from functools import lru_cache
from typing import Any

from django.db import models


@lru_cache(maxsize=1024)
def find_scope_path(model: type[models.Model], target: str, max_depth: int = 4) -> str | None:
    """Find the shortest forward FK path to tenant or company."""

    def walk(current_model, prefix: str, depth: int, visited: set[type[models.Model]]):
        if depth > max_depth or current_model in visited:
            return None
        visited = visited | {current_model}

        direct_names = {field.name for field in current_model._meta.concrete_fields}
        if target in direct_names:
            return f"{prefix}{target}"

        preferred = []
        others = []
        for field in current_model._meta.concrete_fields:
            if not isinstance(field, (models.ForeignKey, models.OneToOneField)):
                continue
            if field.related_model is None:
                continue
            item = (field.name, field.related_model)
            if field.name in {"document", "company", "tenant", "project", "organization", "warehouse", "budget"}:
                preferred.append(item)
            else:
                others.append(item)

        for name, related_model in preferred + others:
            result = walk(related_model, f"{prefix}{name}__", depth + 1, visited)
            if result:
                return result
        return None

    return walk(model, "", 0, set())


def get_scope_value(instance: models.Model | None, target: str) -> Any:
    if instance is None:
        return None
    path = find_scope_path(instance.__class__, target)
    if not path:
        return None

    current: Any = instance
    for part in path.split("__"):
        current = getattr(current, part, None)
        if current is None:
            return None
    return getattr(current, "pk", current)


def scope_queryset(queryset, user, company_id: str | None = None):
    if getattr(user, "is_superuser", False):
        return queryset

    model = queryset.model
    tenant_id = getattr(user, "tenant_id", None)
    tenant_path = find_scope_path(model, "tenant")
    if tenant_id and tenant_path:
        queryset = queryset.filter(**{f"{tenant_path}_id": tenant_id})

    company_path = find_scope_path(model, "company")
    if company_id and company_path:
        queryset = queryset.filter(**{f"{company_path}_id": company_id})
    elif company_path:
        try:
            accessible_company_ids = list(
                user.accounts_userrole_user_set.exclude(company_id__isnull=True)
                .values_list("company_id", flat=True)
                .distinct()
            )
        except Exception:
            accessible_company_ids = []
        if accessible_company_ids:
            queryset = queryset.filter(**{f"{company_path}_id__in": accessible_company_ids})

    return queryset.distinct()

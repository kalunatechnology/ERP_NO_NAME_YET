from __future__ import annotations

import json
from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from django.forms.models import model_to_dict
from django.utils import timezone

from .scoping import get_scope_value


class JSONSafeEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, (datetime, date)):
            return obj.isoformat()
        if isinstance(obj, (Decimal, UUID)):
            return str(obj)
        return super().default(obj)


def snapshot(instance) -> dict:
    if instance is None:
        return {}
    data = model_to_dict(instance)
    data["id"] = str(instance.pk)
    return json.loads(json.dumps(data, cls=JSONSafeEncoder))


def create_audit_event(*, request, instance, event_type: str, before: dict | None = None, after: dict | None = None):
    try:
        from apps.core.models import AuditEvent, BusinessDocument

        document = instance if isinstance(instance, BusinessDocument) else getattr(instance, "document", None)
        AuditEvent.objects.create(
            tenant_id=get_scope_value(instance, "tenant"),
            company_id=get_scope_value(instance, "company"),
            document=document,
            user=request.user if getattr(request, "user", None) and request.user.is_authenticated else None,
            entity_name=instance._meta.label,
            entity_id=instance.pk,
            event_type=event_type,
            before_data=before or {},
            after_data=after or {},
            occurred_at=timezone.now(),
        )
    except Exception:
        # Audit must never break the main transaction during initial rollout.
        # Production deployments should route failures to structured logging.
        return None

"""
Workflow Engine API Commands.

Two endpoints to integrate the Workflow Engine with the frontend:

  GET  /api/v1/commands/workflow/transitions/{module}/{document_id}/
       Returns available transitions for the document (dynamic button rendering).

  POST /api/v1/commands/workflow/execute/{module}/{document_id}/
       Executes a transition. Body: {"to_status": "...", "note": "..."}

The tenant is auto-resolved from the authenticated user's tenant.
"""
from __future__ import annotations

import logging

from django.apps import apps
from django.shortcuts import get_object_or_404
from drf_spectacular.utils import OpenApiParameter, extend_schema, inline_serializer
from drf_spectacular.types import OpenApiTypes
from rest_framework import permissions, serializers, status
from rest_framework.generics import GenericAPIView
from rest_framework.response import Response

from apps.workflows import StateMachine, WorkflowRegistry
from apps.workflows.base import TransitionContext
from apps.workflows.exceptions import (
    WorkflowError,
    WorkflowNotFoundError,
    WorkflowTransitionError,
    WorkflowValidationError,
)

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Module -> Django Model mapping
# ---------------------------------------------------------------------------
MODULE_MODEL_MAP = {
    "SALES_ORDER": ("sales", "SalesOrder"),
    "SALES_QUOTATION": ("sales", "Quotation"),
    "PROJECT": ("projects", "Project"),
    "PURCHASE_ORDER": ("procurement", "PurchaseOrder"),
    "INVOICE": ("finance", "BillingDocument"),
    "PROCUREMENT_REQUEST": ("procurement", "PurchaseRequisition"),
}


def _resolve_document(module_code: str, document_id: str):
    """Resolve a document instance from module code and UUID."""
    mapping = MODULE_MODEL_MAP.get(module_code.upper())
    if not mapping:
        return None, f"Unknown module: {module_code}"
    app_label, model_name = mapping
    try:
        Model = apps.get_model(app_label, model_name)
        obj = get_object_or_404(Model, pk=document_id)
        return obj, None
    except LookupError:
        return None, f"Model {app_label}.{model_name} not found"


def _get_tenant_code(request) -> str:
    """Resolve tenant code from the authenticated user."""
    try:
        tenant = getattr(request.user, "tenant", None)
        return tenant.code if tenant else "default"
    except Exception:
        return "default"


def _get_company_id(request) -> str:
    """Resolve company ID from header or query param."""
    return (
        request.headers.get("X-Company-ID")
        or request.query_params.get("company_id")
        or ""
    )


# ---------------------------------------------------------------------------
# GET: Available Transitions
# ---------------------------------------------------------------------------

class WorkflowTransitionsView(GenericAPIView):
    """
    Returns the list of available workflow transitions for a given document.
    Used by the frontend to dynamically render action buttons.
    """
    permission_classes = [permissions.IsAuthenticated]

    @extend_schema(
        tags=["Workflow Engine"],
        summary="Get available workflow transitions",
        parameters=[
            OpenApiParameter("module", OpenApiTypes.STR, OpenApiParameter.PATH,
                             description="Module code (e.g. SALES_ORDER, PROJECT, PURCHASE_ORDER)"),
            OpenApiParameter("document_id", OpenApiTypes.UUID, OpenApiParameter.PATH,
                             description="UUID of the document"),
        ],
        responses={
            200: inline_serializer("WorkflowTransitionsResponse", fields={
                "module": serializers.CharField(),
                "document_id": serializers.CharField(),
                "current_status": serializers.CharField(),
                "tenant": serializers.CharField(),
                "workflow_class": serializers.CharField(),
                "transitions": serializers.ListField(child=serializers.DictField()),
            }),
            404: inline_serializer("WorkflowNotFound", fields={"error": serializers.CharField()}),
        },
    )
    def get(self, request, module: str, document_id: str):
        module = module.upper()
        document, err = _resolve_document(module, document_id)
        if err:
            return Response({"error": err}, status=status.HTTP_404_NOT_FOUND)

        tenant_code = _get_tenant_code(request)
        company_id = _get_company_id(request)
        ctx = TransitionContext(
            user=request.user,
            company_id=company_id,
            tenant_code=tenant_code,
        )

        try:
            transitions = StateMachine.get_available_transitions(
                document=document,
                module_code=module,
                context=ctx,
            )
            workflow = WorkflowRegistry.get(tenant_code=tenant_code, module_code=module)
            return Response({
                "module": module,
                "document_id": str(document.pk),
                "current_status": getattr(document, "status", getattr(document, "lifecycle_status", "")),
                "tenant": tenant_code,
                "workflow_class": type(workflow).__name__,
                "transitions": transitions,
            })
        except WorkflowNotFoundError as e:
            return Response({"error": str(e)}, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            logger.exception("Error fetching workflow transitions for %s/%s", module, document_id)
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


# ---------------------------------------------------------------------------
# POST: Execute Transition
# ---------------------------------------------------------------------------

class WorkflowExecuteTransitionView(GenericAPIView):
    """
    Executes a workflow transition on the given document.
    Body: { "to_status": "CONFIRMED", "note": "Optional note" }
    """
    permission_classes = [permissions.IsAuthenticated]

    @extend_schema(
        tags=["Workflow Engine"],
        summary="Execute a workflow transition",
        parameters=[
            OpenApiParameter("module", OpenApiTypes.STR, OpenApiParameter.PATH),
            OpenApiParameter("document_id", OpenApiTypes.UUID, OpenApiParameter.PATH),
        ],
        request=inline_serializer("WorkflowTransitionRequest", fields={
            "to_status": serializers.CharField(help_text="Target status to transition to"),
            "note": serializers.CharField(required=False, default="", help_text="Optional transition note"),
        }),
        responses={
            200: inline_serializer("WorkflowTransitionResult", fields={
                "success": serializers.BooleanField(),
                "from_status": serializers.CharField(),
                "to_status": serializers.CharField(),
                "module": serializers.CharField(),
                "tenant": serializers.CharField(),
                "timestamp": serializers.CharField(),
            }),
            400: inline_serializer("WorkflowTransitionError", fields={
                "error": serializers.CharField(),
                "errors": serializers.DictField(required=False),
            }),
            403: inline_serializer("WorkflowForbidden", fields={"error": serializers.CharField()}),
        },
    )
    def post(self, request, module: str, document_id: str):
        module = module.upper()
        to_status = request.data.get("to_status", "").strip()
        note = request.data.get("note", "")

        if not to_status:
            return Response(
                {"error": "Field 'to_status' is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        document, err = _resolve_document(module, document_id)
        if err:
            return Response({"error": err}, status=status.HTTP_404_NOT_FOUND)

        tenant_code = _get_tenant_code(request)
        company_id = _get_company_id(request)
        ctx = TransitionContext(
            user=request.user,
            company_id=company_id,
            tenant_code=tenant_code,
            note=note,
        )

        try:
            result = StateMachine.transition(
                document=document,
                module_code=module,
                to_status=to_status,
                context=ctx,
            )
            return Response({"success": True, **result})

        except WorkflowTransitionError as e:
            return Response(
                {"error": str(e), "from_status": e.from_status, "to_status": e.to_status},
                status=status.HTTP_400_BAD_REQUEST,
            )
        except WorkflowValidationError as e:
            return Response(
                {"error": str(e), "errors": e.errors},
                status=status.HTTP_400_BAD_REQUEST,
            )
        except WorkflowNotFoundError as e:
            return Response({"error": str(e)}, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            logger.exception("Unexpected error executing transition for %s/%s", module, document_id)
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


# ---------------------------------------------------------------------------
# GET: Workflow Registry (admin/debug)
# ---------------------------------------------------------------------------

class WorkflowRegistryView(GenericAPIView):
    """Returns a summary of all registered workflows (admin/debug endpoint)."""
    permission_classes = [permissions.IsAdminUser]

    @extend_schema(
        tags=["Workflow Engine"],
        summary="List all registered workflows (admin)",
    )
    def get(self, request):
        registry = WorkflowRegistry.list_all()
        details = []
        for key, class_name in registry.items():
            tenant, module = key.split("/", 1)
            try:
                wf = WorkflowRegistry.get(tenant_code=tenant, module_code=module)
                details.append(wf.get_flow_summary())
            except Exception:
                details.append({"tenant": tenant, "module": module, "class": class_name})
        return Response({"registered_workflows": details, "count": len(details)})

from django.contrib import admin
from apps.workflows.models import TenantWorkflowConfig, WorkflowTransitionLog


@admin.register(TenantWorkflowConfig)
class TenantWorkflowConfigAdmin(admin.ModelAdmin):
    list_display = ['tenant', 'module_code', 'workflow_class_path', 'is_active', 'updated_at']
    list_filter = ['module_code', 'is_active', 'tenant']
    search_fields = ['tenant__code', 'module_code', 'workflow_class_path']
    list_editable = ['is_active']


@admin.register(WorkflowTransitionLog)
class WorkflowTransitionLogAdmin(admin.ModelAdmin):
    list_display = ['tenant_code', 'module_code', 'document_id', 'from_status', 'to_status', 'triggered_by', 'created_at']
    list_filter = ['tenant_code', 'module_code']
    search_fields = ['document_id', 'triggered_by', 'tenant_code']
    readonly_fields = list_display + ['note']

    def has_add_permission(self, request): return False
    def has_change_permission(self, request, obj=None): return False
    def has_delete_permission(self, request, obj=None): return False

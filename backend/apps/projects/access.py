from django.db.models import Q

from apps.accounts.models import UserRole
from apps.projects.models import Member


EXECUTIVE_ROLES = {
    "EXECUTIVE", "ROLE-ADMIN", "ADMIN", "SUPERADMIN", "SUPER_ADMIN",
    "DIRECTOR", "MANAGER", "ROLE-MANAGER", "OPERATIONS_MANAGER", "OPERATION_MANAGER",
    "PROJECT_MANAGER", "PROJECT_MANAGEMENT", "SALES", "CRM_MANAGER"
}
PROJECT_MANAGEMENT_ROLES = {
    "PROJECT_MANAGEMENT", "PROJECT_MANAGER", "SUPERVISOR", "QUALITY_CONTROL",
    "WAREHOUSE", "ROLE-MANAGER", "ROLE-ADMIN", "SUPER_ADMIN", "ADMIN", "DIRECTOR"
}
FINANCE_ROLES = {
    "ACCOUNTING_FINANCE", "FINANCE", "FINANCE_APPROVER", "ROLE-ADMIN",
    "ROLE-MANAGER", "SUPER_ADMIN", "ADMIN", "DIRECTOR"
}
CRM_ROLES = {
    "CRM", "CRM_SALES", "SALES", "CRM_MANAGER", "ROLE-ADMIN",
    "ROLE-MANAGER", "ROLE-STAFF", "MANAGER", "SUPER_ADMIN", "ADMIN", "DIRECTOR"
}


def role_codes(user):
    if not user or not user.is_authenticated:
        return set()
    return set(
        UserRole.objects.filter(user=user, role__isnull=False)
        .values_list("role__role_code", flat=True)
    )


def is_executive(user):
    return bool(user and (user.is_superuser or bool(role_codes(user) & EXECUTIVE_ROLES)))


def is_project_management(user):
    return is_executive(user) or bool(role_codes(user) & PROJECT_MANAGEMENT_ROLES)


def is_finance(user):
    return is_executive(user) or bool(role_codes(user) & FINANCE_ROLES)


def is_crm(user):
    return is_executive(user) or bool(role_codes(user) & CRM_ROLES)


def active_memberships(user):
    return Member.objects.filter(user=user).filter(Q(status="ACTIVE") | Q(status=""))


def can_access_project(user, project):
    if is_executive(user) or is_project_management(user) or is_finance(user):
        return True
    if project.project_manager_id == getattr(user, "id", None) or project.project_manager_id is None:
        return True
    return active_memberships(user).filter(project=project).exists()


def can_manage_project(user, project):
    if is_executive(user):
        return True
    if not is_project_management(user):
        return False
    if not project.project_manager_id:
        return True
    return project.project_manager_id == user.id or active_memberships(user).filter(
        project=project, project_role__in=["MANAGER", "PROJECT_MANAGER"]
    ).exists()


from rest_framework.permissions import BasePermission, SAFE_METHODS


class IsProjectPMPermission(BasePermission):
    """
    Allows full access to PM / Executive, read-only to project members.
    """
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated)

    def has_object_permission(self, request, view, obj):
        project = getattr(obj, "project", None)
        if project is None and hasattr(obj, "main_task"):
            project = obj.main_task.project
        elif project is None and hasattr(obj, "weekly_task"):
            project = obj.weekly_task.main_task.project
        elif project is None and hasattr(obj, "daily_task"):
            project = obj.daily_task.weekly_task.main_task.project

        if project is None:
            return True

        if request.method in SAFE_METHODS:
            return can_access_project(request.user, project)
        return can_manage_project(request.user, project)


class IsDailyTaskOwnerOrPM(BasePermission):
    """
    Allows read-only access to all project members.
    Allows modification strictly to the Daily Task owner only.
    """
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated)

    def has_object_permission(self, request, view, obj):
        daily_task = obj if hasattr(obj, "weekly_task") else getattr(obj, "daily_task", None)
        if daily_task is None:
            return True

        project = daily_task.weekly_task.main_task.project
        if request.method in SAFE_METHODS:
            return can_access_project(request.user, project)

        return daily_task.owner_id == request.user.id or can_manage_project(request.user, project)



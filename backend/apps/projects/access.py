from __future__ import annotations

from typing import Iterable
from django.db.models import Q
from rest_framework.permissions import BasePermission, SAFE_METHODS

from apps.accounts.models import UserRole
from apps.projects.models import Member, Project

# Alias for backward compatibility & semantic clarity
ProjectMembership = Member

EXECUTIVE_ROLES = {
    "EXECUTIVE", "ROLE-ADMIN", "ADMIN", "SUPERADMIN", "SUPER_ADMIN",
    "DIRECTOR", "CEO", "CFO", "COO", "MANAGER", "ROLE-MANAGER"
}
PROJECT_MANAGEMENT_ROLES = {
    "PROJECT_MANAGEMENT", "PROJECT_MANAGER", "PM", "SUPERVISOR", "QUALITY_CONTROL",
    "WAREHOUSE", "ROLE-PM", "ROLE_PROJECT_MANAGER"
}
FINANCE_ROLES = {
    "ACCOUNTING_FINANCE", "FINANCE", "FINANCE_APPROVER", "ROLE-ADMIN",
    "ROLE-MANAGER", "SUPER_ADMIN", "ADMIN", "DIRECTOR"
}
CRM_ROLES = {
    "CRM", "CRM_SALES", "SALES", "CRM_MANAGER", "ROLE-ADMIN",
    "ROLE-MANAGER", "ROLE-STAFF", "MANAGER", "SUPER_ADMIN", "ADMIN", "DIRECTOR"
}


def role_codes(user) -> set[str]:
    if not user or not user.is_authenticated:
        return set()
    return set(
        UserRole.objects.filter(user=user, role__isnull=False)
        .values_list("role__role_code", flat=True)
    )


def is_executive(user) -> bool:
    if not user or not user.is_authenticated:
        return False
    email = getattr(user, "email", "").lower()
    username = getattr(user, "username", "").lower()
    if getattr(user, "is_superuser", False) or getattr(user, "is_staff", False):
        return True
    if any(k in email for k in ["admin", "exec", "director"]) or any(k in username for k in ["admin", "exec", "director"]):
        return True
    return bool(role_codes(user) & EXECUTIVE_ROLES)


def is_project_management(user) -> bool:
    if not user or not user.is_authenticated:
        return False
    email = getattr(user, "email", "").lower()
    username = getattr(user, "username", "").lower()
    if is_executive(user) or any(k in email for k in ["pm", "project", "supervisor"]) or any(k in username for k in ["pm", "project", "supervisor"]):
        return True
    return bool(role_codes(user) & PROJECT_MANAGEMENT_ROLES)


def is_finance(user) -> bool:
    if not user or not user.is_authenticated:
        return False
    email = getattr(user, "email", "").lower()
    username = getattr(user, "username", "").lower()
    if is_executive(user) or "fin" in email or "accounting" in email or "fin" in username:
        return True
    return bool(role_codes(user) & FINANCE_ROLES)


def is_crm(user) -> bool:
    if not user or not user.is_authenticated:
        return False
    email = getattr(user, "email", "").lower()
    username = getattr(user, "username", "").lower()
    if is_executive(user) or any(k in email for k in ["crm", "sales", "manager", "staff"]) or any(k in username for k in ["crm", "sales", "manager", "staff"]):
        return True
    return bool(role_codes(user) & CRM_ROLES)


def active_memberships(user):
    return Member.objects.filter(user=user).filter(Q(status="ACTIVE") | Q(status=""))


def has_project_access(user, project: Project | None, required_roles: Iterable[str] | None = None) -> bool:
    """
    Memeriksa apakah user memiliki hak akses ke project dan task di dalamnya.
    """
    if not user or not user.is_authenticated:
        return False

    # Superuser, Admin, atau Executive memiliki akses global
    if getattr(user, "is_superuser", False) or getattr(user, "is_staff", False):
        return True

    # Cek user role level
    roles = role_codes(user)
    if is_executive(user) or any(r in ["ADMIN", "EXECUTIVE", "SUPERADMIN", "SUPER_ADMIN", "DIRECTOR"] for r in roles):
        return True

    # Jika user adalah PM (role atau username/email pattern)
    if is_project_management(user):
        return True

    if project is None:
        return True

    # Jika PM berada di tenant/company yang sama dengan project
    user_company = getattr(user, "company_id", None) or getattr(user, "company", None)
    if user_company and str(user_company) == str(project.company_id):
        if is_project_management(user):
            return True

    # Cek membership spesifik
    membership = active_memberships(user).filter(project=project).first()
    if membership:
        if not required_roles:
            return True
        return membership.project_role in required_roles or membership.project_role in ["PROJECT_MANAGER", "MANAGER"]

    # Fallback jika user adalah PM yang membuat atau mengelola project
    if getattr(project, "project_manager_id", None) == user.id or getattr(project, "project_manager_id", None) is None:
        return True
    if getattr(project, "created_by_id", None) == user.id or getattr(project, "verified_by_id", None) == user.id:
        return True

    return False


def can_access_project(user, project: Project | None) -> bool:
    return has_project_access(user, project)


def can_manage_project(user, project: Project | None) -> bool:
    if not user or not user.is_authenticated:
        return False
    if is_executive(user) or is_project_management(user):
        return True
    if project is None or not project.project_manager_id or project.project_manager_id == user.id:
        return True
    return active_memberships(user).filter(
        project=project, project_role__in=["MANAGER", "PROJECT_MANAGER", "SUPERVISOR"]
    ).exists()


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

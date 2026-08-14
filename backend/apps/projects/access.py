from django.db.models import Q

from apps.accounts.models import UserRole
from apps.projects.models import Member


EXECUTIVE = "EXECUTIVE"
PROJECT_MANAGEMENT_ROLES = {"PROJECT_MANAGEMENT", "PROJECT_MANAGER"}
FINANCE_ROLES = {"ACCOUNTING_FINANCE", "FINANCE"}
CRM_ROLES = {"CRM", "CRM_SALES", "CRM_MANAGER"}


def role_codes(user):
    if not user or not user.is_authenticated:
        return set()
    return set(
        UserRole.objects.filter(user=user, role__isnull=False)
        .values_list("role__role_code", flat=True)
    )


def is_executive(user):
    return bool(user and (user.is_superuser or EXECUTIVE in role_codes(user)))


def is_project_management(user):
    return is_executive(user) or bool(role_codes(user) & PROJECT_MANAGEMENT_ROLES)


def is_finance(user):
    return is_executive(user) or bool(role_codes(user) & FINANCE_ROLES)


def is_crm(user):
    return is_executive(user) or bool(role_codes(user) & CRM_ROLES)


def active_memberships(user):
    return Member.objects.filter(user=user).filter(Q(status="ACTIVE") | Q(status=""))


def can_access_project(user, project):
    if is_executive(user):
        return True
    if project.project_manager_id == getattr(user, "id", None):
        return True
    return active_memberships(user).filter(project=project).exists()


def can_manage_project(user, project):
    if is_executive(user):
        return True
    if not is_project_management(user):
        return False
    return project.project_manager_id == user.id or active_memberships(user).filter(
        project=project, project_role__in=["MANAGER", "PROJECT_MANAGER"]
    ).exists()

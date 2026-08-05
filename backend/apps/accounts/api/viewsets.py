from apps.accounts.models import User, Role, Permission, UserRole, RolePermission, RoleHierarchy, DataScopePolicy, RoleDataScope, FieldPermission, InformationShareRule, ApprovalLimit, UserProjectAccess
from apps.api_common.viewsets import BaseERPModelViewSet, ReadOnlyERPModelViewSet
from .serializers import UserSerializer, RoleSerializer, PermissionSerializer, UserRoleSerializer, RolePermissionSerializer, RoleHierarchySerializer, DataScopePolicySerializer, RoleDataScopeSerializer, FieldPermissionSerializer, InformationShareRuleSerializer, ApprovalLimitSerializer, UserProjectAccessSerializer

class UserViewSet(BaseERPModelViewSet):
    queryset = User.objects.all()
    serializer_class = UserSerializer


class RoleViewSet(BaseERPModelViewSet):
    queryset = Role.objects.all()
    serializer_class = RoleSerializer


class PermissionViewSet(BaseERPModelViewSet):
    queryset = Permission.objects.all()
    serializer_class = PermissionSerializer


class UserRoleViewSet(BaseERPModelViewSet):
    queryset = UserRole.objects.all()
    serializer_class = UserRoleSerializer


class RolePermissionViewSet(BaseERPModelViewSet):
    queryset = RolePermission.objects.all()
    serializer_class = RolePermissionSerializer


class RoleHierarchyViewSet(BaseERPModelViewSet):
    queryset = RoleHierarchy.objects.all()
    serializer_class = RoleHierarchySerializer


class DataScopePolicyViewSet(BaseERPModelViewSet):
    queryset = DataScopePolicy.objects.all()
    serializer_class = DataScopePolicySerializer


class RoleDataScopeViewSet(BaseERPModelViewSet):
    queryset = RoleDataScope.objects.all()
    serializer_class = RoleDataScopeSerializer


class FieldPermissionViewSet(BaseERPModelViewSet):
    queryset = FieldPermission.objects.all()
    serializer_class = FieldPermissionSerializer


class InformationShareRuleViewSet(BaseERPModelViewSet):
    queryset = InformationShareRule.objects.all()
    serializer_class = InformationShareRuleSerializer


class ApprovalLimitViewSet(BaseERPModelViewSet):
    queryset = ApprovalLimit.objects.all()
    serializer_class = ApprovalLimitSerializer


class UserProjectAccessViewSet(BaseERPModelViewSet):
    queryset = UserProjectAccess.objects.all()
    serializer_class = UserProjectAccessSerializer



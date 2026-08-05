from rest_framework.routers import DefaultRouter
from .viewsets import UserViewSet, RoleViewSet, PermissionViewSet, UserRoleViewSet, RolePermissionViewSet, RoleHierarchyViewSet, DataScopePolicyViewSet, RoleDataScopeViewSet, FieldPermissionViewSet, InformationShareRuleViewSet, ApprovalLimitViewSet, UserProjectAccessViewSet

app_name = "accounts"
router = DefaultRouter()
router.register(r"users", UserViewSet, basename="user")
router.register(r"roles", RoleViewSet, basename="role")
router.register(r"permissions", PermissionViewSet, basename="permission")
router.register(r"user-roles", UserRoleViewSet, basename="user-role")
router.register(r"role-permissions", RolePermissionViewSet, basename="role-permission")
router.register(r"role-hierarchies", RoleHierarchyViewSet, basename="role-hierarchy")
router.register(r"data-scope-policies", DataScopePolicyViewSet, basename="data-scope-policy")
router.register(r"role-data-scopes", RoleDataScopeViewSet, basename="role-data-scope")
router.register(r"field-permissions", FieldPermissionViewSet, basename="field-permission")
router.register(r"information-share-rules", InformationShareRuleViewSet, basename="information-share-rule")
router.register(r"approval-limits", ApprovalLimitViewSet, basename="approval-limit")
router.register(r"user-project-accesses", UserProjectAccessViewSet, basename="user-project-access")

urlpatterns = router.urls

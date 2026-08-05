from rest_framework import serializers
from apps.api_common.serializers import ERPModelSerializer
from apps.accounts.models import User, Role, Permission, UserRole, RolePermission, RoleHierarchy, DataScopePolicy, RoleDataScope, FieldPermission, InformationShareRule, ApprovalLimit, UserProjectAccess

class UserSerializer(ERPModelSerializer):
    password = serializers.CharField(write_only=True, required=False)

    class Meta:
        model = User
        fields = "__all__"
        extra_kwargs = {"password": {"write_only": True}}

    def validate(self, attrs):
        attrs = super().validate(attrs)
        request = self.context.get("request")
        if request and request.user.is_authenticated and not request.user.is_superuser:
            for field in ("is_staff", "is_superuser", "tenant", "groups", "user_permissions"):
                if field in attrs:
                    raise serializers.ValidationError({field: "Hanya superuser yang dapat mengubah field ini."})
        return attrs

    def create(self, validated_data):
        password = validated_data.pop("password", None)
        user = User(**validated_data)
        if password:
            user.set_password(password)
        else:
            user.set_unusable_password()
        user.save()
        return user

    def update(self, instance, validated_data):
        password = validated_data.pop("password", None)
        for key, value in validated_data.items():
            setattr(instance, key, value)
        if password:
            instance.set_password(password)
        instance.save()
        return instance


class RoleSerializer(ERPModelSerializer):
    class Meta:
        model = Role
        fields = "__all__"


class PermissionSerializer(ERPModelSerializer):
    class Meta:
        model = Permission
        fields = "__all__"


class UserRoleSerializer(ERPModelSerializer):
    class Meta:
        model = UserRole
        fields = "__all__"


class RolePermissionSerializer(ERPModelSerializer):
    class Meta:
        model = RolePermission
        fields = "__all__"


class RoleHierarchySerializer(ERPModelSerializer):
    class Meta:
        model = RoleHierarchy
        fields = "__all__"


class DataScopePolicySerializer(ERPModelSerializer):
    class Meta:
        model = DataScopePolicy
        fields = "__all__"


class RoleDataScopeSerializer(ERPModelSerializer):
    class Meta:
        model = RoleDataScope
        fields = "__all__"


class FieldPermissionSerializer(ERPModelSerializer):
    class Meta:
        model = FieldPermission
        fields = "__all__"


class InformationShareRuleSerializer(ERPModelSerializer):
    class Meta:
        model = InformationShareRule
        fields = "__all__"


class ApprovalLimitSerializer(ERPModelSerializer):
    class Meta:
        model = ApprovalLimit
        fields = "__all__"


class UserProjectAccessSerializer(ERPModelSerializer):
    class Meta:
        model = UserProjectAccess
        fields = "__all__"



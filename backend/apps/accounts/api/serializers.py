from django.db import transaction
from rest_framework import serializers

from apps.api_common.serializers import ERPModelSerializer
from apps.accounts.models import (
    User,
    Role,
    Permission,
    UserRole,
    RolePermission,
    RoleHierarchy,
    DataScopePolicy,
    RoleDataScope,
    FieldPermission,
    InformationShareRule,
    ApprovalLimit,
    UserProjectAccess,
)


class UserSerializer(ERPModelSerializer):
    password = serializers.CharField(
        write_only=True,
        required=False,
        allow_blank=False,
        min_length=8,
        trim_whitespace=False,
    )

    class Meta:
        model = User
        fields = "__all__"
        extra_kwargs = {
            "password": {
                "write_only": True,
            },
        }

    def validate(self, attrs):
        attrs = super().validate(attrs)

        request = self.context.get("request")
        user = getattr(request, "user", None)

        protected_fields = (
            "is_staff",
            "is_superuser",
            "tenant",
            "groups",
            "user_permissions",
        )

        if (
            user
            and user.is_authenticated
            and not user.is_superuser
        ):
            errors = {}

            for field in protected_fields:
                if field in attrs:
                    errors[field] = (
                        "Hanya superuser yang dapat mengubah "
                        "field ini."
                    )

            if errors:
                raise serializers.ValidationError(errors)

        return attrs

    @transaction.atomic
    def create(self, validated_data):
        password = validated_data.pop("password", None)

        # Many-to-Many tidak boleh dimasukkan langsung ke User(...)
        groups = validated_data.pop("groups", [])
        user_permissions = validated_data.pop(
            "user_permissions",
            [],
        )

        user = User(**validated_data)

        if password:
            user.set_password(password)
        else:
            user.set_unusable_password()

        user.save()

        if groups:
            user.groups.set(groups)

        if user_permissions:
            user.user_permissions.set(user_permissions)

        return user

    @transaction.atomic
    def update(self, instance, validated_data):
        password = validated_data.pop("password", None)

        # None berarti field tidak dikirim.
        # List kosong berarti relasi memang ingin dikosongkan.
        groups = validated_data.pop("groups", None)
        user_permissions = validated_data.pop(
            "user_permissions",
            None,
        )

        for field_name, value in validated_data.items():
            setattr(instance, field_name, value)

        if password:
            instance.set_password(password)

        instance.save()

        if groups is not None:
            instance.groups.set(groups)

        if user_permissions is not None:
            instance.user_permissions.set(
                user_permissions,
            )

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
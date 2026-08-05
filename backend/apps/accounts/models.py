"""
Generated Django models for Identity and Access Management.

Source: ERP Database ERD — 100% Information Architecture, 3 August 2026.
Review nullability, choices, indexes, and on_delete policies before production rollout.
"""

import uuid

from django.db import models

from django.contrib.auth.base_user import AbstractBaseUser, BaseUserManager
from django.contrib.auth.models import PermissionsMixin
from django.utils import timezone


class UserManager(BaseUserManager):
    use_in_migrations = True

    def create_user(self, email, password=None, **extra_fields):
        if not email:
            raise ValueError("Email wajib diisi.")
        email = self.normalize_email(email).lower().strip()
        username = extra_fields.get("username") or email
        extra_fields["username"] = username
        user = self.model(email=email, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        extra_fields.setdefault("is_active", True)
        extra_fields.setdefault("status", "ACTIVE")
        if extra_fields.get("is_staff") is not True:
            raise ValueError("Superuser harus memiliki is_staff=True.")
        if extra_fields.get("is_superuser") is not True:
            raise ValueError("Superuser harus memiliki is_superuser=True.")
        return self.create_user(email, password, **extra_fields)


class User(AbstractBaseUser, PermissionsMixin):
    """Django authentication user mapped to the IAM_USER entity."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(
        "core.Tenant",
        on_delete=models.PROTECT,
        db_column="tenant_id",
        related_name="accounts_user_tenant_set",
        null=True,
        blank=True,
    )
    username = models.CharField(max_length=255, unique=True)
    email = models.EmailField(max_length=255, unique=True)
    password = models.CharField(max_length=128, db_column="password_hash")
    full_name = models.CharField(max_length=255, blank=True, default="")
    status = models.CharField(max_length=255, blank=True, default="ACTIVE")
    last_login = models.DateTimeField(
        "last login",
        null=True,
        blank=True,
        db_column="last_login_at",
    )

    @property
    def last_login_at(self):
        return self.last_login

    @last_login_at.setter
    def last_login_at(self, value):
        self.last_login = value

    # Framework fields required by Django admin/auth.
    is_staff = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    date_joined = models.DateTimeField(default=timezone.now)

    objects = UserManager()

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = ["username"]

    class Meta:
        db_table = "iam_user"
        verbose_name = "User"
        verbose_name_plural = "Users"

    def __str__(self):
        return self.email


class Role(models.Model):
    """ERD entity: IAM_ROLE."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey("core.Tenant", on_delete=models.PROTECT, db_column="tenant_id", related_name="accounts_role_tenant_set", null=True, blank=True)
    role_code = models.CharField(max_length=255, blank=True, default="")
    role_name = models.CharField(max_length=255, blank=True, default="")
    description = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        db_table = "iam_role"

    def __str__(self):
        return str(self.role_name)


class Permission(models.Model):
    """ERD entity: IAM_PERMISSION."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    permission_code = models.CharField(max_length=255, unique=True, blank=True, default="")
    module_code = models.CharField(max_length=255, blank=True, default="")
    resource_name = models.CharField(max_length=255, blank=True, default="")
    action_name = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        db_table = "iam_permission"

    def __str__(self):
        return str(self.permission_code)


class UserRole(models.Model):
    """ERD entity: IAM_USER_ROLE."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey("accounts.User", on_delete=models.PROTECT, db_column="user_id", related_name="accounts_userrole_user_set", null=True, blank=True)
    role = models.ForeignKey("accounts.Role", on_delete=models.PROTECT, db_column="role_id", related_name="accounts_userrole_role_set", null=True, blank=True)
    company = models.ForeignKey("core.Company", on_delete=models.PROTECT, db_column="company_id", related_name="accounts_userrole_company_set", null=True, blank=True)
    organization = models.ForeignKey("core.Organization", on_delete=models.PROTECT, db_column="organization_id", related_name="accounts_userrole_organization_set", null=True, blank=True)

    class Meta:
        db_table = "iam_user_role"

    def __str__(self):
        return str(self.id)


class RolePermission(models.Model):
    """ERD entity: IAM_ROLE_PERMISSION."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    role = models.ForeignKey("accounts.Role", on_delete=models.PROTECT, db_column="role_id", related_name="accounts_rolepermission_role_set", null=True, blank=True)
    permission = models.ForeignKey("accounts.Permission", on_delete=models.PROTECT, db_column="permission_id", related_name="accounts_rolepermission_permission_set", null=True, blank=True)
    allowed = models.BooleanField(default=False)

    class Meta:
        db_table = "iam_role_permission"

    def __str__(self):
        return str(self.id)


class RoleHierarchy(models.Model):
    """ERD entity: IAM_ROLE_HIERARCHY."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    parent_role = models.ForeignKey("accounts.Role", on_delete=models.PROTECT, db_column="parent_role_id", related_name="accounts_rolehierarchy_parent_role_set", null=True, blank=True)
    child_role = models.ForeignKey("accounts.Role", on_delete=models.PROTECT, db_column="child_role_id", related_name="accounts_rolehierarchy_child_role_set", null=True, blank=True)
    inheritance_mode = models.CharField(max_length=255, blank=True, default="")
    active = models.BooleanField(default=False)

    class Meta:
        db_table = "iam_role_hierarchy"

    def __str__(self):
        return str(self.id)


class DataScopePolicy(models.Model):
    """ERD entity: IAM_DATA_SCOPE_POLICY."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey("core.Tenant", on_delete=models.PROTECT, db_column="tenant_id", related_name="accounts_datascopepolicy_tenant_set", null=True, blank=True)
    policy_code = models.CharField(max_length=255, unique=True, blank=True, default="")
    module_code = models.CharField(max_length=255, blank=True, default="")
    entity_name = models.CharField(max_length=255, blank=True, default="")
    scope_type = models.CharField(max_length=255, blank=True, default="")
    condition_json = models.JSONField(default=dict, blank=True)
    active = models.BooleanField(default=False)

    class Meta:
        db_table = "iam_data_scope_policy"

    def __str__(self):
        return str(self.id)


class RoleDataScope(models.Model):
    """ERD entity: IAM_ROLE_DATA_SCOPE."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    role = models.ForeignKey("accounts.Role", on_delete=models.PROTECT, db_column="role_id", related_name="accounts_roledatascope_role_set", null=True, blank=True)
    policy = models.ForeignKey("accounts.DataScopePolicy", on_delete=models.PROTECT, db_column="policy_id", related_name="accounts_roledatascope_policy_set", null=True, blank=True)
    access_level = models.CharField(max_length=255, blank=True, default="")
    can_export = models.BooleanField(default=False)
    can_share = models.BooleanField(default=False)

    class Meta:
        db_table = "iam_role_data_scope"

    def __str__(self):
        return str(self.id)


class FieldPermission(models.Model):
    """ERD entity: IAM_FIELD_PERMISSION."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    role = models.ForeignKey("accounts.Role", on_delete=models.PROTECT, db_column="role_id", related_name="accounts_fieldpermission_role_set", null=True, blank=True)
    module_code = models.CharField(max_length=255, blank=True, default="")
    entity_name = models.CharField(max_length=255, blank=True, default="")
    field_name = models.CharField(max_length=255, blank=True, default="")
    can_view = models.BooleanField(default=False)
    can_edit = models.BooleanField(default=False)
    masking_type = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        db_table = "iam_field_permission"

    def __str__(self):
        return str(self.id)


class InformationShareRule(models.Model):
    """ERD entity: IAM_INFORMATION_SHARE_RULE."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey("core.Tenant", on_delete=models.PROTECT, db_column="tenant_id", related_name="accounts_informationsharerule_tenant_set", null=True, blank=True)
    source_module_code = models.CharField(max_length=255, blank=True, default="")
    target_module_code = models.CharField(max_length=255, blank=True, default="")
    entity_name = models.CharField(max_length=255, blank=True, default="")
    field_set_code = models.CharField(max_length=255, blank=True, default="")
    share_direction = models.CharField(max_length=255, blank=True, default="")
    filter_json = models.JSONField(default=dict, blank=True)
    access_level = models.CharField(max_length=255, blank=True, default="")
    active = models.BooleanField(default=False)

    class Meta:
        db_table = "iam_information_share_rule"

    def __str__(self):
        return str(self.id)


class ApprovalLimit(models.Model):
    """ERD entity: IAM_APPROVAL_LIMIT."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    role = models.ForeignKey("accounts.Role", on_delete=models.PROTECT, db_column="role_id", related_name="accounts_approvallimit_role_set", null=True, blank=True)
    user = models.ForeignKey("accounts.User", on_delete=models.PROTECT, db_column="user_id", related_name="accounts_approvallimit_user_set", null=True, blank=True)
    currency = models.ForeignKey("master_data.Currency", on_delete=models.PROTECT, db_column="currency_id", related_name="accounts_approvallimit_currency_set", null=True, blank=True)
    approval_type = models.CharField(max_length=255, blank=True, default="")
    minimum_amount = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    maximum_amount = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    active = models.BooleanField(default=False)

    class Meta:
        db_table = "iam_approval_limit"

    def __str__(self):
        return str(self.id)


class UserProjectAccess(models.Model):
    """ERD entity: IAM_USER_PROJECT_ACCESS."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey("accounts.User", on_delete=models.PROTECT, db_column="user_id", related_name="accounts_userprojectaccess_user_set", null=True, blank=True)
    project = models.ForeignKey("projects.Project", on_delete=models.PROTECT, db_column="project_id", related_name="accounts_userprojectaccess_project_set", null=True, blank=True)
    project_role = models.CharField(max_length=255, blank=True, default="")
    access_level = models.CharField(max_length=255, blank=True, default="")
    valid_from = models.DateField(null=True, blank=True)
    valid_to = models.DateField(null=True, blank=True)

    class Meta:
        db_table = "iam_user_project_access"

    def __str__(self):
        return str(self.id)

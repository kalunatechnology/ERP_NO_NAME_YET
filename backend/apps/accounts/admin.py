from django.contrib import admin

from . import models

from django.contrib.auth.admin import UserAdmin as BaseUserAdmin


@admin.register(models.User)
class UserAdmin(BaseUserAdmin):
    ordering = ("email",)
    list_display = ("email", "username", "full_name", "status", "is_active", "is_staff")
    search_fields = ("email", "username", "full_name")
    fieldsets = (
        (None, {"fields": ("email", "username", "password")}),
        ("Profile", {"fields": ("full_name", "tenant", "status")}),
        ("Permissions", {"fields": ("is_active", "is_staff", "is_superuser", "groups", "user_permissions")}),
        ("Activity", {"fields": ("last_login", "date_joined")}),
    )
    add_fieldsets = (
        (None, {
            "classes": ("wide",),
            "fields": ("email", "username", "password1", "password2", "is_active", "is_staff"),
        }),
    )


admin.site.register(models.Role)
admin.site.register(models.Permission)
admin.site.register(models.UserRole)
admin.site.register(models.RolePermission)
admin.site.register(models.RoleHierarchy)
admin.site.register(models.DataScopePolicy)
admin.site.register(models.RoleDataScope)
admin.site.register(models.FieldPermission)
admin.site.register(models.InformationShareRule)
admin.site.register(models.ApprovalLimit)
admin.site.register(models.UserProjectAccess)

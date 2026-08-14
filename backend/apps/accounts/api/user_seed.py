from __future__ import annotations

from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import Q

from drf_spectacular.utils import OpenApiResponse, extend_schema
from rest_framework import permissions, serializers, status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import Role, UserRole
from apps.core.models import Company, Organization, Tenant


User = get_user_model()


class SeedUserItemSerializer(serializers.Serializer):
    username = serializers.CharField(
        max_length=255,
    )
    email = serializers.EmailField()
    password = serializers.CharField(
        write_only=True,
        min_length=8,
    )
    full_name = serializers.CharField(
        required=False,
        allow_blank=True,
        default="",
    )
    status = serializers.CharField(
        required=False,
        default="ACTIVE",
    )
    is_active = serializers.BooleanField(
        required=False,
        default=True,
    )

    tenant = serializers.PrimaryKeyRelatedField(
        queryset=Tenant.objects.all(),
        required=False,
        allow_null=True,
    )
    role = serializers.PrimaryKeyRelatedField(
        queryset=Role.objects.all(),
        required=False,
        allow_null=True,
    )
    company = serializers.PrimaryKeyRelatedField(
        queryset=Company.objects.all(),
        required=False,
        allow_null=True,
    )
    organization = serializers.PrimaryKeyRelatedField(
        queryset=Organization.objects.all(),
        required=False,
        allow_null=True,
    )

    def validate(self, attrs):
        tenant = attrs.get("tenant")
        role = attrs.get("role")
        company = attrs.get("company")
        organization = attrs.get("organization")

        if (
            role
            and tenant
            and role.tenant_id
            and role.tenant_id != tenant.id
        ):
            raise serializers.ValidationError({
                "role": (
                    "Role tidak berada pada tenant "
                    "yang sama dengan user."
                )
            })

        if (
            company
            and tenant
            and company.tenant_id != tenant.id
        ):
            raise serializers.ValidationError({
                "company": (
                    "Company tidak berada pada tenant "
                    "yang sama dengan user."
                )
            })

        if (
            organization
            and company
            and organization.company_id
            and organization.company_id != company.id
        ):
            raise serializers.ValidationError({
                "organization": (
                    "Organization tidak berada pada "
                    "company yang dipilih."
                )
            })

        return attrs


class SeedUsersRequestSerializer(serializers.Serializer):
    update_existing = serializers.BooleanField(
        required=False,
        default=False,
    )
    users = SeedUserItemSerializer(
        many=True,
        min_length=1,
        max_length=100,
    )


class SeedUserResultSerializer(serializers.Serializer):
    id = serializers.UUIDField(
        allow_null=True,
    )
    username = serializers.CharField()
    email = serializers.EmailField()
    action = serializers.ChoiceField(
        choices=[
            "CREATED",
            "UPDATED",
            "SKIPPED",
        ]
    )
    detail = serializers.CharField(
        required=False,
        allow_blank=True,
    )


class SeedUsersResponseSerializer(serializers.Serializer):
    success = serializers.BooleanField()
    created = serializers.IntegerField()
    updated = serializers.IntegerField()
    skipped = serializers.IntegerField()
    results = SeedUserResultSerializer(
        many=True,
    )


class SeedUsersView(APIView):
    permission_classes = [
        permissions.IsAdminUser,
    ]

    @extend_schema(
        tags=["Development Seed"],
        summary="Seed dummy ERP users",
        description=(
            "Membuat user dummy dan optional UserRole. "
            "Endpoint ini hanya untuk development."
        ),
        request=SeedUsersRequestSerializer,
        responses={
            201: SeedUsersResponseSerializer,
            200: SeedUsersResponseSerializer,
            400: OpenApiResponse(
                description="Payload dummy user tidak valid.",
            ),
            403: OpenApiResponse(
                description="Hanya admin yang boleh menjalankan seed.",
            ),
        },
    )
    @transaction.atomic
    def post(self, request):
        serializer = SeedUsersRequestSerializer(
            data=request.data,
        )
        serializer.is_valid(
            raise_exception=True,
        )

        update_existing = serializer.validated_data[
            "update_existing"
        ]

        created_count = 0
        updated_count = 0
        skipped_count = 0
        results = []

        for payload in serializer.validated_data["users"]:
            role = payload.pop("role", None)
            company = payload.pop("company", None)
            organization = payload.pop(
                "organization",
                None,
            )
            password = payload.pop("password")

            # Remove identity fields before passing the remaining payload to
            # User(...); otherwise username/email are supplied twice.
            username = payload.pop("username").strip()
            email = payload.pop("email").strip().lower()

            existing = (
                User.objects.filter(
                    Q(username__iexact=username)
                    | Q(email__iexact=email)
                )
                .first()
            )

            if existing and not update_existing:
                skipped_count += 1
                results.append({
                    "id": existing.id,
                    "username": existing.username,
                    "email": existing.email,
                    "action": "SKIPPED",
                    "detail": (
                        "Username atau email sudah digunakan."
                    ),
                })
                continue

            if existing and existing.is_superuser:
                skipped_count += 1
                results.append({
                    "id": existing.id,
                    "username": existing.username,
                    "email": existing.email,
                    "action": "SKIPPED",
                    "detail": (
                        "Superuser tidak boleh diubah "
                        "melalui dummy seed."
                    ),
                })
                continue

            if existing:
                user = existing

                for field, value in payload.items():
                    setattr(user, field, value)

                user.username = username
                user.email = email
                user.is_staff = False
                user.is_superuser = False
                user.set_password(password)
                user.save()

                action = "UPDATED"
                updated_count += 1
            else:
                user = User(
                    **payload,
                    username=username,
                    email=email,
                    is_staff=False,
                    is_superuser=False,
                )
                user.set_password(password)
                user.save()

                action = "CREATED"
                created_count += 1

            if role:
                UserRole.objects.get_or_create(
                    user=user,
                    role=role,
                    company=company,
                    organization=organization,
                )

            results.append({
                "id": user.id,
                "username": user.username,
                "email": user.email,
                "action": action,
                "detail": "",
            })

        response_status = (
            status.HTTP_201_CREATED
            if created_count
            else status.HTTP_200_OK
        )

        return Response(
            {
                "success": True,
                "created": created_count,
                "updated": updated_count,
                "skipped": skipped_count,
                "results": results,
            },
            status=response_status,
        )

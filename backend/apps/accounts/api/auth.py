from __future__ import annotations

from django.contrib.auth import update_session_auth_hash
from rest_framework import permissions, serializers, status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView

from apps.accounts.models import UserRole
from .serializers import UserSerializer


class ERPTokenObtainPairSerializer(TokenObtainPairSerializer):
    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        token["email"] = user.email
        token["full_name"] = user.full_name
        token["tenant_id"] = str(user.tenant_id) if user.tenant_id else None
        token["roles"] = list(
            UserRole.objects.filter(user=user)
            .exclude(role_id__isnull=True)
            .values_list("role__role_code", flat=True)
            .distinct()
        )
        return token

    def validate(self, attrs):
        data = super().validate(attrs)
        data["user"] = UserSerializer(self.user, context=self.context).data
        return data


class ERPTokenObtainPairView(TokenObtainPairView):
    serializer_class = ERPTokenObtainPairSerializer
    permission_classes = [permissions.AllowAny]


class CurrentUserView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        roles = UserRole.objects.filter(user=request.user).select_related("role", "company", "organization")
        return Response(
            {
                "user": UserSerializer(request.user, context={"request": request}).data,
                "roles": [
                    {
                        "id": str(item.id),
                        "role_id": str(item.role_id) if item.role_id else None,
                        "role_code": item.role.role_code if item.role else None,
                        "role_name": item.role.role_name if item.role else None,
                        "company_id": str(item.company_id) if item.company_id else None,
                        "organization_id": str(item.organization_id) if item.organization_id else None,
                    }
                    for item in roles
                ],
            }
        )


class LogoutSerializer(serializers.Serializer):
    refresh = serializers.CharField()


class LogoutView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        serializer = LogoutSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        token = RefreshToken(serializer.validated_data["refresh"])
        try:
            token.blacklist()
        except AttributeError:
            return Response(
                {"detail": "Aktifkan rest_framework_simplejwt.token_blacklist untuk blacklist token."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response(status=status.HTTP_204_NO_CONTENT)


class ChangePasswordSerializer(serializers.Serializer):
    current_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True, min_length=8)

    def validate_current_password(self, value):
        user = self.context["request"].user
        if not user.check_password(value):
            raise serializers.ValidationError("Password saat ini tidak sesuai.")
        return value


class ChangePasswordView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        serializer = ChangePasswordSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        request.user.set_password(serializer.validated_data["new_password"])
        request.user.save(update_fields=["password"])
        update_session_auth_hash(request, request.user)
        return Response({"detail": "Password berhasil diubah."})

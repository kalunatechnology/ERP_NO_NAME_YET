from drf_spectacular.utils import extend_schema
from django.db import connection
from rest_framework import serializers
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView


class HealthResponseSerializer(serializers.Serializer):
    status = serializers.CharField()
    database = serializers.CharField()


class HealthView(APIView):
    permission_classes = [AllowAny]

    @extend_schema(
        responses={
            200: HealthResponseSerializer,
            503: HealthResponseSerializer,
        },
        tags=["System"],
        summary="Check API and database health",
        auth=[],
    )
    def get(self, request):
        try:
            with connection.cursor() as cursor:
                cursor.execute("SELECT 1")
                cursor.fetchone()
        except Exception:
            return Response(
                {"status": "unavailable", "database": "error"},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        return Response({"status": "ok", "database": "ok"})

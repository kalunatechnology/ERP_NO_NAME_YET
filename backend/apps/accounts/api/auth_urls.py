from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView, TokenVerifyView

from .auth import ChangePasswordView, CurrentUserView, ERPTokenObtainPairView, LogoutView, SignupView


app_name = "auth"

urlpatterns = [
    path("token/", ERPTokenObtainPairView.as_view(), name="token-obtain-pair"),
    path("token/refresh/", TokenRefreshView.as_view(), name="token-refresh"),
    path("token/verify/", TokenVerifyView.as_view(), name="token-verify"),
    path("signup/", SignupView.as_view(), name="signup"),
    path("register/", SignupView.as_view(), name="register"),
    path("me/", CurrentUserView.as_view(), name="current-user"),
    path("logout/", LogoutView.as_view(), name="logout"),
    path("change-password/", ChangePasswordView.as_view(), name="change-password"),
]

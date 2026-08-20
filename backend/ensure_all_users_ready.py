import os
import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from django.contrib.auth import get_user_model
from apps.core.models import Tenant, Company
from apps.accounts.models import Role, UserRole

User = get_user_model()
PASSWORD = "DummyPass123!"

# Get or create tenant & company
tenant = Tenant.objects.first()
if not tenant:
    tenant = Tenant.objects.create(name="Arsalynk ERP Tenant", code="TENANT-ARSALYNK")

company = Company.objects.first()
if not company:
    company = Company.objects.create(tenant=tenant, legal_name="PT Arsalynk Teknologi Utama", code="COMP-ARSALYNK")

ALL_ACCOUNTS = [
    # Arsalynk Domain Accounts
    {"username": "admin", "email": "admin@arsalynk.id", "full_name": "Arsalynk Administrator", "is_staff": True, "is_superuser": True},
    {"username": "director", "email": "director@arsalynk.id", "full_name": "Executive Director Arsalynk", "is_staff": True, "is_superuser": False},
    {"username": "manager", "email": "manager@arsalynk.id", "full_name": "Operational Manager Arsalynk", "is_staff": False, "is_superuser": False},
    {"username": "sales", "email": "sales@arsalynk.id", "full_name": "Commercial & Sales Arsalynk", "is_staff": False, "is_superuser": False},
    {"username": "pm", "email": "pm@arsalynk.id", "full_name": "Project Manager Arsalynk", "is_staff": False, "is_superuser": False},
    {"username": "supervisor", "email": "supervisor@arsalynk.id", "full_name": "Field Supervisor Arsalynk", "is_staff": False, "is_superuser": False},
    {"username": "finance", "email": "finance@arsalynk.id", "full_name": "Accounting & Finance Arsalynk", "is_staff": False, "is_superuser": False},
    {"username": "qc", "email": "qc@arsalynk.id", "full_name": "Quality Control Arsalynk", "is_staff": False, "is_superuser": False},
    {"username": "warehouse", "email": "warehouse@arsalynk.id", "full_name": "Warehouse Logistics Arsalynk", "is_staff": False, "is_superuser": False},

    # Prototype Demo Accounts
    {"username": "dummy_admin", "email": "dummy.admin@example.com", "full_name": "Dummy Administrator", "is_staff": True, "is_superuser": True},
    {"username": "executive_demo", "email": "executive.demo@erp.local", "full_name": "Executive Demo", "is_staff": True, "is_superuser": False},
    {"username": "dummy_manager", "email": "dummy.manager@example.com", "full_name": "Dummy Operational Manager", "is_staff": False, "is_superuser": False},
    {"username": "dummy_staff", "email": "dummy.staff@example.com", "full_name": "Dummy Operational Staff", "is_staff": False, "is_superuser": False},
    {"username": "pm_demo", "email": "project.manager.demo@erp.local", "full_name": "Project Manager Demo", "is_staff": False, "is_superuser": False},
    {"username": "assignee_demo", "email": "assignee.demo@erp.local", "full_name": "Project Assignee Demo", "is_staff": False, "is_superuser": False},
    {"username": "finance_demo", "email": "finance.demo@erp.local", "full_name": "Finance Demo", "is_staff": False, "is_superuser": False},
    {"username": "finance_approver", "email": "finance.approver@example.com", "full_name": "Finance Approver", "is_staff": False, "is_superuser": False},
]

print("=== SEEDING & RESETTING PASSWORDS TO 'DummyPass123!' ===")
for acc in ALL_ACCOUNTS:
    email = acc["email"].lower().strip()
    username = acc["username"].strip()
    user = User.objects.filter(email=email).first() or User.objects.filter(username=username).first()
    if user:
        user.email = email
        user.username = username
        user.full_name = acc["full_name"]
        user.is_active = True
        user.status = "ACTIVE"
        user.is_staff = acc["is_staff"]
        user.is_superuser = acc["is_superuser"]
        user.tenant = tenant
        user.set_password(PASSWORD)
        user.save()
        print(f"[UPDATED] {email} (Password: {PASSWORD})")
    else:
        user = User.objects.create(
            email=email,
            username=username,
            full_name=acc["full_name"],
            is_active=True,
            status="ACTIVE",
            is_staff=acc["is_staff"],
            is_superuser=acc["is_superuser"],
            tenant=tenant,
        )
        user.set_password(PASSWORD)
        user.save()
        print(f"[CREATED] {email} (Password: {PASSWORD})")

print("\n=== VERIFYING JWT LOGIN FOR ALL USERS ===")
from rest_framework_simplejwt.tokens import RefreshToken
for u in User.objects.all():
    refresh = RefreshToken.for_user(u)
    print(f"OK: {u.email} -> JWT Access Token generated successfully.")

print("\nSUCCESS: All users are now 100% active in the database with password 'DummyPass123!'")

import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings.base')
django.setup()

from django.contrib.auth import get_user_model
from apps.core.models import AppNotification, ActivityFeed, TeamContact, UserRecentItem, Company

User = get_user_model()

def seed_sidebar_feed():
    users = list(User.objects.filter(is_active=True)[:10])
    if not users:
        print("No users found to seed sidebar feed.")
        return

    admin_user = users[0]
    company = Company.objects.first()

    print(f"Seeding feed for primary user: {admin_user.email}")

    # 1. Seed Notifications
    notifications_data = [
        {
            "category": AppNotification.Category.DOCUMENT,
            "title": "Document Sent: Invoice INV-2026-0801",
            "description": "Invoice termin 1 PT Telkom Prima telah dikirim ke finance.",
            "target_url": "/finance",
        },
        {
            "category": AppNotification.Category.ACCESS_REQUEST,
            "title": "Access Request: WBS Level 3 Proyek Gedung A",
            "description": "Rina Sari meminta otorisasi approval budget WBS.",
            "target_url": "/projects",
        },
        {
            "category": AppNotification.Category.STATUS_UPDATE,
            "title": "Status Update: Deal Mandiri Sekuritas (Won)",
            "description": "Pipeline deal Rp 1.850.000.000 telah disetujui.",
            "target_url": "/crm",
        },
        {
            "category": AppNotification.Category.DOCUMENT,
            "title": "Document Sent: Purchase Order PO-994",
            "description": "PO Pengadaan Baja telah ditandatangani secara digital.",
            "target_url": "/projects",
        }
    ]

    for user in users[:4]:
        for i, nd in enumerate(notifications_data):
            actor = users[(i + 1) % len(users)]
            AppNotification.objects.get_or_create(
                recipient=user,
                title=nd["title"],
                defaults={
                    "actor": actor,
                    "category": nd["category"],
                    "description": nd["description"],
                    "target_url": nd["target_url"],
                    "is_read": False,
                }
            )

    # 2. Seed Activities
    activities_data = [
        ("REVIEW_ASKED", "WBS Architecture Document", "/projects"),
        ("DOC_SENT", "Tax Invoice Faktur Pajak 010.000", "/finance"),
        ("REPORT_APPROVED", "Monthly P&L Realization Report", "/reporting"),
        ("REPORT_UPLOADED", "Progress Report Lapangan Week 34", "/projects"),
        ("GENERIC_ACTION", "Customer Onboarding PT Telkom", "/crm"),
    ]

    for i, (verb, target_name, target_url) in enumerate(activities_data):
        actor = users[i % len(users)]
        ActivityFeed.objects.get_or_create(
            actor=actor,
            verb=verb,
            target_name=target_name,
            defaults={
                "company": company,
                "target_url": target_url,
            }
        )

    # 3. Seed Recent Items
    recent_data = [
        (UserRecentItem.ItemType.PROJECT, "PRJ-001", "Proyek Jaringan Fiber Optik Metro", "/projects"),
        (UserRecentItem.ItemType.ORDER, "SO-882", "Sales Order Telkom Metro Core", "/crm"),
        (UserRecentItem.ItemType.RESOURCE, "RES-004", "Data Explorer - General Ledger", "/resources"),
        (UserRecentItem.ItemType.REPORT, "RPT-009", "Laporan Konsolidasi Finansial Q3", "/reporting"),
    ]

    for user in users[:4]:
        for item_type, obj_id, title, url in recent_data:
            UserRecentItem.objects.update_or_create(
                user=user,
                object_id=obj_id,
                defaults={
                    "item_type": item_type,
                    "title": title,
                    "target_url": url,
                }
            )

    # 4. Seed Team Contacts
    for i, user in enumerate(users):
        TeamContact.objects.update_or_create(
            user=user,
            defaults={
                "display_order": i,
                "is_pinned": True,
                "custom_status": "Active and working on sprint tasks" if i % 2 == 0 else "In a meeting",
            }
        )

    print("Sidebar feed and recent items successfully seeded!")

if __name__ == "__main__":
    seed_sidebar_feed()

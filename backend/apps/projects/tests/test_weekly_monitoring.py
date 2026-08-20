from datetime import timedelta
from decimal import Decimal
from django.test import TestCase
from django.utils import timezone
from apps.accounts.models import User, Role, UserRole
from apps.core.models import Company, Tenant
from apps.projects.models import Project, Task, ProjectWeeklyProgress
from apps.projects.weekly_monitoring import (
    WeeklyMonitoringFactory,
    ArsalynkWeeklyMonitoringStrategy,
    DefaultProjectMonitoringStrategy,
)


class WeeklyMonitoringTestCase(TestCase):
    def setUp(self):
        self.tenant_arsalynk = Tenant.objects.create(name="Arsalynk Technology", code="arsalynk")
        self.tenant_other = Tenant.objects.create(name="Other Corp", code="othercorp")

        self.company = Company.objects.create(
            tenant=self.tenant_arsalynk,
            legal_name="PT Arsalynk Technology",
            company_code="CMP-ARSALYNK",
        )

        self.pm_user = User.objects.create_user(
            username="pm@arsalynk.id",
            email="pm@arsalynk.id",
            password="password123",
            first_name="Arsalynk",
            last_name="PM",
        )
        self.pm_role = Role.objects.create(role_code="PROJECT_MANAGER", role_name="Project Manager")
        UserRole.objects.create(user=self.pm_user, role=self.pm_role)

        today = timezone.localdate()
        self.project_arsalynk = Project.objects.create(
            tenant=self.tenant_arsalynk,
            company=self.company,
            project_code="PRJ-ARS-001",
            project_name="Arsalynk ERP Implementation",
            project_manager=self.pm_user,
            planned_start_date=today,
            planned_end_date=today + timedelta(days=27),  # 4 weeks (28 days)
            budget_amount=Decimal("100000000"),
            progress_percent=Decimal("0"),
            status="IN_PROGRESS",
            lifecycle_status="IN_PROGRESS",
        )

        self.project_other = Project.objects.create(
            tenant=self.tenant_other,
            company=self.company,
            project_code="PRJ-OTH-001",
            project_name="Other Corp Project",
            planned_start_date=today,
            planned_end_date=today + timedelta(days=14),
            progress_percent=Decimal("50"),
            status="IN_PROGRESS",
            lifecycle_status="IN_PROGRESS",
        )

    def test_factory_strategy_resolution(self):
        """Verify Strategy Pattern correctly resolves Arsalynk vs Default."""
        strat_ars = WeeklyMonitoringFactory.get_strategy("arsalynk")
        self.assertIsInstance(strat_ars, ArsalynkWeeklyMonitoringStrategy)

        strat_other = WeeklyMonitoringFactory.get_strategy("othercorp")
        self.assertIsInstance(strat_other, DefaultProjectMonitoringStrategy)

        strat_none = WeeklyMonitoringFactory.get_strategy(None)
        self.assertIsInstance(strat_none, DefaultProjectMonitoringStrategy)

    def test_arsalynk_weekly_schedule_generation(self):
        """Verify 4-week timeline is generated with linear targets."""
        strat = ArsalynkWeeklyMonitoringStrategy()
        summary = strat.get_monitoring_summary(self.project_arsalynk, self.pm_user)

        self.assertTrue(summary["has_weekly_monitoring"])
        self.assertEqual(summary["total_weeks"], 4)
        self.assertEqual(len(summary["history"]), 4)

        # Check target distribution (25%, 50%, 75%, 100%)
        week1 = summary["history"][0]
        self.assertEqual(Decimal(week1["target_progress"]), Decimal("25.00"))
        week4 = summary["history"][3]
        self.assertEqual(Decimal(week4["target_progress"]), Decimal("100.00"))

    def test_progress_calculation_from_tasks(self):
        """Verify task completion and weights calculate actual progress and update weekly snapshot."""
        # Create 2 tasks: Task 1 (50% weight, 100% done), Task 2 (50% weight, 0% done)
        Task.objects.create(
            project=self.project_arsalynk,
            task_code="TSK-01",
            task_name="Module Design",
            weight_percent=Decimal("50.00"),
            progress_percent=Decimal("100.00"),
            status="DONE",
        )
        Task.objects.create(
            project=self.project_arsalynk,
            task_code="TSK-02",
            task_name="Module Build",
            weight_percent=Decimal("50.00"),
            progress_percent=Decimal("0.00"),
            status="PLANNED",
        )

        strat = ArsalynkWeeklyMonitoringStrategy()
        summary = strat.get_monitoring_summary(self.project_arsalynk, self.pm_user)

        # 50% * 100% + 50% * 0% = 50%
        self.assertEqual(Decimal(summary["current_progress"]), Decimal("50.00"))
        self.assertEqual(summary["completed_tasks"], 1)
        self.assertEqual(summary["total_tasks"], 2)

        # Week 1 target was 25%, actual is 50% -> gap is +25% -> ON_TRACK
        self.assertEqual(summary["monitoring_status"], "ON_TRACK")

    def test_recording_weekly_snapshot_review(self):
        """Verify PM can record review notes for a week."""
        strat = ArsalynkWeeklyMonitoringStrategy()
        res = strat.record_weekly_snapshot(
            project=self.project_arsalynk,
            user=self.pm_user,
            data={
                "week_number": 1,
                "notes": "Sprint 1 completed on time.",
                "achievements": "Core DB and Auth setup.",
                "issues": "None so far.",
                "next_week_plan": "Implement project models.",
            },
        )
        self.assertTrue(res["success"])

        wp = ProjectWeeklyProgress.objects.get(project=self.project_arsalynk, week_number=1)
        self.assertEqual(wp.notes, "Sprint 1 completed on time.")
        self.assertEqual(wp.achievements, "Core DB and Auth setup.")
        self.assertEqual(wp.recorded_by, self.pm_user)

    def test_default_strategy_isolation(self):
        """Verify other companies continue using standard progress behavior."""
        strat = DefaultProjectMonitoringStrategy()
        summary = strat.get_monitoring_summary(self.project_other, None)

        self.assertFalse(summary["has_weekly_monitoring"])
        self.assertEqual(summary["tenant_code"], "default")
        self.assertEqual(summary["history"], [])

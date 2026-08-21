from datetime import date, timedelta
from decimal import Decimal
from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from apps.accounts.models import Role, UserRole
from apps.core.models import Company, Tenant
from apps.projects.models import (
    Member,
    Project,
    ProjectDailyTask,
    ProjectMainTask,
    ProjectWeeklyTask,
    TaskActivityLog,
    TaskAssignment,
    TaskTransferRequest,
)
from apps.projects.task_hierarchy_services import (
    direct_reassign_task,
    override_task_progress,
    process_transfer_approval,
    recalculate_task_tree,
)

User = get_user_model()


class HierarchicalTaskTestCase(APITestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(name="Tenant Test", code="TT")
        self.company = Company.objects.create(tenant=self.tenant, legal_name="Company Test", company_code="CT")

        # PM User

        self.pm_user = User.objects.create_user(
            username="pm_user",
            email="pm@example.com",
            password="Password123!",
            tenant=self.tenant,
            full_name="Project Manager User",
        )
        self.pm_role = Role.objects.create(role_code="PROJECT_MANAGER", role_name="Project Manager")
        UserRole.objects.create(user=self.pm_user, role=self.pm_role)

        # Assignee A
        self.assignee_a = User.objects.create_user(
            username="assignee_a",
            email="assignee_a@example.com",
            password="Password123!",
            tenant=self.tenant,
            full_name="Assignee A",
        )

        # Assignee B
        self.assignee_b = User.objects.create_user(
            username="assignee_b",
            email="assignee_b@example.com",
            password="Password123!",
            tenant=self.tenant,
            full_name="Assignee B",
        )

        # Outsider
        self.outsider = User.objects.create_user(
            username="outsider",
            email="outsider@example.com",
            password="Password123!",
            tenant=self.tenant,
            full_name="Outsider User",
        )

        # Project
        self.project = Project.objects.create(
            tenant=self.tenant,
            company=self.company,
            project_code="PRJ-HIER-01",
            project_name="Hierarchical System Prototype",
            project_manager=self.pm_user,
            planned_start_date=date(2026, 8, 1),
            planned_end_date=date(2026, 8, 31),
            status="ACTIVE",
            lifecycle_status="IN_PROGRESS",
        )

        # Memberships
        Member.objects.create(project=self.project, user=self.assignee_a, project_role="ENGINEER", status="ACTIVE")
        Member.objects.create(project=self.project, user=self.assignee_b, project_role="DESIGNER", status="ACTIVE")

    def test_bottom_up_rollup_calculation(self):
        """
        Tests the mathematical bottom-up aggregation:
        Daily Tasks -> Weekly Task (avg) -> Main Task (avg) -> Project (weighted sum).
        """
        # Main Task 1 (weight = 2.0)
        main1 = ProjectMainTask.objects.create(
            project=self.project,
            name="Backend Core Engine",
            priority="HIGH",
            start_date=date(2026, 8, 1),
            due_date=date(2026, 8, 20),
            weight=Decimal("2.0000"),
            created_by=self.pm_user,
        )

        # Main Task 2 (weight = 1.0)
        main2 = ProjectMainTask.objects.create(
            project=self.project,
            name="Frontend Workspace UI",
            priority="MEDIUM",
            start_date=date(2026, 8, 5),
            due_date=date(2026, 8, 25),
            weight=Decimal("1.0000"),
            created_by=self.pm_user,
        )

        # Weekly Task for Main 1
        wk1 = ProjectWeeklyTask.objects.create(
            main_task=main1,
            assignee=self.assignee_a,
            week_number=1,
            start_date=date(2026, 8, 1),
            end_date=date(2026, 8, 7),
            target_description="Models & Rollup Service",
        )

        # Daily Tasks for Wk1: task 1 (100%), task 2 (50%)
        d1 = ProjectDailyTask.objects.create(
            weekly_task=wk1,
            owner=self.assignee_a,
            title="Design Models",
            planned_date=date(2026, 8, 2),
            progress=Decimal("100.00"),
            status="COMPLETED",
        )
        d2 = ProjectDailyTask.objects.create(
            weekly_task=wk1,
            owner=self.assignee_a,
            title="Implement Rollup Engine",
            planned_date=date(2026, 8, 3),
            progress=Decimal("50.00"),
            status="IN_PROGRESS",
        )

        recalculate_task_tree(daily_task=d2)

        wk1.refresh_from_db()
        main1.refresh_from_db()
        self.project.refresh_from_db()

        # Weekly progress = (100 + 50) / 2 = 75.00%
        self.assertEqual(wk1.progress, Decimal("75.00"))
        self.assertEqual(wk1.status, "IN_PROGRESS")

        # Main 1 progress = 75.00%
        self.assertEqual(main1.progress, Decimal("75.00"))

        # Main 2 has 0% progress. Total weighted = (75 * 2 + 0 * 1) / 3 = 150 / 3 = 50.00%
        self.assertEqual(self.project.progress_percent, Decimal("50.00"))

    def test_status_propagation_and_blocked_warning(self):
        """
        When a daily task is marked BLOCKED, parent weekly and main task propagate the warning status.
        """
        main = ProjectMainTask.objects.create(
            project=self.project,
            name="Database Migration",
            start_date=date(2026, 8, 1),
            due_date=date(2026, 8, 10),
            created_by=self.pm_user,
        )
        wk = ProjectWeeklyTask.objects.create(
            main_task=main,
            assignee=self.assignee_a,
            week_number=1,
            start_date=date(2026, 8, 1),
            end_date=date(2026, 8, 7),
        )
        d1 = ProjectDailyTask.objects.create(
            weekly_task=wk,
            owner=self.assignee_a,
            title="Run PostgreSQL Migration",
            planned_date=date(2026, 8, 2),
            progress=Decimal("30.00"),
            status="BLOCKED",
            is_blocked=True,
            block_reason="Database deadlock detected",
        )

        recalculate_task_tree(daily_task=d1)

        wk.refresh_from_db()
        main.refresh_from_db()

        self.assertEqual(wk.status, "BLOCKED")
        self.assertEqual(main.status, "BLOCKED")

    def test_pm_progress_manual_override(self):
        """
        PM manual override holds and is not overwritten by child task arithmetic averages.
        """
        main = ProjectMainTask.objects.create(
            project=self.project,
            name="Third-party Integration",
            start_date=date(2026, 8, 1),
            due_date=date(2026, 8, 10),
            created_by=self.pm_user,
        )
        wk = ProjectWeeklyTask.objects.create(
            main_task=main,
            assignee=self.assignee_a,
            week_number=1,
            start_date=date(2026, 8, 1),
            end_date=date(2026, 8, 7),
        )
        ProjectDailyTask.objects.create(
            weekly_task=wk,
            owner=self.assignee_a,
            title="Setup Webhooks",
            planned_date=date(2026, 8, 2),
            progress=Decimal("10.00"),
        )

        # PM overrides main task progress to 90%
        override_task_progress(main, Decimal("90.00"), self.pm_user, "PM evaluated verified vendor deliverables")
        main.refresh_from_db()
        self.assertTrue(main.is_progress_overridden)
        self.assertEqual(main.progress, Decimal("90.00"))

        # Add another daily task (progress 20%)
        d2 = ProjectDailyTask.objects.create(
            weekly_task=wk,
            owner=self.assignee_a,
            title="Setup Auth",
            planned_date=date(2026, 8, 3),
            progress=Decimal("20.00"),
        )
        recalculate_task_tree(daily_task=d2)

        main.refresh_from_db()
        # Main task progress remains 90% because override is active
        self.assertEqual(main.progress, Decimal("90.00"))

    def test_task_transfer_request_workflow(self):
        """
        Tests Assignee request transfer -> PM approve -> ownership changed + audit logged.
        """
        main = ProjectMainTask.objects.create(
            project=self.project,
            name="Mobile App API",
            start_date=date(2026, 8, 1),
            due_date=date(2026, 8, 10),
            created_by=self.pm_user,
        )
        wk = ProjectWeeklyTask.objects.create(
            main_task=main,
            assignee=self.assignee_a,
            week_number=1,
            start_date=date(2026, 8, 1),
            end_date=date(2026, 8, 7),
        )
        daily = ProjectDailyTask.objects.create(
            weekly_task=wk,
            owner=self.assignee_a,
            title="Auth Endpoints",
            planned_date=date(2026, 8, 3),
            progress=Decimal("40.00"),
        )

        # Assignee A requests transfer to Assignee B
        transfer_req = TaskTransferRequest.objects.create(
            daily_task=daily,
            requested_by=self.assignee_a,
            target_user=self.assignee_b,
            status="PENDING",
            reason="Assignee A assigned to urgent hotfix",
        )

        # PM approves
        process_transfer_approval(transfer_req, approved=True, pm_user=self.pm_user, review_note="Approved by PM")

        transfer_req.refresh_from_db()
        daily.refresh_from_db()

        self.assertEqual(transfer_req.status, "APPROVED")
        self.assertEqual(daily.owner, self.assignee_b)

        # Verify audit activity log
        log_exists = TaskActivityLog.objects.filter(
            project=self.project,
            task_id=daily.id,
            action="TRANSFER_APPROVED",
        ).exists()
        self.assertTrue(log_exists)

    def test_api_daily_task_update_permissions(self):
        """
        Owner can update daily task, non-member receives 403 Forbidden.
        """
        main = ProjectMainTask.objects.create(
            project=self.project,
            name="Documentation",
            start_date=date(2026, 8, 1),
            due_date=date(2026, 8, 10),
            created_by=self.pm_user,
        )
        wk = ProjectWeeklyTask.objects.create(
            main_task=main,
            assignee=self.assignee_a,
            week_number=1,
            start_date=date(2026, 8, 1),
            end_date=date(2026, 8, 7),
        )
        daily = ProjectDailyTask.objects.create(
            weekly_task=wk,
            owner=self.assignee_a,
            title="Write API Docs",
            planned_date=date(2026, 8, 4),
            progress=Decimal("0.00"),
        )

        # 1. Outsider tries to update -> 403
        self.client.force_authenticate(user=self.outsider)
        resp = self.client.patch(f"/api/v1/projects/daily-tasks/{daily.id}/update_progress/", {"progress": 50})
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

        # 2. Owner updates -> 200
        self.client.force_authenticate(user=self.assignee_a)
        resp = self.client.patch(f"/api/v1/projects/daily-tasks/{daily.id}/update_progress/", {"progress": 70, "status": "IN_PROGRESS"})
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        daily.refresh_from_db()
        self.assertEqual(daily.progress, Decimal("70.00"))

    def test_project_hierarchy_endpoint(self):
        """
        Tests GET /api/v1/projects/projects/{id}/hierarchy/ returns full nested tree structure.
        """
        main = ProjectMainTask.objects.create(
            project=self.project,
            name="Backend Implementation",
            priority="HIGH",
            start_date=date(2026, 8, 1),
            due_date=date(2026, 8, 20),
            created_by=self.pm_user,
        )
        TaskAssignment.objects.create(main_task=main, assignee=self.assignee_a, assigned_by=self.pm_user)
        wk = ProjectWeeklyTask.objects.create(
            main_task=main,
            assignee=self.assignee_a,
            week_number=1,
            start_date=date(2026, 8, 1),
            end_date=date(2026, 8, 7),
            target_description="Setup Architecture",
        )
        ProjectDailyTask.objects.create(
            weekly_task=wk,
            owner=self.assignee_a,
            title="Create Models",
            planned_date=date(2026, 8, 2),
            progress=Decimal("100.00"),
            status="COMPLETED",
        )

        self.client.force_authenticate(user=self.pm_user)
        resp = self.client.get(f"/api/v1/projects/projects/{self.project.id}/hierarchy/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["project_code"], "PRJ-HIER-01")
        self.assertEqual(len(resp.data["main_tasks"]), 1)
        self.assertEqual(resp.data["main_tasks"][0]["name"], "Backend Implementation")
        self.assertEqual(len(resp.data["main_tasks"][0]["weekly_tasks"]), 1)
        self.assertEqual(len(resp.data["main_tasks"][0]["weekly_tasks"][0]["daily_tasks"]), 1)

    def test_api_create_daily_task_without_explicit_owner(self):
        """
        Tests creating daily task via POST /api/v1/projects/daily-tasks/ where owner is omitted,
        verifying it defaults to the authenticated user and succeeds with 201 CREATED.
        """
        main = ProjectMainTask.objects.create(
            project=self.project,
            name="API Feature Development",
            start_date=date(2026, 8, 1),
            due_date=date(2026, 8, 20),
            created_by=self.pm_user,
        )
        wk = ProjectWeeklyTask.objects.create(
            main_task=main,
            assignee=self.assignee_a,
            week_number=1,
            start_date=date(2026, 8, 1),
            end_date=date(2026, 8, 7),
            target_description="Implement Endpoints",
        )
        self.client.force_authenticate(user=self.assignee_a)
        payload = {
            "weekly_task": str(wk.id),
            "title": "Setup API validation",
            "planned_date": "2026-08-03",
            "description": "Form validation and serializer tests",
        }
        resp = self.client.post("/api/v1/projects/daily-tasks/", payload, format="json")
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resp.data["owner"], self.assignee_a.id)
        self.assertEqual(resp.data["title"], "Setup API validation")

    def test_api_delete_daily_and_weekly_and_main_task(self):
        """
        Tests API deletion cascade & permissions for Daily, Weekly, and Main tasks.
        """
        main = ProjectMainTask.objects.create(
            project=self.project,
            name="Deletable Core Module",
            start_date=date(2026, 8, 1),
            due_date=date(2026, 8, 20),
            created_by=self.pm_user,
        )
        wk = ProjectWeeklyTask.objects.create(
            main_task=main,
            assignee=self.assignee_a,
            week_number=1,
            start_date=date(2026, 8, 1),
            end_date=date(2026, 8, 7),
            target_description="Deletable Target",
        )
        daily = ProjectDailyTask.objects.create(
            weekly_task=wk,
            owner=self.assignee_a,
            title="Temporary Task",
            planned_date=date(2026, 8, 2),
            progress=Decimal("100.00"),
            status="COMPLETED",
        )
        recalculate_task_tree(daily_task=daily)

        # 1. Outsider cannot delete daily task -> 403
        self.client.force_authenticate(user=self.outsider)
        resp = self.client.delete(f"/api/v1/projects/daily-tasks/{daily.id}/")
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

        # 2. Owner can delete daily task -> 204
        self.client.force_authenticate(user=self.assignee_a)
        resp = self.client.delete(f"/api/v1/projects/daily-tasks/{daily.id}/")
        self.assertEqual(resp.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(ProjectDailyTask.objects.filter(id=daily.id).exists())

        # 3. Weekly Task Assignee can delete weekly task -> 204
        resp = self.client.delete(f"/api/v1/projects/weekly-tasks/{wk.id}/")
        self.assertEqual(resp.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(ProjectWeeklyTask.objects.filter(id=wk.id).exists())

        # 4. Assignee cannot delete Main Task -> 403
        resp = self.client.delete(f"/api/v1/projects/main-tasks/{main.id}/")
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

        # 5. PM can delete Main Task -> 204
        self.client.force_authenticate(user=self.pm_user)
        resp = self.client.delete(f"/api/v1/projects/main-tasks/{main.id}/")
        self.assertEqual(resp.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(ProjectMainTask.objects.filter(id=main.id).exists())



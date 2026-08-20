"""
Base Strategy for Project Monitoring & Progress Tracking.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any


class BaseProjectMonitoringStrategy(ABC):
    """
    Abstract interface for project monitoring and progress calculation.
    """

    TENANT_CODE: str = "default"

    @abstractmethod
    def calculate_progress(self, project: Any) -> dict:
        """
        Calculate the current progress of the project.
        Returns dict with progress_percent and task breakdown.
        """
        pass

    @abstractmethod
    def get_monitoring_summary(self, project: Any, user: Any = None) -> dict:
        """
        Get complete monitoring overview for the project.
        """
        pass

    @abstractmethod
    def record_weekly_snapshot(
        self,
        project: Any,
        user: Any,
        data: dict,
    ) -> dict:
        """
        Record or update weekly review snapshot for current/specified week.
        """
        pass

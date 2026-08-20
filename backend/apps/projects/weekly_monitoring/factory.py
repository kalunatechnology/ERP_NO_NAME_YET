"""
Weekly Monitoring Strategy Factory.
Resolves the correct monitoring strategy based on tenant_code.
"""
from __future__ import annotations

from typing import Type

from apps.projects.weekly_monitoring.base import BaseProjectMonitoringStrategy
from apps.projects.weekly_monitoring.default import DefaultProjectMonitoringStrategy
from apps.projects.weekly_monitoring.arsalynk import ArsalynkWeeklyMonitoringStrategy


class WeeklyMonitoringFactory:
    _strategies: dict[str, Type[BaseProjectMonitoringStrategy]] = {
        "arsalynk": ArsalynkWeeklyMonitoringStrategy,
        "default": DefaultProjectMonitoringStrategy,
    }

    @classmethod
    def register_strategy(cls, tenant_code: str, strategy_cls: Type[BaseProjectMonitoringStrategy]):
        cls._strategies[tenant_code.lower()] = strategy_cls

    @classmethod
    def get_strategy(cls, tenant_code: str | None) -> BaseProjectMonitoringStrategy:
        code = (tenant_code or "default").lower()
        strategy_cls = cls._strategies.get(code, DefaultProjectMonitoringStrategy)
        return strategy_cls()

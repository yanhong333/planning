"""POI / 活动搜索工具（Mock API）。

封装对 mock_db 的查询，向规划层提供"按约束找候选"的能力。
模拟真实 API：可注入轻微延迟。
"""
from __future__ import annotations

import asyncio

from ..config import settings
from ..data import mock_db
from ..models.schemas import Venue


async def _maybe_latency():
    if settings.SIMULATE_LATENCY:
        await asyncio.sleep(0.15)


async def search_activities(kid_friendly: bool | None = None,
                            max_travel_minutes: int | None = None) -> list[Venue]:
    """搜索饭前/饭后活动候选。

    Args:
        kid_friendly: 是否要求亲子友好（家庭场景下为 True）。
        max_travel_minutes: 最大可接受通勤时长（"别离家太远"约束）。
    """
    await _maybe_latency()
    venues = mock_db.search_activities(kid_friendly, max_travel_minutes)
    # 按评分降序，优先高分
    return sorted(venues, key=lambda v: v.rating, reverse=True)


async def get_venue(venue_id: str) -> Venue | None:
    await _maybe_latency()
    return mock_db.get_venue(venue_id)

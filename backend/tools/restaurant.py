"""餐厅查询与预约工具（Mock API）。

提供：
- search：按减脂/儿童椅/包厢等约束找餐厅
- reserve：模拟预约，含"满位则失败"逻辑，供执行层做降级
"""
from __future__ import annotations

import asyncio

from ..config import settings
from ..data import mock_db
from ..models.schemas import Venue


async def _maybe_latency():
    if settings.SIMULATE_LATENCY:
        await asyncio.sleep(0.2)


async def search_restaurants(low_cal: bool | None = None,
                             need_kid_seat: bool | None = None,
                             need_private_room: bool | None = None,
                             max_travel_minutes: int | None = None) -> list[Venue]:
    """按多维约束搜索餐厅，按评分降序返回。"""
    await _maybe_latency()
    venues = mock_db.search_restaurants(
        low_cal=low_cal,
        need_kid_seat=need_kid_seat,
        need_private_room=need_private_room,
        max_travel_minutes=max_travel_minutes,
    )
    return sorted(venues, key=lambda v: v.rating, reverse=True)


async def reserve(venue_id: str, party_size: int, time_range: str,
                  need_kid_seat: bool = False) -> dict:
    """模拟餐厅预约。

    规则：排队 > 35 分钟视为"当前满位"，预约失败 —— 用于触发执行层自动降级。
    返回 dict: {ok, confirmation, message}
    """
    await _maybe_latency()
    venue = mock_db.get_venue(venue_id)
    if venue is None:
        return {"ok": False, "confirmation": None, "message": "餐厅不存在"}

    if venue.queue_minutes > 35:
        return {
            "ok": False,
            "confirmation": None,
            "message": f"{venue.name}当前满位（预估排队{venue.queue_minutes}分钟），预约失败",
        }

    seat_note = "，已备儿童座椅" if need_kid_seat and venue.has_kid_seat else ""
    return {
        "ok": True,
        "confirmation": f"MT{venue_id.upper()}-{party_size}P",
        "message": f"已为{party_size}人预订{venue.name} {time_range}{seat_note}",
    }

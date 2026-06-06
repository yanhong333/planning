"""票务购买工具（Mock API）。

模拟门票购买，含库存检查（售罄触发降级）。
"""
from __future__ import annotations

import asyncio

from ..config import settings
from ..data import mock_db


async def _maybe_latency():
    if settings.SIMULATE_LATENCY:
        await asyncio.sleep(0.18)


async def buy_tickets(venue_id: str, adults: int, children: int) -> dict:
    """按成人/儿童数量购票。

    规则：任一所需档位库存为 0 视为售罄，购买失败 —— 触发执行层降级。
    儿童票价为 0 表示免票。
    返回 dict: {ok, order_no, amount, message}
    """
    await _maybe_latency()
    tiers = mock_db.get_tickets(venue_id)
    venue = mock_db.get_venue(venue_id)
    name = venue.name if venue else venue_id

    if not tiers:
        # 该活动无需购票（如免费 citywalk / 户外）
        return {"ok": True, "order_no": None, "amount": 0,
                "message": f"{name}无需购票，可直接前往"}

    adult_tier = next((t for t in tiers if "成人" in t["type"] or "畅玩" in t["type"]), None)
    child_tier = next((t for t in tiers if "儿童" in t["type"]), None)

    # 库存检查
    if adult_tier and adults > 0 and adult_tier["stock"] < adults:
        return {"ok": False, "order_no": None, "amount": 0,
                "message": f"{name}成人票已售罄，购票失败"}

    amount = 0
    parts = []
    if adult_tier and adults > 0:
        amount += adult_tier["price"] * adults
        parts.append(f"成人票x{adults}")
    if child_tier and children > 0:
        amount += child_tier["price"] * children
        free = "（免票）" if child_tier["price"] == 0 else ""
        parts.append(f"儿童票x{children}{free}")

    return {
        "ok": True,
        "order_no": f"TK{venue_id.upper()}{adults}{children}",
        "amount": amount,
        "message": f"已购{name}：{'、'.join(parts)}，合计¥{amount}",
    }

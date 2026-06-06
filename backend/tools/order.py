"""美团下单工具（Mock API）：蛋糕 / 鲜花 / 买菜等额外动作。

供执行层在用户勾选"额外动作"时调用，模拟商品下单与配送 ETA。
"""
from __future__ import annotations

import asyncio

from ..config import settings
from ..data import mock_db


async def _maybe_latency():
    if settings.SIMULATE_LATENCY:
        await asyncio.sleep(0.16)


async def place_order(category: str, deliver_to: str) -> dict:
    """下单一个商品（按类目取首个 SKU）。

    Args:
        category: "蛋糕" / "鲜花" / "买菜"
        deliver_to: 配送目的地（如餐厅名 / 家）
    返回 dict: {ok, order_no, amount, message}
    """
    await _maybe_latency()
    product = mock_db.get_product(category)
    if product is None:
        return {"ok": False, "order_no": None, "amount": 0,
                "message": f"暂不支持的类目：{category}"}

    return {
        "ok": True,
        "order_no": product["id"].upper(),
        "amount": product["price"],
        "message": f"已下单「{product['name']}」¥{product['price']}，"
                   f"约{product['eta_min']}分钟内送达{deliver_to}",
    }

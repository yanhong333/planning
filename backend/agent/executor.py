"""执行 Agent：用户确认方案后，并行完成所有下单/预约动作。

设计要点：
- 并行执行（asyncio.gather）：预约餐厅、购票、买额外商品同时进行，
  贴合赛题"几分钟内搞定"的体验。
- 异常降级：任一动作失败（满位/售罄）不阻塞其它动作，
  并尝试自动切换备选（如换一家可订餐厅），失败则标记需人工处理。
- 汇总行程卡：执行完成后生成可分享的行程卡。
"""
from __future__ import annotations

import asyncio

from ..models.schemas import (
    ExecStatus, ExecutionItem, ExecutionResult, ParsedIntent, Plan,
)
from ..tools import order, restaurant, ticket
from ..tools.itinerary import build_itinerary


async def _exec_reservation(plan: Plan, intent: ParsedIntent) -> ExecutionItem:
    """预约正餐，满位则自动降级到备选餐厅。"""
    meal_step = next((s for s in plan.steps if s.slot == "正餐"), None)
    if meal_step is None:
        return ExecutionItem(action="餐厅预约", target="-",
                             status=ExecStatus.SUCCESS, detail="本方案无需预约")

    need_seat = any(m.role == "child" for m in intent.members)
    r = await restaurant.reserve(
        meal_step.venue.id, intent.party_size, meal_step.time_range, need_seat)
    if r["ok"]:
        return ExecutionItem(action="餐厅预约", target=meal_step.venue.name,
                             status=ExecStatus.SUCCESS, detail=r["message"])

    # 降级：在同约束下找一家排队 <=35 的备选餐厅
    candidates = await restaurant.search_restaurants(
        low_cal=meal_step.venue.low_cal_options or None,
        need_kid_seat=need_seat or None,
        need_private_room=meal_step.venue.has_private_room or None,
    )
    for alt in candidates:
        if alt.id == meal_step.venue.id:
            continue
        r2 = await restaurant.reserve(alt.id, intent.party_size,
                                      meal_step.time_range, need_seat)
        if r2["ok"]:
            return ExecutionItem(
                action="餐厅预约", target=alt.name, status=ExecStatus.FALLBACK,
                detail=r2["message"],
                fallback_note=f"原选「{meal_step.venue.name}」{r['message']}，已自动改订相似餐厅")
    return ExecutionItem(
        action="餐厅预约", target=meal_step.venue.name, status=ExecStatus.FAILED,
        detail=r["message"], fallback_note="无可用备选，建议稍后手动改约或选其它时段")


async def _exec_tickets(plan: Plan, intent: ParsedIntent) -> list[ExecutionItem]:
    """为需购票的活动购票，售罄则降级。"""
    items: list[ExecutionItem] = []
    adults = intent.party_size - sum(1 for m in intent.members if m.role == "child")
    children = sum(1 for m in intent.members if m.role == "child")

    for step in plan.steps:
        if step.slot not in ("活动", "附加活动"):
            continue
        r = await ticket.buy_tickets(step.venue.id, max(adults, 1), children)
        if r["ok"]:
            items.append(ExecutionItem(
                action="购票", target=step.venue.name,
                status=ExecStatus.SUCCESS, detail=r["message"]))
        else:
            items.append(ExecutionItem(
                action="购票", target=step.venue.name, status=ExecStatus.FAILED,
                detail=r["message"],
                fallback_note="该活动票已售罄，建议现场购票或更换活动"))
    return items


async def _exec_extras(extras: list[str], deliver_to: str) -> list[ExecutionItem]:
    """并行下单额外商品（蛋糕/鲜花/买菜）。"""
    async def one(cat: str) -> ExecutionItem:
        r = await order.place_order(cat, deliver_to)
        status = ExecStatus.SUCCESS if r["ok"] else ExecStatus.FAILED
        return ExecutionItem(action=cat, target=deliver_to,
                             status=status, detail=r["message"])
    if not extras:
        return []
    return list(await asyncio.gather(*(one(c) for c in extras)))


async def execute_plan(plan: Plan, intent: ParsedIntent,
                       extras: list[str]) -> ExecutionResult:
    """并行执行全部动作并汇总。"""
    meal_step = next((s for s in plan.steps if s.slot == "正餐"), None)
    deliver_to = meal_step.venue.name if meal_step else "家"

    # 三类动作并行：预约 / 购票 / 额外商品
    reservation, tickets, extra_items = await asyncio.gather(
        _exec_reservation(plan, intent),
        _exec_tickets(plan, intent),
        _exec_extras(extras, deliver_to),
    )

    items: list[ExecutionItem] = [reservation] + tickets + extra_items
    itinerary = build_itinerary(plan, items, intent.start_time)
    all_success = all(it.status != ExecStatus.FAILED for it in items)

    return ExecutionResult(items=items, itinerary=itinerary, all_success=all_success)

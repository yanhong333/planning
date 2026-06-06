"""总编排器：串起 理解 → 规划 → 接力 → 执行 全链路。

对路由层暴露三个高层能力：
- plan(req)         : 解析意图 + 推断约束 + 生成多方案
- relay(plan, who)  : 为指定受众生成接力卡
- execute(plan, ..) : 确认后并行执行落地
"""
from __future__ import annotations

from ..models.schemas import (
    Audience, ExecuteRequest, ExecutionResult, ParsedIntent, Plan,
    PlanResponse, RelayCard, UserRequest,
)
from . import intent as intent_mod
from . import planner, relay
from .executor import execute_plan


async def plan(req: UserRequest) -> tuple[PlanResponse, ParsedIntent]:
    """理解 + 规划。返回响应与意图（意图供后续执行复用）。"""
    parsed = await intent_mod.parse_intent(req)
    constraints = planner.infer_constraints(parsed)
    parsed.constraints = constraints

    plans = await planner.build_plans(parsed, constraints)
    recommended = plans[0].id if plans else ""

    resp = PlanResponse(intent=parsed, plans=plans,
                        recommended_plan_id=recommended)
    return resp, parsed


def relay_card(plan_obj: Plan, audience: Audience,
               scene) -> RelayCard:
    """生成接力视角卡片。"""
    return relay.build_relay_card(plan_obj, audience, scene)


async def execute(plan_obj: Plan, parsed: ParsedIntent,
                  extras: list[str]) -> ExecutionResult:
    """执行落地。"""
    return await execute_plan(plan_obj, parsed, extras)

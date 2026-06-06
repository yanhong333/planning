"""行程卡生成工具（Mock API）。

把执行结果汇总成一张可分享的行程卡：时间线 + 一句话总结 + 转发文案。
"""
from __future__ import annotations

from ..models.schemas import ExecutionItem, Itinerary, Plan


def build_itinerary(plan: Plan, items: list[ExecutionItem],
                    start_time: str) -> Itinerary:
    """根据方案步骤与执行结果生成行程卡。"""
    timeline: list[str] = []
    for step in plan.steps:
        timeline.append(f"{step.time_range} {step.slot}：{step.venue.name}")

    # 把成功的预约/购票/下单结果补进时间线尾部
    for it in items:
        if it.status.value in ("success", "fallback"):
            timeline.append(f"✓ {it.action}：{it.detail}")

    first = plan.steps[0].venue.name if plan.steps else "出发地"
    meal = next((s.venue.name for s in plan.steps if s.slot == "正餐"), "餐厅")
    summary = (f"搞定了！{start_time}出发，先去{first}，"
               f"之后到{meal}吃饭（已预订），全程约{plan.total_minutes//60}小时。")

    share_lines = [summary, "—— 行程明细 ——"] + timeline
    share_text = "\n".join(share_lines)

    return Itinerary(summary=summary, timeline=timeline, share_text=share_text)

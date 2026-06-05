"""FastAPI 入口与路由层。

接口：
- POST /api/plan      : 自然语言 → 意图解析 + 多套方案
- POST /api/relay     : 方案 + 受众 → 接力视角卡
- POST /api/execute   : 确认方案 → 并行执行 + 行程卡
- POST /api/chat      : 自由追问（DeepSeek 直接回答）
- GET  /api/discover  : 发现页热门推荐数据
- GET  /api/health    : 状态检查
- GET  /              : 前端单页
"""
from __future__ import annotations

import os
import uuid

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from .agent import orchestrator
from .agent.llm import llm
from .data.mock_db import DISCOVER_SPOTS, USER_HOME
from .models.schemas import Audience, Plan, Scene, UserRequest

app = FastAPI(title="今日拍板 · 本地探索Agent")

app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"],
)

_SESSIONS: dict[str, object] = {}

_FRONTEND_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "frontend")


# ============ 请求体 ============

class RelayBody(BaseModel):
    plan: Plan
    audience: Audience
    scene: Scene = Scene.FAMILY


class ExecuteBody(BaseModel):
    session_id: str
    plan: Plan
    extras: list[str] = []


class ChatBody(BaseModel):
    message: str
    context: str = ""   # 可选：当前方案摘要，给 LLM 上下文


# ============ 接口 ============

@app.post("/api/plan")
async def api_plan(req: UserRequest):
    resp, parsed = await orchestrator.plan(req)
    session_id = uuid.uuid4().hex[:12]
    _SESSIONS[session_id] = parsed
    return {"session_id": session_id, **resp.model_dump()}


@app.post("/api/relay")
async def api_relay(body: RelayBody):
    card = orchestrator.relay_card(body.plan, body.audience, body.scene)
    return card.model_dump()


@app.post("/api/execute")
async def api_execute(body: ExecuteBody):
    parsed = _SESSIONS.get(body.session_id)
    if parsed is None:
        from .models.schemas import ParsedIntent
        parsed = ParsedIntent(scene=Scene.FAMILY, party_size=3)
    result = await orchestrator.execute(body.plan, parsed, body.extras)
    return result.model_dump()


@app.post("/api/chat")
async def api_chat(body: ChatBody):
    """自由追问接口：用 DeepSeek 直接回答关于活动/餐厅/路线的问题。"""
    system = (
        "你是「今日拍板」本地生活助手，帮用户规划望京商圈周末活动。"
        "回答简洁、有用，控制在150字以内，语气轻松。"
        "如果用户问路线，给出步行/骑行建议和大概时间，不要说'打开地图'，"
        "因为页面上有内置地图。如果上下文中有方案信息，结合方案回答。"
    )
    ctx = f"\n当前方案摘要：{body.context}" if body.context else ""
    reply = await llm.complete_text(system, body.message + ctx)
    if reply is None:
        # LLM 不可用时的兜底
        reply = "好问题！望京商圈半径3公里内步行/骑行都很方便，建议直接看地图页查看路线 🗺️"
    return {"reply": reply}


@app.get("/api/discover")
async def api_discover():
    """发现页：热门场所 + 用户出发点坐标。"""
    return {"spots": DISCOVER_SPOTS, "home": USER_HOME}


@app.get("/api/health")
async def health():
    from .config import settings
    return {"status": "ok", "llm_enabled": settings.llm_enabled,
            "model": settings.LLM_MODEL}


# ============ 前端托管 ============

if os.path.isdir(_FRONTEND_DIR):
    app.mount("/static", StaticFiles(directory=_FRONTEND_DIR), name="static")

    @app.get("/")
    async def index():
        return FileResponse(os.path.join(_FRONTEND_DIR, "index.html"))

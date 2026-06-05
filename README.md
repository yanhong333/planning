# 今日拍板 · 本地探索 Agent

> 美团 AI 黑客松 · 赛题06「本地探索：周末闲时活动规划」
>
> 接受一句自然语言目标，自动推断隐藏偏好 → 规划完整下午方案 → **递手机给家人/朋友一键拍板** → 并行完成所有预约下单。

## 一句话亮点

不是"搜索推荐"，是**帮你把事做完**。核心创新是「**接力模式**」：小明把手机递给老婆的那一刻，界面自动切换视角，用对方最关心的维度重新呈现方案 —— 行业首创的群体决策体验。

## 快速开始

```bash
# 1. 安装依赖
pip install -r backend/requirements.txt

# 2. 一键启动
python run.py

# 3. 浏览器打开
http://127.0.0.1:8848
```

打开后点击页面上的示例气泡（👨‍👩‍👧 家庭 / 🍻 朋友），即可体验完整流程：
**理解需求 → 看到"我帮你想到的"约束 → 多套方案 → 递手机给老婆/朋友 → 一键安排所有 → 生成可转发行程卡**。

## 可选：接入真实大模型

默认走规则引擎（零依赖、零延迟、结果稳定）。配置 API Key 后意图解析自动切换真实 LLM：

```bash
export LLM_API_KEY=sk-...        # Anthropic API Key
python run.py
```

## 项目结构

```
backend/app/
  models/schemas.py      数据契约（意图/方案/执行结果）
  data/mock_db.py        虚构数据库（POI/餐厅/票务/商品）
  tools/                 Mock API 工具层
    poi.py  restaurant.py  ticket.py  order.py  itinerary.py
  agent/                 Agent 内核
    intent.py            意图解析（规则兜底 + LLM 可选）
    planner.py           隐性约束推断 + 多方案生成
    relay.py             接力适配层（妻子/朋友视角切换）★ 核心创新
    executor.py          并行执行 + 异常降级
    orchestrator.py      总编排
    llm.py               LLM 客户端（混合模式开关）
  main.py                FastAPI 路由
frontend/                原生单页 Web UI（美团风格）
docs/DESIGN.md           设计文档（Planning策略/调用链/异常处理）
run.py                   一键启动
```

## 接口

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/plan` | 自然语言 → 意图 + 约束 + 多方案 |
| POST | `/api/relay` | 方案 + 受众 → 接力视角卡 |
| POST | `/api/execute` | 确认方案 → 并行执行 + 行程卡 |

详见 [docs/DESIGN.md](docs/DESIGN.md)。

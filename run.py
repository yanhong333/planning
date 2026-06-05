"""一键启动脚本：起后端 + 托管前端。

用法：
    python run.py
然后浏览器打开 http://127.0.0.1:8848

可选环境变量：
    LLM_API_KEY=...    配置后意图解析切换到真实大模型（默认走规则引擎）
    SIMULATE_LATENCY=0 关闭模拟延迟（默认开启，更接近真实 API 体验）
"""
import os
import sys

import uvicorn

# 确保能 import backend.app
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "backend"))

if __name__ == "__main__":
    port = int(os.getenv("PORT", "8848"))
    print(f"\n  今日拍板 · 本地探索Agent")
    print(f"  → 打开浏览器访问 http://127.0.0.1:{port}\n")
    uvicorn.run("app.main:app", host="127.0.0.1", port=port, reload=False)

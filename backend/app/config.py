"""全局配置。

LLM：默认无 key，走规则/模板兜底；设置环境变量后自动切换真实大模型。
"""
import os


class Settings:
    # 用户默认位置（mock 场景围绕望京商圈）
    DEFAULT_LOCATION: str = "望京"

    # LLM 配置：默认接 DeepSeek，兼容 OpenAI 格式
    LLM_API_KEY: str = os.getenv("LLM_API_KEY", "sk-3010c2d2a5634aeba9d24a73ed469a2e")
    LLM_BASE_URL: str = os.getenv("LLM_BASE_URL", "https://api.deepseek.com/v1")
    LLM_MODEL: str = os.getenv("LLM_MODEL", "deepseek-chat")

    @property
    def llm_enabled(self) -> bool:
        return bool(self.LLM_API_KEY)

    # 工具层模拟：是否注入随机延迟/失败（演示异常处理用）
    SIMULATE_LATENCY: bool = os.getenv("SIMULATE_LATENCY", "1") == "1"


settings = Settings()

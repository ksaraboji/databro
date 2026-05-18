import os


SUPPORTED_LLM_PROVIDERS = {"huggingface", "ollama"}


def hf_api_token() -> str:
    token = os.getenv("HF_API_TOKEN") or os.getenv("HF_TOKEN")
    if not token:
        raise ValueError("Missing HF_API_TOKEN or HF_TOKEN environment variable.")
    return token


def hf_model_name() -> str:
    return os.getenv("HF_MODEL_NAME", "google/gemma-4-31B-it")


def hf_base_url() -> str:
    return os.getenv("HF_BASE_URL", "https://router.huggingface.co/v1")


def ollama_base_url() -> str:
    return os.getenv("OLLAMA_BASE_URL", "http://localhost:11434/v1")


def ollama_default_model() -> str:
    return os.getenv("OLLAMA_DEFAULT_MODEL", "llama3.2")


def llm_provider_default() -> str:
    raw = (os.getenv("LLM_PROVIDER_DEFAULT", "huggingface") or "").strip().lower()
    return raw if raw in SUPPORTED_LLM_PROVIDERS else "huggingface"


def resolve_llm_selection(llm_provider: str | None, llm_model: str | None) -> tuple[str, str]:
    provider = (llm_provider or llm_provider_default()).strip().lower()
    if provider not in SUPPORTED_LLM_PROVIDERS:
        raise ValueError(f"Unsupported llm_provider: {provider}. Allowed: huggingface, ollama")

    if provider == "huggingface":
        model = (llm_model or hf_model_name()).strip()
        return provider, model

    model = (llm_model or ollama_default_model()).strip()
    return provider, model


def llm_max_tokens() -> int:
    raw = os.getenv("LLM_MAX_TOKENS", "1024")
    try:
        return max(256, int(raw))
    except ValueError:
        return 1024


def max_result_rows() -> int:
    raw = os.getenv("MAX_RESULT_ROWS", "200")
    try:
        return max(10, int(raw))
    except ValueError:
        return 200

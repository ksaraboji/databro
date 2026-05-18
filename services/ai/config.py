import os
import logging

logger = logging.getLogger(__name__)

SUPPORTED_LLM_PROVIDERS = {"huggingface", "ollama"}


def hf_api_token() -> str:
    """Get HuggingFace API token. Raises ValueError if not set."""
    token = os.getenv("HF_API_TOKEN") or os.getenv("HF_TOKEN")
    if not token:
        raise ValueError(
            "HuggingFace API token is required but not set. "
            "Set HF_API_TOKEN or HF_TOKEN environment variable. "
            "Get a token from https://huggingface.co/settings/tokens"
        )
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


def is_ollama_available() -> bool:
    """Check if OLLAMA_BASE_URL is set and valid."""
    url = os.getenv("OLLAMA_BASE_URL", "").strip()
    available = bool(url and url != "http://localhost:11434/v1")
    logger.info(f"is_ollama_available: url={repr(url[:50] if len(url) > 50 else url)}, available={available}")
    return available


def resolve_llm_selection(llm_provider: str | None, llm_model: str | None) -> tuple[str, str]:
    logger.info(f"resolve_llm_selection: input provider={repr(llm_provider)}, model={repr(llm_model)}")
    
    provider = (llm_provider or llm_provider_default()).strip().lower()
    logger.info(f"  After normalization: provider={repr(provider)}")
    
    if provider not in SUPPORTED_LLM_PROVIDERS:
        raise ValueError(f"Unsupported llm_provider: {provider}. Allowed: huggingface, ollama")

    # If Ollama was requested but is not available, fallback to HuggingFace
    if provider == "ollama":
        ollama_available = is_ollama_available()
        logger.info(f"  Ollama requested. is_ollama_available()={ollama_available}")
        if not ollama_available:
            logger.info(f"  Ollama not available, falling back to huggingface")
            provider = "huggingface"

    if provider == "huggingface":
        model = (llm_model or hf_model_name()).strip()
        # Guard against stale Ollama model values (e.g. "gemma:e2b") being sent with HF provider.
        if ":" in model and "/" not in model:
            logger.info("  Detected Ollama-style model for huggingface provider; using HF default model")
            model = hf_model_name()
        logger.info(f"  HuggingFace: model={repr(model)}")
        return provider, model

    model = (llm_model or ollama_default_model()).strip()
    # Guard against stale HuggingFace model values (e.g. "google/gemma-4-31B-it") for Ollama.
    if "/" in model:
        logger.info("  Detected HuggingFace-style model for ollama provider; using Ollama default model")
        model = ollama_default_model()
    logger.info(f"  Ollama: model={repr(model)}")
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

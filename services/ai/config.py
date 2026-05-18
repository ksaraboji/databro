import os
import urllib.parse
import urllib.request

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
    return os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")


def ollama_audience() -> str:
    base = ollama_base_url().strip().rstrip("/")
    if base.endswith("/v1"):
        base = base[:-3]
    return base


def ollama_api_key() -> str:
    """Return auth token for Ollama OpenAI-compatible endpoint.

    - Local/default Ollama: static key "ollama"
    - Cloud Run Ollama URL: mint an identity token from metadata server
    """
    base = ollama_base_url().strip().lower()
    if "localhost" in base or "127.0.0.1" in base:
        return "ollama"

    audience = ollama_audience()
    identity_url = (
        "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity"
        f"?audience={urllib.parse.quote(audience, safe='')}&format=full"
    )

    request = urllib.request.Request(
        identity_url,
        headers={"Metadata-Flavor": "Google"},
        method="GET",
    )

    try:
        with urllib.request.urlopen(request, timeout=5) as response:
            token = response.read().decode("utf-8").strip()
    except Exception as exc:
        raise ValueError(
            f"Failed to mint Cloud Run identity token for Ollama audience '{audience}': {exc}"
        ) from exc

    if not token:
        raise ValueError("Metadata server returned empty identity token for Ollama call.")

    return token


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

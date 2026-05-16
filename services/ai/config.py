import os


def hf_api_token() -> str:
    token = os.getenv("HF_API_TOKEN") or os.getenv("HF_TOKEN")
    if not token:
        raise ValueError("Missing HF_API_TOKEN or HF_TOKEN environment variable.")
    return token


def hf_model_name() -> str:
    return os.getenv("HF_MODEL_NAME", "google/gemma-4-31B-it")


def hf_base_url() -> str:
    return os.getenv("HF_BASE_URL", "https://router.huggingface.co/v1")


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

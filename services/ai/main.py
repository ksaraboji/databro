import os
import tempfile
import logging
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from agentic_prescription import run_prescription_agent
from agentic_sql import run_data_agent
from config import max_result_rows


load_dotenv()

# Configure logging for better debugging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Session cache for prescription chats.
# Keys are UI-generated session_id values.
PRESCRIPTION_SESSION_STORE: dict[str, dict[str, Any]] = {}

app = FastAPI(title="DataBro AI Data Chat Backend", version="0.1.0")

# Cloud Run should normally receive calls from Supabase Edge Function, not browsers.
# Keep this tight and update with your exact production origin when needed.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://databro.dev", "https://www.databro.dev"],
    allow_credentials=True,
    allow_methods=["POST", "OPTIONS", "GET"],
    allow_headers=["*"],
)


@app.get("/healthz")
async def healthz():
    return {"status": "ok"}


@app.get("/debug/config")
async def debug_config():
    """Diagnostic endpoint to check backend configuration."""
    from config import hf_base_url, hf_model_name, ollama_default_model, llm_provider_default
    
    hf_token_set = bool(os.getenv("HF_API_TOKEN") or os.getenv("HF_TOKEN"))
    ollama_url = os.getenv("OLLAMA_BASE_URL", "")
    
    return {
        "status": "ok",
        "environment": {
            "HF_API_TOKEN_SET": hf_token_set,
            "HF_MODEL_NAME": hf_model_name(),
            "HF_BASE_URL": hf_base_url(),
            "OLLAMA_BASE_URL": ollama_url,
            "OLLAMA_DEFAULT_MODEL": ollama_default_model(),
            "LLM_PROVIDER_DEFAULT": llm_provider_default(),
        },
        "note": "This endpoint helps debug configuration issues. Remove in production."
    }



@app.post("/v1/ask-data")
async def ask_data(
    file: UploadFile = File(...),
    user_intent: str = Form(...),
    llm_provider: str | None = Form(default=None),
    llm_model: str | None = Form(default=None),
):
    if not user_intent.strip():
        raise HTTPException(status_code=400, detail="user_intent is required.")

    # Log the exact values received from FormData
    logger.info(f"FormData received:")
    logger.info(f"  file: {file.filename}")
    logger.info(f"  user_intent: {user_intent}")
    logger.info(f"  llm_provider: {repr(llm_provider)} (type: {type(llm_provider).__name__})")
    logger.info(f"  llm_model: {repr(llm_model)} (type: {type(llm_model).__name__})")

    suffix = Path(file.filename or "upload.bin").suffix
    tmp_path = None

    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            tmp.write(await file.read())
            tmp_path = tmp.name

        logger.info(f"Running data agent for: {file.filename}")
        try:
            agent_result = await run_data_agent(
                file_path=tmp_path,
                user_intent=user_intent,
                max_rows=max_result_rows(),
                llm_provider=llm_provider,
                llm_model=llm_model,
            )
        except ValueError as config_error:
            logger.error(f"Configuration error during agent run: {config_error}")
            raise HTTPException(status_code=400, detail=f"Configuration error: {config_error}") from config_error

        logger.info(f"Agent complete: sql={agent_result['sql'][:100]}..., provider={agent_result['provider']}, model={agent_result['model']}")

        return {
            "user_intent": user_intent,
            "llm_provider": agent_result["provider"],
            "llm_model": agent_result["model"],
            "generated_sql": agent_result["sql"],
            "schema": agent_result["schema_info"],
            "result": agent_result["query_result"],
        }

    except ValueError as exc:
        logger.error(f"ValueError: {exc}")
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"Unexpected error: {exc}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Backend failed: {exc}") from exc
    finally:
        if tmp_path and os.path.exists(tmp_path):
            os.remove(tmp_path)


@app.post("/v1/prescription-chat")
async def prescription_chat(
    user_intent: str = Form(...),
    session_id: str = Form(...),
    file: UploadFile | None = File(default=None),
    llm_provider: str | None = Form(default=None),
    llm_model: str | None = Form(default=None),
    end_session: str | None = Form(default=None),
):
    if not user_intent.strip():
        raise HTTPException(status_code=400, detail="user_intent is required.")

    if not session_id.strip():
        raise HTTPException(status_code=400, detail="session_id is required.")

    should_end = (end_session or "").strip().lower() in {"1", "true", "yes", "y"}
    normalized_session_id = session_id.strip()
    logger.info(
        "prescription_chat request: session_id=%s provider=%s model=%s has_file=%s end_session=%s intent_preview=%s",
        normalized_session_id,
        llm_provider,
        llm_model,
        file is not None,
        should_end,
        user_intent.strip()[:300],
    )

    if should_end:
        PRESCRIPTION_SESSION_STORE.pop(normalized_session_id, None)
        return {
            "session_id": normalized_session_id,
            "ended": True,
            "message": "Prescription session ended and cache cleared.",
        }

    session_state = PRESCRIPTION_SESSION_STORE.setdefault(
        normalized_session_id,
        {
            "raw_text": "",
            "structured_data": {},
            "search_cache": {},
        },
    )

    tmp_path = None
    try:
        if file is not None:
            logger.info(
                "prescription_chat upload: filename=%s content_type=%s",
                file.filename,
                file.content_type,
            )
            suffix = Path(file.filename or "upload.bin").suffix
            with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
                tmp.write(await file.read())
                tmp_path = tmp.name

        agent_result = await run_prescription_agent(
            user_intent=user_intent,
            session_state=session_state,
            image_path=tmp_path,
            llm_provider=llm_provider,
            llm_model=llm_model,
        )
        logger.info(
            "prescription_chat result: session_id=%s extraction_reused=%s used_search=%s raw_text_chars=%s factual_points=%s answer_preview=%s",
            normalized_session_id,
            agent_result.get("extraction_reused"),
            agent_result.get("used_search"),
            len(str(agent_result.get("raw_text", ""))),
            len(agent_result.get("factual_points", []) or []),
            str(agent_result.get("answer", ""))[:400],
        )

        return {
            "session_id": normalized_session_id,
            "user_intent": user_intent,
            "llm_provider": agent_result["provider"],
            "llm_model": agent_result["model"],
            "answer": agent_result["answer"],
            "factual_points": agent_result["factual_points"],
            "used_search": agent_result["used_search"],
            "extraction_reused": agent_result["extraction_reused"],
            "search_cache_size": agent_result["search_cache_size"],
            "prescription": {
                "raw_text": agent_result["raw_text"],
                "structured_data": agent_result["structured_data"],
            },
            "safety_notice": (
                "For informational purposes only. This is not medical advice. "
                "Always confirm with a licensed doctor or pharmacist before taking medication."
            ),
        }

    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"Unexpected error in prescription_chat: {exc}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Backend failed: {exc}") from exc
    finally:
        if tmp_path and os.path.exists(tmp_path):
            os.remove(tmp_path)


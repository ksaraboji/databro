import os
import tempfile
import logging
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from agentic_sql import ServiceNotReadyError, generate_sql_from_intent
from config import max_result_rows
from data_tools import execute_query, inspect_data_file


load_dotenv()

# Configure logging for better debugging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

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

        logger.info(f"Inspecting data file: {file.filename}")
        schema_info = inspect_data_file(tmp_path)
        
        logger.info(f"Calling generate_sql_from_intent with provider={repr(llm_provider)}, model={repr(llm_model)}")
        try:
            sql, resolved_provider, resolved_model = await generate_sql_from_intent(
                user_intent=user_intent,
                schema=schema_info["schema"],
                row_count=schema_info["row_count"],
                llm_provider=llm_provider,
                llm_model=llm_model,
            )
        except ServiceNotReadyError as not_ready_error:
            logger.warning(f"Dependent service not ready: {not_ready_error}")
            raise HTTPException(status_code=503, detail=str(not_ready_error)) from not_ready_error
        except ValueError as config_error:
            logger.error(f"Configuration error during SQL generation: {config_error}")
            raise HTTPException(status_code=400, detail=f"Configuration error: {config_error}") from config_error
        
        logger.info(f"Generated SQL: {sql[:100]}... (resolved provider={resolved_provider}, model={resolved_model})")
        
        query_result = execute_query(tmp_path, sql, max_rows=max_result_rows())

        return {
            "user_intent": user_intent,
            "llm_provider": resolved_provider,
            "llm_model": resolved_model,
            "generated_sql": sql,
            "schema": schema_info,
            "result": query_result,
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

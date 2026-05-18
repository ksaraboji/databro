import os
import tempfile
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from agentic_sql import generate_sql_from_intent
from config import max_result_rows
from data_tools import execute_query, inspect_data_file


load_dotenv()

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


@app.post("/v1/ask-data")
async def ask_data(
    file: UploadFile = File(...),
    user_intent: str = Form(...),
    llm_provider: str | None = Form(default=None),
    llm_model: str | None = Form(default=None),
):
    if not user_intent.strip():
        raise HTTPException(status_code=400, detail="user_intent is required.")

    suffix = Path(file.filename or "upload.bin").suffix
    tmp_path = None

    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            tmp.write(await file.read())
            tmp_path = tmp.name

        schema_info = inspect_data_file(tmp_path)
        sql, resolved_provider, resolved_model = generate_sql_from_intent(
            user_intent=user_intent,
            schema=schema_info["schema"],
            row_count=schema_info["row_count"],
            llm_provider=llm_provider,
            llm_model=llm_model,
        )
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
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Backend failed: {exc}") from exc
    finally:
        if tmp_path and os.path.exists(tmp_path):
            os.remove(tmp_path)

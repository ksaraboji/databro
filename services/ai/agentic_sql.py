import json
import re
import logging
from typing import Any

from crewai import Agent, Crew, LLM, Process, Task
from crewai.tools import tool

from config import hf_api_token, hf_base_url, hf_model_name, llm_max_tokens, ollama_api_key, ollama_base_url, resolve_llm_selection
from data_tools import execute_query, inspect_data_file

logger = logging.getLogger(__name__)


FORBIDDEN_SQL_KEYWORDS = {
    "insert",
    "update",
    "delete",
    "drop",
    "alter",
    "truncate",
    "create",
    "attach",
    "copy",
}


# ── Tools ──────────────────────────────────────────────────────────────────────

@tool("Inspect Data File")
def inspect_data_file_tool(file_path: str) -> str:
    """Inspects a data file (CSV, JSON, NDJSON, Parquet, Arrow) and returns
    its file type, row count, and column schema as JSON."""
    result = inspect_data_file(file_path)
    return json.dumps(result)


def make_execute_query_tool(file_path: str, max_rows: int):
    """Factory that binds file_path and max_rows into a crewai tool."""

    @tool("Execute SQL Query")
    def execute_query_tool(sql: str) -> str:
        """Executes a read-only DuckDB query on the data file and returns results as JSON
        including columns, rows, row_count, returned_rows, and truncated flag."""
        validated = _validate_sql(_extract_sql(sql))
        result = execute_query(file_path, validated, max_rows)
        return json.dumps(result)

    return execute_query_tool


# ── LLM Builder ────────────────────────────────────────────────────────────────

def _build_llm(provider: str, model: str) -> LLM:
    if provider == "ollama":
        base_url = ollama_base_url()
        model_name = model.removeprefix("ollama/")
        logger.info(f"Creating Ollama LLM with model={model_name}, base_url={base_url}")
        return LLM(
            provider="ollama",
            model=model_name,
            api_key=ollama_api_key(),
            base_url=base_url,
            temperature=0,
            max_tokens=llm_max_tokens(),
        )

    base_url = hf_base_url()
    logger.info(f"Creating HuggingFace LLM with model={model}, base_url={base_url}")
    return LLM(
        provider="openai",
        model=model,
        api_key=hf_api_token(),
        base_url=base_url,
        temperature=0,
        max_tokens=llm_max_tokens(),
    )


# ── SQL Helpers ─────────────────────────────────────────────────────────────────

def _extract_sql(raw_text: str) -> str:
    fenced_match = re.search(r"```(?:sql)?\s*(.*?)```", raw_text, flags=re.IGNORECASE | re.DOTALL)
    if fenced_match:
        return fenced_match.group(1).strip()

    statement_match = re.search(
        r"(with\s+.*|select\s+.*|describe\s+.*|show\s+.*)",
        raw_text,
        flags=re.IGNORECASE | re.DOTALL,
    )
    if statement_match:
        return statement_match.group(1).strip()

    return raw_text.strip()


def _validate_sql(sql: str) -> str:
    normalized = sql.strip().rstrip(";")
    if not normalized:
        raise ValueError("Model returned empty SQL.")

    lowered = normalized.lower()
    if not (
        lowered.startswith("select")
        or lowered.startswith("with")
        or lowered.startswith("describe")
        or lowered.startswith("show")
    ):
        raise ValueError("Only read-only SELECT/WITH/DESCRIBE/SHOW queries are allowed.")

    if ";" in normalized:
        raise ValueError("Multiple SQL statements are not allowed.")

    for keyword in FORBIDDEN_SQL_KEYWORDS:
        if re.search(rf"\b{keyword}\b", lowered):
            raise ValueError(f"Unsafe SQL keyword detected: {keyword}")

    return normalized


def _extract_json(raw_text: str) -> dict:
    """Extract the first JSON object from an agent task output string."""
    match = re.search(r"\{.*\}", raw_text, flags=re.DOTALL)
    if match:
        try:
            return json.loads(match.group())
        except json.JSONDecodeError:
            pass
    return {}


# ── Main Crew Function ──────────────────────────────────────────────────────────

async def run_data_agent(
    file_path: str,
    user_intent: str,
    max_rows: int,
    llm_provider: str | None = None,
    llm_model: str | None = None,
) -> dict[str, Any]:
    logger.info("=== run_data_agent START ===")
    logger.info(f"  Input: provider={repr(llm_provider)}, model={repr(llm_model)}")

    try:
        provider, model = resolve_llm_selection(llm_provider, llm_model)
        logger.info(f"  Resolved: provider={provider}, model={model}")
    except Exception as e:
        logger.error(f"  ERROR in resolve_llm_selection: {e}")
        raise

    if provider == "huggingface" and not llm_model:
        model = hf_model_name()
        logger.info(f"  Using default HF model: {model}")

    try:
        llm = _build_llm(provider, model)
    except Exception as e:
        logger.error(f"  ERROR building LLM: {e}", exc_info=True)
        raise ValueError(f"Failed to initialize {provider} LLM: {e}") from e

    execute_tool = make_execute_query_tool(file_path=file_path, max_rows=max_rows)

    # ── Agents ──────────────────────────────────────────────────────────────────
    data_analyst = Agent(
        role="Data Analyst",
        goal="Inspect data files and execute SQL queries to retrieve results.",
        backstory=(
            "You are a data engineering specialist who examines tabular data files "
            "to extract schema metadata and executes validated SQL queries to retrieve results."
        ),
        tools=[inspect_data_file_tool, execute_tool],
        llm=llm,
        verbose=False,
    )

    sql_planner = Agent(
        role="DuckDB SQL Planner",
        goal="Generate a single, correct DuckDB SELECT query for the user's request.",
        backstory=(
            "You are an expert SQL planner for tabular files. "
            "You only produce one read-only DuckDB query over a table named `data`."
        ),
        llm=llm,
        verbose=False,
    )

    # ── Tasks ───────────────────────────────────────────────────────────────────
    inspect_task = Task(
        description=(
            f"Use the inspect_data_file tool on the file at path: `{file_path}`.\n"
            "Return the full JSON output from the tool exactly as received, "
            "including file_type, row_count, and schema."
        ),
        expected_output=(
            "A JSON object with keys: file_type (string), row_count (integer), "
            "schema (list of objects with column, type, nullable)."
        ),
        agent=data_analyst,
    )

    sql_task = Task(
        description=(
            "The previous task has provided the schema for a table named `data`.\n"
            "Using that schema, write a single DuckDB SQL query to satisfy the user intent below.\n\n"
            "Rules:\n"
            "1) Use only table name `data`.\n"
            "2) Output exactly one read-only query (SELECT, WITH, DESCRIBE, or SHOW).\n"
            "3) Output the SQL query only — no markdown fences, no explanation, no comments.\n"
            "4) Prefer explicit column names over SELECT * when practical.\n"
            "5) If the user asks for a row count, use: SELECT COUNT(*) AS row_count FROM data.\n"
            "6) If the user asks for column/header/field/key names only, prefer: DESCRIBE data.\n\n"
            f"User intent:\n{user_intent}"
        ),
        expected_output="A single valid DuckDB SQL query string with no surrounding text.",
        agent=sql_planner,
        context=[inspect_task],
    )

    execute_task = Task(
        description=(
            "The previous task produced a DuckDB SQL query.\n"
            "Use the execute_sql_query tool to run that SQL query exactly as written.\n"
            "Pass the SQL string directly to the tool without modification.\n"
            "Return the full JSON result from the tool."
        ),
        expected_output=(
            "A JSON object with keys: file_type, columns, rows, row_count, returned_rows, truncated."
        ),
        agent=data_analyst,
        context=[sql_task],
    )

    crew = Crew(
        agents=[data_analyst, sql_planner],
        tasks=[inspect_task, sql_task, execute_task],
        process=Process.sequential,
        verbose=False,
    )

    logger.info("Executing crew (3 tasks: inspect → plan SQL → execute)...")
    try:
        crew_output = await crew.kickoff_async()
    except Exception as e:
        logger.error(f"  ERROR in crew.kickoff_async: {e}", exc_info=True)
        raise ValueError(f"Agent crew failed: {e}") from e

    tasks_output = crew_output.tasks_output

    # Extract schema from inspect_task output (task 0)
    schema_info = _extract_json(str(tasks_output[0].raw)) if len(tasks_output) > 0 else {}

    # Extract and validate SQL from sql_task output (task 1)
    raw_sql = str(tasks_output[1].raw) if len(tasks_output) > 1 else ""
    sql = _validate_sql(_extract_sql(raw_sql))
    logger.info(f"Generated SQL: {sql[:150]}...")

    # Extract query result from execute_task output (task 2)
    query_result = _extract_json(str(tasks_output[2].raw)) if len(tasks_output) > 2 else {}

    logger.info("=== run_data_agent END ===")
    return {
        "provider": provider,
        "model": model,
        "sql": sql,
        "schema_info": schema_info,
        "query_result": query_result,
    }

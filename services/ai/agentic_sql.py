import re

from crewai import Agent, Crew, LLM, Process, Task

from config import hf_api_token, hf_base_url, hf_model_name, llm_max_tokens, ollama_base_url, resolve_llm_selection


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


def _build_llm(provider: str, model: str) -> LLM:
    if provider == "ollama":
        return LLM(
            provider="openai",
            model=model,
            api_key="ollama",
            base_url=ollama_base_url(),
            temperature=0,
            max_tokens=llm_max_tokens(),
        )

    return LLM(
        provider="openai",
        model=model,
        api_key=hf_api_token(),
        base_url=hf_base_url(),
        temperature=0,
        max_tokens=llm_max_tokens(),
    )


def _schema_to_text(schema: list[dict]) -> str:
    lines = []
    for col in schema:
        lines.append(f"- {col['column']}: {col['type']} (nullable={col['nullable']})")
    return "\n".join(lines)


def _extract_sql(raw_text: str) -> str:
    fenced_match = re.search(r"```(?:sql)?\s*(.*?)```", raw_text, flags=re.IGNORECASE | re.DOTALL)
    if fenced_match:
        return fenced_match.group(1).strip()

    statement_match = re.search(r"(with\s+.*|select\s+.*)", raw_text, flags=re.IGNORECASE | re.DOTALL)
    if statement_match:
        return statement_match.group(1).strip()

    return raw_text.strip()


def _validate_sql(sql: str) -> str:
    normalized = sql.strip().rstrip(";")
    if not normalized:
        raise ValueError("Model returned empty SQL.")

    lowered = normalized.lower()
    if not (lowered.startswith("select") or lowered.startswith("with")):
        raise ValueError("Only read-only SELECT queries are allowed.")

    if ";" in normalized:
        raise ValueError("Multiple SQL statements are not allowed.")

    for keyword in FORBIDDEN_SQL_KEYWORDS:
        if re.search(rf"\b{keyword}\b", lowered):
            raise ValueError(f"Unsafe SQL keyword detected: {keyword}")

    return normalized


def generate_sql_from_intent(
    user_intent: str,
    schema: list[dict],
    row_count: int,
    llm_provider: str | None = None,
    llm_model: str | None = None,
) -> tuple[str, str, str]:
    provider, model = resolve_llm_selection(llm_provider, llm_model)
    if provider == "huggingface" and not llm_model:
        model = hf_model_name()

    llm = _build_llm(provider, model)

    agent = Agent(
        role="DuckDB SQL Planner",
        goal="Generate a single, correct DuckDB SELECT query for the user's request.",
        backstory=(
            "You are an expert SQL planner for tabular files. "
            "You only produce one read-only DuckDB query over table data."
        ),
        llm=llm,
        verbose=False,
    )

    task = Task(
        description=(
            "You are given the schema for table `data` and a user intent.\n"
            "Return exactly one DuckDB SQL query and nothing else.\n"
            "Rules:\n"
            "1) Use only table name `data`.\n"
            "2) Output exactly one read-only query (SELECT/WITH).\n"
            "3) No markdown, no explanation, no comments.\n"
            "4) Prefer explicit columns over SELECT * when practical.\n"
            "5) If user asks for row count, use SELECT COUNT(*) AS row_count FROM data.\n\n"
            f"Row count (pre-computed): {row_count}\n"
            f"Schema:\n{_schema_to_text(schema)}\n\n"
            f"User intent:\n{user_intent}"
        ),
        expected_output="A single DuckDB SQL query string.",
        agent=agent,
    )

    crew = Crew(agents=[agent], tasks=[task], process=Process.sequential, verbose=False)
    result = crew.kickoff()
    sql = _extract_sql(str(result))
    return _validate_sql(sql), provider, model

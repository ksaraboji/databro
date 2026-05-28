import json
import logging
import base64
import mimetypes
import os
import re
import urllib.request
from typing import Any

from crewai import Agent, Crew, LLM, Process, Task
from crewai.tools import tool
from duckduckgo_search import DDGS

from config import (
    hf_api_token,
    hf_base_url,
    hf_model_name,
    llm_max_tokens,
    ollama_api_key,
    ollama_base_url,
    resolve_llm_selection,
)

logger = logging.getLogger(__name__)

DEFAULT_VISION_MODEL = os.getenv("HF_VISION_MODEL", "google/gemma-4-31B-it")
PRESCRIPTION_DEBUG_LOGS = os.getenv("PRESCRIPTION_DEBUG_LOGS", "true").strip().lower() in {"1", "true", "yes", "on"}
PRESCRIPTION_LOG_MAX_CHARS = int(os.getenv("PRESCRIPTION_LOG_MAX_CHARS", "0"))


def _clip_for_log(value: Any, max_chars: int = PRESCRIPTION_LOG_MAX_CHARS) -> str:
    text = value if isinstance(value, str) else json.dumps(value, default=str)
    if max_chars <= 0:
        return text
    if len(text) <= max_chars:
        return text
    return f"{text[:max_chars]}... [truncated {len(text) - max_chars} chars]"


def _log_prescription_debug(event: str, **fields: Any) -> None:
    if not PRESCRIPTION_DEBUG_LOGS:
        return

    safe_fields = {key: _clip_for_log(value) for key, value in fields.items()}
    logger.info("prescription_debug:%s %s", event, json.dumps(safe_fields, default=str))


def _build_llm(provider: str, model: str) -> LLM:
    if provider == "ollama":
        base_url = ollama_base_url()
        model_name = model.removeprefix("ollama/")
        return LLM(
            provider="ollama",
            model=model_name,
            api_key=ollama_api_key(),
            base_url=base_url,
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


def _extract_json(raw_text: str) -> dict[str, Any]:
    text = raw_text.strip()
    if not text:
        return {}

    try:
        parsed = json.loads(text)
        if isinstance(parsed, dict):
            return parsed
    except (ValueError, TypeError):
        pass

    fenced = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, flags=re.DOTALL | re.IGNORECASE)
    if fenced:
        try:
            parsed = json.loads(fenced.group(1))
            if isinstance(parsed, dict):
                return parsed
        except (ValueError, TypeError):
            pass

    depth = 0
    start = -1
    for index, ch in enumerate(text):
        if ch == "{":
            if depth == 0:
                start = index
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0 and start != -1:
                candidate = text[start : index + 1]
                try:
                    parsed = json.loads(candidate)
                    if isinstance(parsed, dict):
                        return parsed
                except (ValueError, TypeError):
                    pass
                start = -1

    return {}


def _call_hf_gemma_vision_model(image_path: str, model_name: str) -> str:
    with open(image_path, "rb") as image_file:
        image_bytes = image_file.read()

    if not image_bytes:
        raise ValueError("Uploaded image is empty.")

    mime_type = mimetypes.guess_type(image_path)[0] or "application/octet-stream"
    image_b64 = base64.b64encode(image_bytes).decode("utf-8")

    _log_prescription_debug(
        "vision_request_prepared",
        image_path=image_path,
        model_name=model_name,
        mime_type=mime_type,
        image_bytes=len(image_bytes),
    )

    url = f"{hf_base_url().rstrip('/')}/chat/completions"
    payload = {
        "model": model_name,
        "temperature": 0,
        "messages": [
            {
                "role": "system",
                "content": "You are a precise prescription transcription assistant. Return only raw extracted text from the image.",
            },
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": "Extract all visible handwritten prescription text exactly. Keep line breaks where meaningful. Do not explain.",
                    },
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:{mime_type};base64,{image_b64}",
                        },
                    },
                ],
            },
        ],
    }

    request = urllib.request.Request(
        url,
        method="POST",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {hf_api_token()}",
            "Content-Type": "application/json",
        },
    )

    try:
        with urllib.request.urlopen(request, timeout=120) as response:
            payload = response.read().decode("utf-8")
            _log_prescription_debug(
                "vision_response_received",
                status=getattr(response, "status", "unknown"),
                payload_preview=payload,
            )
    except Exception as exc:
        _log_prescription_debug("vision_request_failed", error=str(exc), model_name=model_name)
        raise ValueError(f"Gemma vision model call failed: {exc}") from exc

    try:
        parsed = json.loads(payload)
    except json.JSONDecodeError as exc:
        raise ValueError(f"Gemma vision model returned non-JSON output: {payload[:200]}") from exc

    if isinstance(parsed, dict):
        choices = parsed.get("choices")
        if isinstance(choices, list) and choices:
            first_choice = choices[0] if isinstance(choices[0], dict) else {}
            message = first_choice.get("message") if isinstance(first_choice, dict) else {}
            content = message.get("content") if isinstance(message, dict) else ""

            if isinstance(content, str) and content.strip():
                return content.strip()

            if isinstance(content, list):
                text_parts: list[str] = []
                for item in content:
                    if isinstance(item, dict):
                        if isinstance(item.get("text"), str) and item["text"].strip():
                            text_parts.append(item["text"].strip())
                if text_parts:
                    return "\n".join(text_parts)

    raise ValueError(f"Gemma vision model returned no usable text: {str(parsed)[:240]}")


def make_vision_extraction_tool(image_path: str, model_name: str, result_store: dict[str, Any]):
    @tool("Extract Prescription Raw Text With Gemma Vision")
    def extract_prescription_raw_text(_: str = "extract") -> str:
        """Extract raw text from the uploaded handwritten prescription image using Gemma vision."""
        _log_prescription_debug("vision_tool_invoked", image_path=image_path, model_name=model_name)
        text = _call_hf_gemma_vision_model(image_path=image_path, model_name=model_name)
        result_store["raw_text"] = text
        _log_prescription_debug("vision_tool_output", raw_text=text)
        return text

    return extract_prescription_raw_text


def _search_duckduckgo(query: str) -> dict[str, Any]:
    related: list[dict[str, str]] = []
    instant_answers: list[dict[str, str]] = []

    with DDGS() as ddgs:
        for row in ddgs.text(query, max_results=5):
            if not isinstance(row, dict):
                continue
            related.append(
                {
                    "title": str(row.get("title", "")),
                    "text": str(row.get("body", "")),
                    "url": str(row.get("href", "")),
                }
            )

        for row in ddgs.answers(query):
            if not isinstance(row, dict):
                continue
            instant_answers.append(
                {
                    "text": str(row.get("text", "")),
                    "topic": str(row.get("topic", "")),
                    "url": str(row.get("url", "")),
                }
            )
            if len(instant_answers) >= 3:
                break

    output = {
        "query": query,
        "instant_answers": instant_answers,
        "related": related,
        "source": "ddgs",
    }

    _log_prescription_debug(
        "duckduckgo_search_completed",
        query=query,
        instant_answers_count=len(instant_answers),
        related_count=len(related),
        result=output,
    )

    return output


def make_duckduckgo_tool(search_cache: dict[str, Any]):
    @tool("DuckDuckGo Medicine Search")
    def duckduckgo_medicine_search(query: str) -> str:
        """Search medicine information when the user asks about uses, reasons, safety, or interactions."""
        normalized = query.strip().lower()
        if not normalized:
            return json.dumps({"error": "query is required"})

        if normalized in search_cache:
            cached_payload = {"cached": True, "result": search_cache[normalized]}
            _log_prescription_debug("duckduckgo_tool_cache_hit", query=query, result=cached_payload)
            return json.dumps(cached_payload)

        result = _search_duckduckgo(query)
        search_cache[normalized] = result
        uncached_payload = {"cached": False, "result": result}
        _log_prescription_debug("duckduckgo_tool_cache_miss", query=query, result=uncached_payload)
        return json.dumps(uncached_payload)

    return duckduckgo_medicine_search


async def run_prescription_agent(
    user_intent: str,
    session_state: dict[str, Any],
    image_path: str | None = None,
    llm_provider: str | None = None,
    llm_model: str | None = None,
) -> dict[str, Any]:
    if not user_intent.strip():
        raise ValueError("user_intent is required.")

    provider, model = resolve_llm_selection(llm_provider, llm_model)
    if provider == "huggingface" and not llm_model:
        model = hf_model_name()

    llm = _build_llm(provider, model)

    result_store: dict[str, Any] = {}
    search_cache = session_state.setdefault("search_cache", {})
    search_tool = make_duckduckgo_tool(search_cache)

    has_cached_extraction = bool(session_state.get("raw_text") and session_state.get("structured_data"))
    _log_prescription_debug(
        "run_started",
        provider=provider,
        model=model,
        has_image=bool(image_path),
        has_cached_extraction=has_cached_extraction,
        user_intent=user_intent,
        search_cache_size=len(search_cache),
    )

    if has_cached_extraction:
        raw_text = str(session_state.get("raw_text", ""))
        structured_data = session_state.get("structured_data", {})
        _log_prescription_debug(
            "using_cached_extraction",
            raw_text=raw_text,
            structured_data=structured_data,
        )

        response_agent = Agent(
            role="Prescription Facts Assistant",
            goal="Answer user questions from extracted prescription data with factual tone.",
            backstory=(
                "You are a prescription assistant. You answer from extracted text first. "
                "Use DuckDuckGo search tool only when user asks for medicine purpose, usage reasons, "
                "safety guidance, or the medicine name is unclear."
            ),
            tools=[search_tool],
            llm=llm,
            verbose=False,
        )

        response_task = Task(
            description=(
                "Use the cached prescription data below and answer the user intent.\n\n"
                f"Cached raw text:\n{raw_text}\n\n"
                f"Cached structured data (JSON):\n{json.dumps(structured_data)}\n\n"
                f"User intent:\n{user_intent}\n\n"
                "Output JSON only with keys: answer (string), factual_points (array of strings), "
                "used_search (boolean)."
            ),
            expected_output="A JSON object with answer, factual_points, used_search.",
            agent=response_agent,
        )

        crew = Crew(
            agents=[response_agent],
            tasks=[response_task],
            process=Process.sequential,
            verbose=False,
        )

        crew_output = await crew.kickoff_async()
        _log_prescription_debug(
            "cached_flow_task_output",
            response_task_raw=str(crew_output.tasks_output[0].raw) if crew_output.tasks_output else "",
        )
        response_payload = _extract_json(str(crew_output.tasks_output[0].raw))
        answer = response_payload.get("answer") or str(crew_output.tasks_output[0].raw)
        _log_prescription_debug(
            "cached_flow_response_parsed",
            response_payload=response_payload,
            answer=answer,
        )

        return {
            "provider": provider,
            "model": model,
            "raw_text": raw_text,
            "structured_data": structured_data,
            "answer": answer,
            "factual_points": response_payload.get("factual_points", []),
            "used_search": bool(response_payload.get("used_search", False)),
            "extraction_reused": True,
            "search_cache_size": len(search_cache),
        }

    if not image_path:
        raise ValueError("Prescription image is required for a new session.")

    vision_model = model if provider == "huggingface" else DEFAULT_VISION_MODEL
    _log_prescription_debug("vision_model_selected", provider=provider, vision_model=vision_model)
    vision_tool = make_vision_extraction_tool(image_path=image_path, model_name=vision_model, result_store=result_store)

    extraction_agent = Agent(
        role="Prescription Vision Extraction Specialist",
        goal="Extract raw handwritten prescription text accurately from images using Gemma vision.",
        backstory=(
            "You specialize in medical handwriting transcription with multimodal language models. "
            "You extract text exactly and do not hallucinate missing values."
        ),
        tools=[vision_tool],
        llm=llm,
        verbose=False,
    )

    response_agent = Agent(
        role="Prescription Facts Assistant",
        goal="Answer user questions from extracted prescription data with factual tone.",
        backstory=(
            "You structure prescription fields and answer from evidence. "
            "Use DuckDuckGo search tool only for medicine purpose/uses/safety when needed by user intent."
        ),
        tools=[search_tool],
        llm=llm,
        verbose=False,
    )

    ocr_task = Task(
        description=(
            "Use the Extract Prescription Raw Text With Gemma Vision tool to read the uploaded image. "
            "Return the raw extracted text exactly."
        ),
        expected_output="Raw text extracted from the prescription image.",
        agent=extraction_agent,
    )

    struct_task = Task(
        description=(
            "Using the raw text from prior task, extract structured medication facts.\n"
            "Return JSON only with keys:\n"
            "- medicines: array of objects with medicine_name, dosage, frequency, food_instruction, duration, notes\n"
            "- patient_instructions: array of strings\n"
            "- caution_flags: array of strings\n"
            "- unknown_or_unclear: array of strings\n"
            "If a field is missing, use empty string. Do not invent details."
        ),
        expected_output=(
            "JSON containing medicines, patient_instructions, caution_flags, unknown_or_unclear."
        ),
        agent=response_agent,
        context=[ocr_task],
    )

    response_task = Task(
        description=(
            "Answer the user intent using structured prescription data from prior task.\n"
            f"User intent:\n{user_intent}\n\n"
            "Use DuckDuckGo search tool only if the user asks about medicine purpose/reason, "
            "uses, side effects, interactions, or if medicine name confidence is low.\n"
            "Output JSON only with keys: answer (string), factual_points (array of strings), used_search (boolean)."
        ),
        expected_output="A JSON object with answer, factual_points, used_search.",
        agent=response_agent,
        context=[struct_task],
    )

    crew = Crew(
        agents=[extraction_agent, response_agent],
        tasks=[ocr_task, struct_task, response_task],
        process=Process.sequential,
        verbose=False,
    )

    crew_output = await crew.kickoff_async()
    tasks_output = crew_output.tasks_output
    for index, task_output in enumerate(tasks_output):
        _log_prescription_debug("task_output", task_index=index, raw=str(task_output.raw))

    raw_text = result_store.get("raw_text", str(tasks_output[0].raw) if len(tasks_output) > 0 else "")
    structured_data = _extract_json(str(tasks_output[1].raw)) if len(tasks_output) > 1 else {}
    response_payload = _extract_json(str(tasks_output[2].raw)) if len(tasks_output) > 2 else {}
    _log_prescription_debug(
        "fresh_flow_parsed",
        raw_text=raw_text,
        structured_data=structured_data,
        response_payload=response_payload,
    )

    session_state["raw_text"] = raw_text
    session_state["structured_data"] = structured_data

    answer = response_payload.get("answer") or (str(tasks_output[2].raw) if len(tasks_output) > 2 else "")
    _log_prescription_debug("run_completed", answer=answer, search_cache_size=len(search_cache))

    return {
        "provider": provider,
        "model": model,
        "raw_text": raw_text,
        "structured_data": structured_data,
        "answer": answer,
        "factual_points": response_payload.get("factual_points", []),
        "used_search": bool(response_payload.get("used_search", False)),
        "extraction_reused": False,
        "search_cache_size": len(search_cache),
    }

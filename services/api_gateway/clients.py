import httpx
import os
from typing import Optional

LLM_SERVICE_URL = os.getenv("LLM_SERVICE_URL", "http://llm-service:11434")
RAG_SERVICE_URL = os.getenv("RAG_SERVICE_URL", "http://rag-service:80")
SPEECH_SERVICE_URL = os.getenv("SPEECH_SERVICE_URL", "http://speech-service:80")

async def generate_completion(prompt: str, model: str = "llama3.2") -> str:
    """Calls the LLM service to generate text."""
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{LLM_SERVICE_URL}/api/generate",
                json={"model": model, "prompt": prompt, "stream": False},
                timeout=120.0
            )
            response.raise_for_status()
            return response.json().get("response", "")
    except Exception as e:
        print(f"Error calling LLM: {e}")
        return "I apologize, but I am having trouble connecting to my logic center right now."

async def query_rag(query: str) -> str:
    """Calls the RAG service to search for context."""
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{RAG_SERVICE_URL}/search",
                json={"query": query, "k": 3},
                timeout=30.0
            )
            response.raise_for_status()
            results = response.json()
            # Simplify context for the LLM
            context = "\n".join([f"- {r['text']}" for r in results])
            return context
    except Exception as e:
        print(f"Error calling RAG: {e}")
        return ""

async def transcribe_audio(file_content: bytes, filename: str) -> dict:
    """Calls the Speech service to transcribe audio."""
    try:
        # Prepare multipart upload
        files = {"file": (filename, file_content, "audio/wav")}
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{SPEECH_SERVICE_URL}/transcribe",
                files=files,
                timeout=60.0
            )
            response.raise_for_status()
            return response.json()
    except Exception as e:
        print(f"Error calling Speech Service: {e}")
        return {"error": str(e)}

async def synthesize_speech(text: str) -> Optional[str]:
    """Calls the Speech service to convert text to speech."""
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{SPEECH_SERVICE_URL}/speak",
                json={"text": text},
                timeout=60.0 # TTS can take time
            )
            response.raise_for_status()
            return response.json().get("audio_url")
    except Exception as e:
        print(f"Error calling Speech Service (TTS): {e}")
        return None 

async def seed_rag_data(text: str, filename: str, topic: Optional[str] = None) -> dict:
    """Calls the RAG service to seed data."""
    try:
        metadata = {"source": filename}
        if topic:
            metadata["topic"] = topic
            
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{RAG_SERVICE_URL}/seed",
                json={"text": text, "metadata": metadata},
                timeout=300.0
            )
            response.raise_for_status()
            return response.json()
    except Exception as e:
        print(f"Error seeding RAG: {e}")
        return {"error": str(e)}

async def ingest_rag_data(text: str, filename: str, topic: Optional[str] = None) -> dict:
    """Calls the RAG service to ingest data (append)."""
    try:
        metadata = {"source": filename}
        if topic:
            metadata["topic"] = topic

        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{RAG_SERVICE_URL}/ingest",
                json={"text": text, "metadata": metadata},
                timeout=300.0
            )
            
            # Check for error status and try to parse detail
            if response.is_error:
                try:
                    error_detail = response.json().get("detail", response.text)
                    return {"error": f"RAG Service Error ({response.status_code}): {error_detail}"}
                except:
                    return {"error": f"RAG Service Error ({response.status_code}): {response.text}"}

            return response.json()
    except Exception as e:
        print(f"Error ingesting RAG: {e}")
        return {"error": str(e)}

async def fetch_rag_topics() -> list:
    """Fetches available topics from RAG service."""
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(f"{RAG_SERVICE_URL}/topics", timeout=5.0)
            if response.status_code == 200:
                return response.json().get("topics", [])
    except Exception as e:
        print(f"Error fetching topics from RAG: {e}")
    
    # Fallback to default topics if service is down or empty
    return ["Data Engineering 101", "DuckDB Internals", "RAG Architectures"]

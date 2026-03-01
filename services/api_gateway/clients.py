import httpx
import os
import asyncio
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
                timeout=300.0
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

async def synthesize_speech(text: str) -> dict:
    """Calls the Speech service to convert text to speech."""
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{SPEECH_SERVICE_URL}/speak",
                json={"text": text},
                timeout=120.0 # TTS can take time
            )
            # Don't raise for status yet, check content
            if response.status_code != 200:
                return {"error": f"Speech Service Error ({response.status_code}): {response.text}"}
                
            return {"audio_url": response.json().get("audio_url")}
    except Exception as e:
        print(f"Error calling Speech Service (TTS): {e}")
        return {"error": str(e)} 

async def generate_music_track(prompt: str, duration: int = 10) -> Optional[bytes]:
    """Calls the HF Endpoint to generate music."""
    # Use user-provided dedicated endpoint
    url = "https://brkfdgvdr1bdxm4b.us-east-1.aws.endpoints.huggingface.cloud"
    api_key = os.getenv("HF_API_KEY")

    if not api_key:
        print("Error: HF_API_KEY not found in environment for music generation.")
        return None

    print(f"Calling HF Endpoint (Music) with prompt: '{prompt[:30]}...' duration: {duration}s")
    
    # Retry configuration
    max_retries = 5
    initial_delay = 15  # seconds
    
    try:
        async with httpx.AsyncClient() as client:
            for attempt in range(max_retries):
                try:
                    print(f"Attempt {attempt + 1}/{max_retries} to generate music...")
                    response = await client.post(
                        url,
                        headers={
                            "Authorization": f"Bearer {api_key}",
                            "Content-Type": "application/json"
                        },
                        json={"inputs": prompt}, 
                        timeout=600.0 
                    )
                    
                    if response.status_code == 200:
                        print(f"Music generated successfully. Size: {len(response.content)} bytes")
                        return response.content
                    
                    if response.status_code == 503:
                        # Service Unavailable - likely starting up
                        wait_time = initial_delay * (attempt + 1) # simple backoff
                        print(f"HF Endpoint paused/busy (503). Retrying in {wait_time}s...")
                        await asyncio.sleep(wait_time)
                        continue
                        
                    # Other errors - fail fast
                    print(f"HF Endpoint Music Error ({response.status_code}): {response.text}")
                    return None
                    
                except httpx.ReadTimeout:
                    print(f"ReadTimeout on attempt {attempt+1}. Extending wait...")
                    await asyncio.sleep(10)
                    continue
            
            print("Max retries reached for music generation.")
            return None
            
    except Exception as e:
        print(f"Error calling HF Endpoint (Music): {type(e).__name__} - {e}")
        import traceback
        traceback.print_exc()
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
    rag_topics = []
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(f"{RAG_SERVICE_URL}/topics", timeout=5.0)
            if response.status_code == 200:
                rag_topics = response.json().get("topics", [])
    except Exception as e:
        print(f"Error fetching topics from RAG: {e}")
    
    # Return only topics from RAG service
    return sorted(rag_topics)

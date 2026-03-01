import httpx
import os
import asyncio
from typing import Optional
import uuid
import filetype

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
                        audio_bytes = response.content
                        print(f"Music generated successfully. Raw Size: {len(audio_bytes)} bytes")
                        
                        # CHECK FOR JSON WRAPPER (Common cause of 'unknown' bin file with text header)
                        # Hex 5b7b... is '[{' which means we got a JSON response instead of raw bytes.
                        try:
                            # Heuristic: Check if starts with JSON chars
                            if audio_bytes.strip().startswith(b'[') or audio_bytes.strip().startswith(b'{'):
                                import json
                                import base64
                                print("Detected JSON response structure. Attempting to parse...")
                                json_data = response.json()
                                
                                # Handle list response: [{"generated_audio": "..."}] or [{"audio": "..."}]
                                if isinstance(json_data, list) and len(json_data) > 0:
                                    first_item = json_data[0]
                                    if isinstance(first_item, dict):
                                        # Look for common keys
                                        for key in ["generated_audio", "audio", "blob", "content"]:
                                            if key in first_item:
                                                print(f"Found audio data in key: '{key}'")
                                                audio_val = first_item[key]
                                                if isinstance(audio_val, str):
                                                    # Assume base64
                                                    import base64
                                                    audio_bytes = base64.b64decode(audio_val)
                                                    print(f"Decoded Base64 audio. New Size: {len(audio_bytes)}")
                                                elif isinstance(audio_val, list):
                                                    # Handle PCM float list ([-0.1, 0.4, ...]) or [[...]]
                                                    import struct
                                                    print(f"Detected PCM float list of length {len(audio_val)}. Converting to WAV...")
                                                    try:
                                                        # Flatten list if it's nested (e.g., stereo channels or batches)
                                                        flat_audio = []
                                                        for item in audio_val:
                                                            if isinstance(item, list):
                                                                flat_audio.extend(item)
                                                            else:
                                                                flat_audio.append(item)

                                                        # Assume 32kHz Mono (standard MusicGen output)
                                                        sample_rate = 32000
                                                        scaled_samples = [int(max(min(float(s), 1.0), -1.0) * 32767) for s in flat_audio]
                                                        raw_data = struct.pack(f'<{len(scaled_samples)}h', *scaled_samples)
                                                        
                                                        # WAV Header Construction
                                                        header = struct.pack(
                                                            '<4sI4s4sIHHIIHH4sI',
                                                            b'RIFF', 36 + len(raw_data), b'WAVE', b'fmt ', 16, 1, 1, sample_rate,
                                                            sample_rate * 2, 2, 16, b'data', len(raw_data)
                                                        )
                                                        audio_bytes = header + raw_data
                                                        print(f"Successfully converted {len(flat_audio)} samples to WAV ({len(audio_bytes)} bytes).")
                                                    except Exception as e:
                                                        print(f"Failed to convert PCM list: {e}")
                                                else:
                                                    print(f"Warning: Key '{key}' content is not string. Type: {type(audio_val)}")
                                                break
                                    # Fallback: if it's just raw bytes in a list? Unlikely for musicgen.
                                
                                # Handle dict response: {"generated_audio": "..."}
                                elif isinstance(json_data, dict):
                                     for key in ["generated_audio", "audio", "blob", "content"]:
                                            if key in json_data:
                                                print(f"Found audio data in key: '{key}'")
                                                audio_val = json_data[key]
                                                if isinstance(audio_val, str):
                                                    # Assume base64
                                                    import base64
                                                    audio_bytes = base64.b64decode(audio_val)
                                                    print(f"Decoded Base64 audio. New Size: {len(audio_bytes)}")
                                                elif isinstance(audio_val, list):
                                                    # Handle PCM float list ([-0.1, 0.4, ...])
                                                    import struct
                                                    print(f"Detected PCM float list of length {len(audio_val)}. Converting to WAV...")
                                                    try:
                                                        flat_audio = []
                                                        for item in audio_val:
                                                            if isinstance(item, list):
                                                                flat_audio.extend(item)
                                                            else:
                                                                flat_audio.append(item)
                                                                
                                                        sample_rate = 32000
                                                        scaled_samples = [int(max(min(float(s), 1.0), -1.0) * 32767) for s in flat_audio]
                                                        raw_data = struct.pack(f'<{len(scaled_samples)}h', *scaled_samples)
                                                        header = struct.pack(
                                                            '<4sI4s4sIHHIIHH4sI',
                                                            b'RIFF', 36 + len(raw_data), b'WAVE', b'fmt ', 16, 1, 1, sample_rate,
                                                            sample_rate * 2, 2, 16, b'data', len(raw_data)
                                                        )
                                                        audio_bytes = header + raw_data
                                                        print(f"Successfully converted {len(flat_audio)} samples to WAV ({len(audio_bytes)} bytes).")
                                                    except Exception as e:
                                                        print(f"Failed to convert PCM list: {e}")
                                                else:
                                                    print(f"Warning: Key '{key}' content is not string. Type: {type(audio_val)}")
                                                break
                        except Exception as json_e:
                            print(f"JSON parsing failed (might be raw audio after all): {json_e}")
                            # If parsing failed, we assume it's raw audio (or corrupted) and proceed to detection
                        
                        # Use filetype to guess the real extension
                        kind = filetype.guess(audio_bytes)
                        ext = kind.extension if kind else "bin"
                        print(f"Detected music type: {kind.mime if kind else 'unknown'} ({ext})")

                        
                        # Fallback for FLAC if filetype misses it (common with raw streams)
                        if kind is None:
                            if audio_bytes.startswith(b'fLaC'):
                                ext = "flac"
                                print("Manual detection: FLAC")
                            elif audio_bytes.startswith(b'RIFF'):
                                ext = "wav"
                                print("Manual detection: WAV")
                            elif audio_bytes.startswith(b'OggS'):
                                ext = "ogg"
                                print("Manual detection: OGG")
                            elif audio_bytes.startswith(b'ID3') or audio_bytes.startswith(b'\xff\xfb'):
                                ext = "mp3"
                                print("Manual detection: MP3")
                            else:
                                # Start of file hex dump for debugging
                                print(f"Unknown audio header: {audio_bytes[:16].hex()}")

                        # Create a temp file with the DETECTED extension
                        # Use .bin if unknown so ffmpeg is forced to probe
                        temp_input = f"/tmp/raw_music_{uuid.uuid4().hex}.{ext}"
                        final_wav = f"/tmp/music_{uuid.uuid4().hex}.wav"
                        
                        with open(temp_input, "wb") as f:
                            f.write(audio_bytes)
                            
                        # Convert WHATEVER we got (flac, ogg, mp3) to a standard PCM WAV
                        # This fixes the "corruption" issue by re-encoding standard headers
                        try:
                            # Added -f wav to force output format
                            # Added specific input format handling if extension is ambiguous
                            # Remove -acodec pcm_s16le if input is weird, let ffmpeg handle it
                            # But we want standard wav output.
                            
                            cmd = ["ffmpeg", "-y", "-i", temp_input, "-ac", "2", "-ar", "44100", final_wav]
                            
                            print(f"Converting {temp_input} to canonical WAV using: {' '.join(cmd)}")
                            
                            process = await asyncio.create_subprocess_exec(
                                *cmd,
                                stdout=asyncio.subprocess.PIPE,
                                stderr=asyncio.subprocess.PIPE
                            )
                            stdout, stderr = await process.communicate()
                            
                            # Log full output if failure or weirdness
                            if process.returncode != 0:
                                error_msg = stderr.decode()
                                print(f"FFmpeg conversion error: {error_msg}")
                                raise Exception(f"FFmpeg failed to convert audio: {error_msg}")
                            
                            # Verify strict WAV header
                            if os.path.exists(final_wav) and os.path.getsize(final_wav) > 1000: # Ensure not just a header
                                with open(final_wav, "rb") as f:
                                    clean_wav_bytes = f.read()
                                
                                # Double check header manually
                                if not clean_wav_bytes.startswith(b'RIFF'):
                                     print("FFmpeg produced file without RIFF header!")
                                     raise Exception("Invalid WAV header produced")
                                     
                                print(f"Successfully converted music to WAV. Size: {len(clean_wav_bytes)}")
                                
                                # Cleanup
                                if os.path.exists(temp_input): os.remove(temp_input)
                                if os.path.exists(final_wav): os.remove(final_wav)
                                
                                return clean_wav_bytes
                            else:
                                print(f"FFmpeg conversion failed: Output file too small or missing.")
                                if os.path.exists(temp_input): os.remove(temp_input)
                                if os.path.exists(final_wav): os.remove(final_wav)
                                return None # Explicit failure
                                
                        except Exception as conv_e:
                            print(f"Error during audio conversion: {conv_e}")
                            if os.path.exists(temp_input): os.remove(temp_input)
                            if os.path.exists(final_wav): os.remove(final_wav)
                            return None # Return None to signal failure, rather than bad bytes
                    
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

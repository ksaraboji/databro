import os
import uuid
import tempfile
from fastapi import FastAPI, UploadFile, File, HTTPException, BackgroundTasks
from fastapi.responses import JSONResponse, Response
from contextlib import asynccontextmanager
from pydantic import BaseModel
from azure.storage.blob import BlobServiceClient, ContentSettings
from faster_whisper import WhisperModel
from TTS.api import TTS
from transformers import pipeline
import scipy.io.wavfile
import numpy as np
import io

# Global model variables
stt_model = None
tts = None
music_gen = None

# --- Configuration ---
# Models
STT_MODEL_SIZE = "base.en" # 'tiny', 'base', 'small', 'medium', 'large'
TTS_MODEL_NAME = "tts_models/en/ljspeech/vits" # Fast and reasonable quality
MUSIC_MODEL_NAME = "facebook/musicgen-small"

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Load models on startup
    global stt_model, tts, music_gen
    
    print(f"Loading Whisper model: {STT_MODEL_SIZE}...")
    # device="cpu" for Container Apps Consumption plan (no GPU)
    # compute_type="int8" for memory efficiency
    try:
        stt_model = WhisperModel(STT_MODEL_SIZE, device="cpu", compute_type="int8")
        print("Whisper model loaded.")
    except Exception as e:
        print(f"Failed to load Whisper model: {e}")

    print(f"Loading TTS model: {TTS_MODEL_NAME}...")
    try:
        # gpu=False
        tts = TTS(model_name=TTS_MODEL_NAME, progress_bar=False, gpu=False)
        print("TTS model loaded.")
    except Exception as e:
        print(f"Failed to load TTS model: {e}")

    print(f"Loading MusicGen model: {MUSIC_MODEL_NAME}...")
    try:
        music_gen = pipeline("text-to-audio", MUSIC_MODEL_NAME)
        print("MusicGen model loaded.")
    except Exception as e:
        print(f"Failed to load MusicGen model: {e}")
        
    yield
    
    # Clean up resources if needed
    print("Shutting down models...")
    del stt_model
    del tts
    del music_gen

app = FastAPI(title="Speech Service", version="1.0", lifespan=lifespan)

# Azure Storage
AZURE_CONN_STR = os.getenv("AZURE_STORAGE_CONNECTION_STRING")
AUDIO_CONTAINER = os.getenv("AUDIO_CONTAINER_NAME", "public-audio")


class SpeakRequest(BaseModel):
    text: str
    speaker_id: str = None # For multi-speaker models

class MusicRequest(BaseModel):
    prompt: str
    duration: int = 10 

@app.get("/")
def health_check():
    return {"status": "healthy", "stt_model": STT_MODEL_SIZE, "tts_model": TTS_MODEL_NAME}

@app.post("/music")
async def generate_music(req: MusicRequest):
    """
    Music generation from text prompt using Facebook MusicGen.
    """
    if music_gen is None:
        raise HTTPException(status_code=503, detail="MusicGen model not loaded")
        
    try:
        # Check if we should generate via pipeline
        print(f"Generating music for prompt: {req.prompt}")
        # max_new_tokens determines length. 256 tokens ~ 5 sec. 
        # 512 ~ 10 sec.
        tokens = min(req.duration * 50, 1500) 
        
        output = music_gen(req.prompt, forward_params={"do_sample": True, "max_new_tokens": tokens})
        # output is dict: {'audio': array([[...]]), 'sampling_rate': 32000}
        
        audio_data = output["audio"][0] # numpy array
        sampling_rate = output["sampling_rate"]

        # Write to BytesIO as wav
        byte_io = io.BytesIO()
        scipy.io.wavfile.write(byte_io, rate=sampling_rate, data=audio_data)
        
        return Response(content=byte_io.getvalue(), media_type="audio/wav")

    except Exception as e:
        print(f"MusicGen Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/transcribe")
async def transcribe_audio(file: UploadFile = File(...)):
    """
    Speech-to-Text using Whisper.
    Accepts audio file upload, returns transcript.
    """
    if stt_model is None:
        raise HTTPException(status_code=503, detail="Speech-to-Text model not loaded")

    if not file:
        raise HTTPException(status_code=400, detail="No file uploaded")

    # Save to temp file
    with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as tmp:
        tmp.write(await file.read())
        tmp_path = tmp.name

    try:
        segments, info = stt_model.transcribe(tmp_path, beam_size=5)
        
        full_text = ""
        for segment in segments:
            full_text += segment.text + " "
            
        return {
            "text": full_text.strip(),
            "language": info.language,
            "probability": info.language_probability
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        os.remove(tmp_path)

@app.post("/speak")
async def generate_speech(req: SpeakRequest):
    """
    Text-to-Speech.
    Generates audio, uploads to Blob Storage, returns public URL.
    """
    if tts is None:
        raise HTTPException(status_code=503, detail="Text-to-Speech model not loaded")

    if not req.text.strip():
        raise HTTPException(status_code=400, detail="Text cannot be empty")

    if not AZURE_CONN_STR:
        raise HTTPException(status_code=500, detail="Storage configuration missing")

    # Generate Audio
    filename = f"{uuid.uuid4()}.wav"
    output_path = f"/tmp/{filename}"
    
    try:
        # TTS generation
        print(f"Generating TTS for text: {req.text[:50]}...")
        tts.tts_to_file(text=req.text, file_path=output_path)
        print(f"TTS generated at {output_path}")
    except Exception as e:
        print(f"TTS Generation Error: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"TTS Generation Failed: {str(e)}")

    try:
        # Upload to Azure
        print("Connecting to Blob Storage...")
        blob_service = BlobServiceClient.from_connection_string(AZURE_CONN_STR)
        container_client = blob_service.get_container_client(AUDIO_CONTAINER)
        
        # Create container if not exists (ideally done in Infra, but failsafe here)
        if not container_client.exists():
            print(f"Creating container {AUDIO_CONTAINER}...")
            container_client.create_container(public_access="blob")

        blob_client = container_client.get_blob_client(filename)
        
        print(f"Uploading {filename}...")
        with open(output_path, "rb") as data:
            blob_client.upload_blob(
                data, 
                overwrite=True,
                content_settings=ContentSettings(content_type="audio/wav")
            )
            
        return {
            "audio_url": blob_client.url,
            "filename": filename
        }

    except Exception as e:
        print(f"Storage Upload Error: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Storage Upload Failed: {str(e)}")
    finally:
        if os.path.exists(output_path):
            os.remove(output_path)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=80)

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
from transformers import AutoProcessor, MusicgenForConditionalGeneration, pipeline

import scipy.io.wavfile
import numpy as np
import io

# Global model variables
stt_model = None
tts = None
music_processor = None
music_model = None

# --- Configuration ---
# Models
STT_MODEL_SIZE = "base.en" # 'tiny', 'base', 'small', 'medium', 'large'
TTS_MODEL_NAME = "tts_models/en/ljspeech/vits" # Fast and reasonable quality
MUSIC_MODEL_NAME = "facebook/musicgen-small"

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Load models on startup
    global stt_model, tts, music_processor, music_model
    
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
        music_processor = AutoProcessor.from_pretrained(MUSIC_MODEL_NAME)
        # Standard load - the UNEXPECTED weights warning is annoying but harmless
        music_model = MusicgenForConditionalGeneration.from_pretrained(MUSIC_MODEL_NAME)
        print("MusicGen model loaded successfully.")
    except Exception as e:
        print(f"Failed to load MusicGen model (attempt 1): {e}")
        import traceback
        traceback.print_exc()
        try:
           # Fallback mostly for older Transformers versions
           print("Attempting fallback pipeline load...")
           pipe = pipeline("text-to-audio", MUSIC_MODEL_NAME)
           music_model = pipe.model
           music_processor = pipe.processor if hasattr(pipe, "processor") else AutoProcessor.from_pretrained(MUSIC_MODEL_NAME)
           print("MusicGen model loaded via pipeline fallback.")
        except Exception as e2:
           print(f"Failed to load MusicGen model completely: {e2}")
           traceback.print_exc()
        
    yield
    
    # Clean up resources if needed
    print("Shutting down models...")
    del stt_model
    del tts
    del music_processor
    del music_model

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
    Music generation from text prompt using Facebook MusicGen directly.
    Also uploads the generated track to Azure Blob Storage for persistence.
    """
    if music_model is None or music_processor is None:
        print("Error: MusicGen model is not loaded.")
        raise HTTPException(status_code=503, detail="MusicGen model not loaded")
        
    try:
        if music_model is None:
            raise Exception("Model not initialized")
            
        # Check if we should generate via pipeline
        print(f"--- Music Generation Request ---")
        print(f"Prompt: {req.prompt}")
        print(f"Duration: {req.duration}s")
        
        # max_new_tokens determines length. 256 tokens ~ 5 sec. 
        # 512 ~ 10 sec.
        tokens = int(min(req.duration * 50, 1500))
        print(f"Generating tokens: {tokens}")
        
        inputs = music_processor(
            text=[req.prompt],
            padding=True,
            return_tensors="pt",
        )
        
        # audio_values shape: (batch_size, num_channels, sequence_length)
        # We need to reshape for MusicGen
        if hasattr(music_model, "generate"):
             # For direct model usage
             audio_values = music_model.generate(**inputs, max_new_tokens=tokens)
             audio_values = audio_values.cpu().numpy()
             audio_data = audio_values[0, 0]
             
             # Get sampling rate from config, default 32k
             sampling_rate = getattr(music_model.config, "audio_encoder", None)
             if sampling_rate:
                  sampling_rate = getattr(sampling_rate, "sampling_rate", 32000)
             else:
                  sampling_rate = 32000
        else:
             # Pipeline fallback
             print("Using pipeline generation logic...")
             output = music_model(req.prompt, forward_params={"do_sample": True, "max_new_tokens": tokens})
             audio_data = output["audio"][0]
             sampling_rate = output["sampling_rate"]
        print(f"Generation complete. Shape: {audio_data.shape}, Rate: {sampling_rate}")

        # Write to BytesIO as wav
        byte_io = io.BytesIO()
        scipy.io.wavfile.write(byte_io, rate=sampling_rate, data=audio_data)
        wav_bytes = byte_io.getvalue()
        print(f"SUCCESS: WAV file generated. Size: {len(wav_bytes)} bytes.")

        # --- Upload to Azure ---
        if AZURE_CONN_STR:
            try:
                print("Uploading music track to Azure Blob Storage...")
                filename = f"music_{uuid.uuid4()}.wav"
                blob_service = BlobServiceClient.from_connection_string(AZURE_CONN_STR)
                container_client = blob_service.get_container_client(AUDIO_CONTAINER)
                
                if not container_client.exists():
                    container_client.create_container(public_access="blob")
                    
                blob_client = container_client.get_blob_client(filename)
                blob_client.upload_blob(
                    wav_bytes, 
                    overwrite=True,
                    content_settings=ContentSettings(content_type="audio/wav")
                )
                print(f"Music uploaded successfully: {blob_client.url}")
            except Exception as az_e:
                print(f"Azure Upload Failed (Non-fatal): {az_e}")
        else:
            print("Azure Connection String missing. Skipping upload.")

        return Response(content=wav_bytes, media_type="audio/wav")

    except Exception as e:
        print(f"MusicGen Error: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/transcribe")
async def transcribe_audio(file: UploadFile = File(...)):
    """
    Speech-to-Text using Whisper.
    Accepts audio file upload, returns transcript.
    """
    if stt_model is None:
        print("Error: Speech-to-Text model not loaded")
        raise HTTPException(status_code=503, detail="Speech-to-Text model not loaded")

    if not file:
        print("Error: No file uploaded for transcription")
        raise HTTPException(status_code=400, detail="No file uploaded")

    print(f"--- Transcription Request ---")
    print(f"Filename: {file.filename}, Content-Type: {file.content_type}")

    # Save to temp file
    with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as tmp:
        content = await file.read()
        tmp.write(content)
        tmp_path = tmp.name
    
    print(f"File saved temporarily to {tmp_path} ({len(content)} bytes)")

    try:
        print("Starting transcription...")
        segments, info = stt_model.transcribe(tmp_path, beam_size=5)
        
        full_text = ""
        for segment in segments:
            full_text += segment.text + " "
        
        full_text = full_text.strip()
        print(f"Transcription complete. Language: {info.language} ({info.language_probability:.2f})")
        print(f"Transcribed Text (truncated): {full_text[:50]}...")
            
        return {
            "text": full_text,
            "language": info.language,
            "probability": info.language_probability
        }
    except Exception as e:
        print(f"Transcription Error: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)
            print(f"Cleaned up temp file: {tmp_path}")

@app.post("/speak")
async def generate_speech(req: SpeakRequest):
    """
    Text-to-Speech.
    Generates audio, uploads to Blob Storage, returns public URL.
    """
    if tts is None:
        print("Error: Text-to-Speech model not loaded")
        raise HTTPException(status_code=503, detail="Text-to-Speech model not loaded")

    if not req.text.strip():
        print("Error: Empty text provided for TTS")
        raise HTTPException(status_code=400, detail="Text cannot be empty")

    if not AZURE_CONN_STR:
        print("Error: AZURE_STORAGE_CONNECTION_STRING missing")
        raise HTTPException(status_code=500, detail="Storage configuration missing")

    print(f"--- TTS Request ---")
    print(f"Text: {req.text[:50]}...")

    # Generate Audio
    filename = f"{uuid.uuid4()}.wav"
    output_path = f"/tmp/{filename}"
    
    try:
        # TTS generation
        print(f"Generating audio file to {output_path}...")
        tts.tts_to_file(text=req.text, file_path=output_path)
        
        file_size = os.path.getsize(output_path)
        print(f"TTS complete. Audio size: {file_size} bytes")
        
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
            
        print(f"Upload successful: {blob_client.url}")
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
            print(f"Cleaned up temp file: {output_path}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=80)

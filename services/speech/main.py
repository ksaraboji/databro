import os
import uuid
import tempfile
from fastapi import FastAPI, UploadFile, File, HTTPException, BackgroundTasks
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from azure.storage.blob import BlobServiceClient, ContentSettings
from faster_whisper import WhisperModel
from TTS.api import TTS

app = FastAPI(title="Speech Service", version="1.0")

# --- Configuration ---
# Models
STT_MODEL_SIZE = "base.en" # 'tiny', 'base', 'small', 'medium', 'large'
TTS_MODEL_NAME = "tts_models/en/ljspeech/vits" # Fast and reasonable quality

# Azure Storage
AZURE_CONN_STR = os.getenv("AZURE_STORAGE_CONNECTION_STRING")
AUDIO_CONTAINER = os.getenv("AUDIO_CONTAINER_NAME", "public-audio")

# Initialize Models (Lazy loading advisable for larger models, but loading on startup for now)
print(f"Loading Whisper model: {STT_MODEL_SIZE}...")
# device="cpu" for Container Apps Consumption plan (no GPU)
# compute_type="int8" for memory efficiency
stt_model = WhisperModel(STT_MODEL_SIZE, device="cpu", compute_type="int8")
print("Whisper model loaded.")

print(f"Loading TTS model: {TTS_MODEL_NAME}...")
# gpu=False
tts = TTS(model_name=TTS_MODEL_NAME, progress_bar=False, gpu=False)
print("TTS model loaded.")


class SpeakRequest(BaseModel):
    text: str
    speaker_id: str = None # For multi-speaker models

@app.get("/")
def health_check():
    return {"status": "healthy", "stt_model": STT_MODEL_SIZE, "tts_model": TTS_MODEL_NAME}

@app.post("/transcribe")
async def transcribe_audio(file: UploadFile = File(...)):
    """
    Speech-to-Text using Whisper.
    Accepts audio file upload, returns transcript.
    """
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
    if not req.text.strip():
        raise HTTPException(status_code=400, detail="Text cannot be empty")

    if not AZURE_CONN_STR:
        raise HTTPException(status_code=500, detail="Storage configuration missing")

    # Generate Audio
    filename = f"{uuid.uuid4()}.wav"
    output_path = f"/tmp/{filename}"
    
    try:
        # TTS generation
        tts.tts_to_file(text=req.text, file_path=output_path)
        
        # Upload to Azure
        blob_service = BlobServiceClient.from_connection_string(AZURE_CONN_STR)
        container_client = blob_service.get_container_client(AUDIO_CONTAINER)
        
        # Create container if not exists (ideally done in Infra, but failsafe here)
        if not container_client.exists():
            container_client.create_container(public_access="blob")

        blob_client = container_client.get_blob_client(filename)
        
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
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if os.path.exists(output_path):
            os.remove(output_path)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=80)

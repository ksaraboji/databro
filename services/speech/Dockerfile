FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
# ffmpeg is required for audio processing
# build-essential and espeak-ng usually needed for TTS
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    python3-dev \
    pkg-config \
    ffmpeg \
    espeak-ng \
    libsndfile1 \
    libsndfile1-dev \
    swig \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .

# Upgrade build tools to avoid "getting requirements to build wheel" errors
RUN pip install --no-cache-dir --upgrade pip setuptools wheel

# Install dependencies
# We split this to cache the heavy ML libraries
RUN pip install --no-cache-dir -r requirements.txt

# Download models during build to speed up startup
# faster-whisper download
RUN python -c "from faster_whisper import WhisperModel; WhisperModel('base.en', device='cpu', compute_type='int8')"

# Coqui TTS download matches logic in main.py
# Running a dry run to force download
# Note: Coqui TTS sometimes stores models in /root/.local/share/tts
# We ensure the user running the app can access headers
ENV TTS_HOME=/app/tts_cache
RUN mkdir -p /app/tts_cache && chmod 777 /app/tts_cache
# Helper script to download Coqui model
RUN python -c "from TTS.api import TTS; TTS(model_name='tts_models/en/ljspeech/vits', progress_bar=False, gpu=False)"

COPY main.py .

EXPOSE 80

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "80"]

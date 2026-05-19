#!/bin/bash
set -e

MODEL="${OLLAMA_DEFAULT_MODEL:-tinyllama:latest}"
MAX_RETRIES=30
SLEEP_TIME=2

echo "🚀 Starting Ollama server in background..."
OLLAMA_HOST=127.0.0.1:11434 /bin/ollama serve &
SERVE_PID=$!

# Wait for Ollama to be ready
echo "⏳ Waiting for Ollama to be ready..."
for ((i=1; i<=MAX_RETRIES; i++)); do
  RESPONSE=$(curl -s http://127.0.0.1:11434 || echo "")
  if [[ "$RESPONSE" == "Ollama is running" ]]; then
    echo "✅ Ollama is ready (attempt $i)"
    break
  fi
  echo "  Attempt $i/$MAX_RETRIES — retrying in ${SLEEP_TIME}s..."
  sleep $SLEEP_TIME
done

if [[ "$RESPONSE" != "Ollama is running" ]]; then
  echo "❌ Ollama failed to start within $((MAX_RETRIES * SLEEP_TIME))s"
  kill $SERVE_PID
  exit 1
fi

# Check if model already exists in GCS bucket (avoids re-downloading)
if OLLAMA_HOST=127.0.0.1:11434 /bin/ollama list | grep -q "${MODEL%:*}"; then
  echo "✅ Model '$MODEL' already exists in GCS bucket — skipping pull"
else
  echo "🔄 Pulling model: $MODEL (first-time setup into GCS)..."
  OLLAMA_HOST=127.0.0.1:11434 /bin/ollama pull "$MODEL"
  echo "✅ Model pulled successfully"
fi

# Stop background server
kill $SERVE_PID
wait $SERVE_PID 2>/dev/null || true

# Hand off to foreground serve (PID 1, correct for Cloud Run)
echo "🎯 Starting Ollama in foreground on $OLLAMA_HOST..."
exec /bin/ollama serve
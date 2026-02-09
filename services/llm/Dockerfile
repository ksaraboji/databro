# Use the official Ollama image as the base
FROM ollama/ollama:latest

# Arguments for the model to bake in
# "llama3.2" is a great balance of speed/quality (3B parameters) suitable for "Professor" roles
# For higher quality reasoning, use "llama3.1" (8B), but it requires ~6GB RAM.
ARG MODEL_NAME=llama3.2

ENV OLLAMA_HOST=0.0.0.0

# We need to start the server, pull the model, and then shut down.
# This ensures the model is saved in the image layer /root/.ollama
RUN ollama serve & \
    sleep 5 && \
    ollama pull $MODEL_NAME && \
    pkill ollama

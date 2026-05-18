project_id                     = "databro-dev"
environment                    = "dev"
region                         = "us-east4"
artifact_registry_location     = "us-east4"
artifact_registry_repository_id = "databro-dev-ai-repo"

# Can be overridden from CI with TF_VAR_ai_backend_image
ai_backend_image = "us-east4-docker.pkg.dev/databro-dev/databro-dev-ai-repo/ai-backend:latest"

cloud_run_service_name   = "ai-backend"
cloud_run_ingress        = "INGRESS_TRAFFIC_ALL"
cloud_run_invoker_members = []
cloud_run_min_instances  = 0
cloud_run_max_instances  = 3
cloud_run_timeout_seconds = 300
cloud_run_cpu            = 1
cloud_run_memory         = "2Gi"

hf_model_name   = "google/gemma-4-31B-it"
hf_base_url     = "https://router.huggingface.co/v1"
llm_max_tokens  = 1024
max_result_rows = 200

# Ollama runtime
ollama_gcs_bucket              = "databro-gcp-ollama-models-bucket"
ollama_runtime_service_account = "830624303497-compute@developer.gserviceaccount.com"



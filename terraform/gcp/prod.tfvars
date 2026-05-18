project_id                     = "databro-487622"
environment                    = "prod"
region                         = "us-east4"
artifact_registry_location     = "us-east4"
artifact_registry_repository_id = "databro-prod-ai-repo"

# Can be overridden from CI with TF_VAR_ai_backend_image
ai_backend_image = "us-east4-docker.pkg.dev/databro-487622/databro-prod-ai-repo/ai-backend:latest"

cloud_run_service_name   = "ai-backend"
cloud_run_ingress        = "INGRESS_TRAFFIC_ALL"
cloud_run_invoker_members = []
cloud_run_min_instances  = 1
cloud_run_max_instances  = 10
cloud_run_timeout_seconds = 300
cloud_run_cpu            = 2
cloud_run_memory         = "4Gi"

hf_model_name   = "google/gemma-4-31B-it"
hf_base_url     = "https://router.huggingface.co/v1"
llm_max_tokens  = 1024
max_result_rows = 200

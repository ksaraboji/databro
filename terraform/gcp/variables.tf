variable "project_id" {
  description = "Google Cloud project id"
  type        = string
}

variable "environment" {
  description = "Deployment environment name (dev, prod)"
  type        = string
}

variable "region" {
  description = "Google Cloud region for Cloud Run"
  type        = string
  default     = "us-east4"
}

variable "artifact_registry_location" {
  description = "Artifact Registry location"
  type        = string
  default     = "us-east4"
}

variable "artifact_registry_repository_id" {
  description = "Artifact Registry repository id"
  type        = string
}

variable "ollama_artifact_registry_location" {
  description = "Artifact Registry location for the Ollama runtime image"
  type        = string
  default     = "us-east4"
}

variable "ollama_artifact_registry_repository_id" {
  description = "Artifact Registry repository id for the Ollama runtime image"
  type        = string
  default     = "ollama-runtime"
}

variable "ai_backend_image" {
  description = "Full image URL for the AI backend container"
  type        = string
}

variable "cloud_run_service_name" {
  description = "Cloud Run service name"
  type        = string
  default     = "ai-backend"
}

variable "ai_backend_service_account" {
  description = "Service account email used by the ai-backend Cloud Run service"
  type        = string
}

variable "ollama_service_name" {
  description = "Cloud Run service name for Ollama"
  type        = string
  default     = "ollama-runtime"
}

variable "cloud_run_invoker_service_account_id" {
  description = "Dedicated service account id used by Supabase to invoke Cloud Run"
  type        = string
  default     = "cloudrun-invoker"
}

variable "cloud_run_invoker_service_account_display_name" {
  description = "Display name for the dedicated Cloud Run invoker service account"
  type        = string
  default     = "Cloud Run Invoker"
}

variable "cloud_run_ingress" {
  description = "Cloud Run ingress setting"
  type        = string
  default     = "INGRESS_TRAFFIC_ALL"

  validation {
    condition = contains([
      "INGRESS_TRAFFIC_ALL",
      "INGRESS_TRAFFIC_INTERNAL_ONLY",
      "INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER"
    ], var.cloud_run_ingress)
    error_message = "cloud_run_ingress must be one of Cloud Run v2 ingress constants."
  }
}

variable "cloud_run_invoker_members" {
  description = "Additional IAM members with Cloud Run invoker role. Leave empty to use only the dedicated invoker service account."
  type        = list(string)
  default     = []
}

variable "cloud_run_min_instances" {
  description = "Cloud Run minimum instances"
  type        = number
  default     = 0
}

variable "cloud_run_max_instances" {
  description = "Cloud Run maximum instances"
  type        = number
  default     = 3
}

variable "cloud_run_timeout_seconds" {
  description = "Cloud Run request timeout in seconds"
  type        = number
  default     = 300
}

variable "cloud_run_cpu" {
  description = "Cloud Run CPU limit"
  type        = number
  default     = 1
}

variable "cloud_run_memory" {
  description = "Cloud Run memory limit"
  type        = string
  default     = "2Gi"
}

variable "ollama_region" {
  description = "Google Cloud region for the Ollama Cloud Run service"
  type        = string
  default     = "us-east4"
}

variable "ollama_ingress" {
  description = "Cloud Run ingress setting for Ollama"
  type        = string
  default     = "INGRESS_TRAFFIC_ALL"

  validation {
    condition = contains([
      "INGRESS_TRAFFIC_ALL",
      "INGRESS_TRAFFIC_INTERNAL_ONLY",
      "INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER"
    ], var.ollama_ingress)
    error_message = "ollama_ingress must be one of Cloud Run v2 ingress constants."
  }
}

variable "ollama_min_instances" {
  description = "Cloud Run minimum instances for Ollama"
  type        = number
  default     = 0
}

variable "ollama_max_instances" {
  description = "Cloud Run maximum instances for Ollama"
  type        = number
  default     = 1
}

variable "ollama_timeout_seconds" {
  description = "Cloud Run request timeout in seconds for Ollama"
  type        = number
  default     = 600
}

variable "ollama_cpu" {
  description = "Cloud Run CPU limit for Ollama"
  type        = number
  default     = 4
}

variable "ollama_memory" {
  description = "Cloud Run memory limit for Ollama"
  type        = string
  default     = "16Gi"
}

variable "ollama_gpu_count" {
  description = "Number of GPUs for the Ollama Cloud Run service"
  type        = number
  default     = 1
}

variable "ollama_container_port" {
  description = "Container port exposed by Ollama"
  type        = number
  default     = 11434
}

variable "ollama_base_url" {
  description = "Optional explicit Ollama base URL for ai-backend; falls back to the deployed Ollama service URI when empty"
  type        = string
  default     = ""
}

variable "ollama_gcs_bucket" {
  description = "GCS bucket name containing pre-downloaded Ollama models, mounted via FUSE"
  type        = string
}

variable "ollama_runtime_service_account" {
  description = "Service account email used by the Ollama Cloud Run service (must have objectViewer on the models bucket)"
  type        = string
}

variable "ollama_image" {
  description = "Container image used for the Ollama runtime"
  type        = string
  default     = "ollama/ollama:latest"
}

variable "ollama_default_model" {
  description = "Default Ollama model name used by ai-backend when no model is provided"
  type        = string
  default     = "llama3.2"
}

variable "hf_api_token" {
  description = "Hugging Face API token for AI inference (set via CI secret, do not commit real value)"
  type        = string
  default     = ""
  sensitive   = true
}

variable "hf_model_name" {
  description = "Hugging Face model name used by CrewAI LLM calls"
  type        = string
  default     = "google/gemma-4-31B-it"
}

variable "hf_base_url" {
  description = "Hugging Face compatible base URL"
  type        = string
  default     = "https://router.huggingface.co/v1"
}

variable "llm_max_tokens" {
  description = "Maximum tokens per LLM response"
  type        = number
  default     = 1024
}

variable "max_result_rows" {
  description = "Maximum number of query result rows returned by backend"
  type        = number
  default     = 200
}

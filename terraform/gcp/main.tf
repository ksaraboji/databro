terraform {
  required_version = ">= 1.9"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = ">= 5.0"
    }
  }

  backend "gcs" {}
}

provider "google" {
  project = var.project_id
  region  = var.region
}

resource "google_service_account" "cloudrun_invoker" {
  account_id   = var.cloud_run_invoker_service_account_id
  display_name = var.cloud_run_invoker_service_account_display_name
  description  = "Invokes the Databro Cloud Run AI backend from Supabase Edge Functions"
}

locals {
  cloud_run_invoker_members = length(var.cloud_run_invoker_members) > 0 ? var.cloud_run_invoker_members : ["serviceAccount:${google_service_account.cloudrun_invoker.email}"]
}

resource "google_cloud_run_v2_service" "ai_backend" {
  name     = var.cloud_run_service_name
  location = var.region

  ingress = var.cloud_run_ingress

  template {
    timeout = "${var.cloud_run_timeout_seconds}s"

    service_account = var.ai_backend_service_account

    scaling {
      min_instance_count = var.cloud_run_min_instances
      max_instance_count = var.cloud_run_max_instances
    }

    containers {
      image = var.ai_backend_image

      ports {
        container_port = 80
      }

      resources {
        limits = {
          cpu    = tostring(var.cloud_run_cpu)
          memory = var.cloud_run_memory
        }
      }
      env {
        name  = "ENVIRONMENT"
        value = var.environment
      }
      env {
        name  = "HF_API_TOKEN"
        value = var.hf_api_token
      }
      env {
        name  = "HF_MODEL_NAME"
        value = var.hf_model_name
      }
      env {
        name  = "HF_BASE_URL"
        value = var.hf_base_url
      }
      env {
        name  = "OLLAMA_BASE_URL"
        value = var.ollama_base_url != "" ? var.ollama_base_url : google_cloud_run_v2_service.ollama_runtime.uri
      }
      env {
        name  = "OLLAMA_DEFAULT_MODEL"
        value = var.ollama_default_model
      }
      env {
        name  = "LLM_MAX_TOKENS"
        value = tostring(var.llm_max_tokens)
      }
      env {
        name  = "MAX_RESULT_ROWS"
        value = tostring(var.max_result_rows)
      }
    }
  }

}

# Grant the runtime service account read/write access to the Ollama models bucket
resource "google_storage_bucket_iam_member" "ollama_models_writer" {
  bucket = var.ollama_gcs_bucket
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${var.ollama_runtime_service_account}"
}

resource "google_cloud_run_v2_service" "ollama_runtime" {
  name     = var.ollama_service_name
  location = var.ollama_region

  ingress = var.ollama_ingress

  template {
    timeout = "${var.ollama_timeout_seconds}s"
    gpu_zonal_redundancy_disabled = true

    service_account = var.ollama_runtime_service_account

    scaling {
      min_instance_count = var.ollama_min_instances
      max_instance_count = var.ollama_max_instances
    }

    volumes {
      name = "ollama-gcs-models"

      gcs {
        bucket    = var.ollama_gcs_bucket
        read_only = false
      }
    }

    containers {
      image = var.ollama_image

      ports {
        container_port = var.ollama_container_port
      }

      volume_mounts {
        name       = "ollama-gcs-models"
        mount_path = "/gcs-models"
      }

      resources {
        limits = {
          cpu              = tostring(var.ollama_cpu)
          memory           = var.ollama_memory
          "nvidia.com/gpu" = tostring(var.ollama_gpu_count)
        }
      }

      env {
        name  = "OLLAMA_HOST"
        value = "0.0.0.0:${var.ollama_container_port}"
      }

      env {
        name  = "OLLAMA_MODELS"
        value = "/gcs-models"
      }
    }
  }

  depends_on = [google_storage_bucket_iam_member.ollama_models_writer]
}

resource "google_cloud_run_v2_service_iam_binding" "invoker" {
  count = length(local.cloud_run_invoker_members) > 0 ? 1 : 0

  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_service.ai_backend.name
  role     = "roles/run.invoker"
  members  = local.cloud_run_invoker_members
}

resource "google_cloud_run_v2_service_iam_member" "ollama_invoker" {
  project  = var.project_id
  location = var.ollama_region
  name     = google_cloud_run_v2_service.ollama_runtime.name
  role     = "roles/run.invoker"
  member   = "serviceAccount:${var.ai_backend_service_account}"
}

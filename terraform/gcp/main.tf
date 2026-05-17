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

resource "google_service_account_iam_member" "cloudrun_invoker_token_creator_self" {
  service_account_id = google_service_account.cloudrun_invoker.name
  role               = "roles/iam.serviceAccountTokenCreator"
  member             = "serviceAccount:${google_service_account.cloudrun_invoker.email}"
}

locals {
  cloud_run_invoker_members = length(var.cloud_run_invoker_members) > 0 ? var.cloud_run_invoker_members : ["serviceAccount:${google_service_account.cloudrun_invoker.email}"]
}

resource "google_artifact_registry_repository" "ai_backend" {
  location      = var.artifact_registry_location
  repository_id = var.artifact_registry_repository_id
  description   = "Docker images for Databro ai backend"
  format        = "DOCKER"
}

resource "google_cloud_run_v2_service" "ai_backend" {
  name     = var.cloud_run_service_name
  location = var.region

  ingress = var.cloud_run_ingress

  template {
    timeout = "${var.cloud_run_timeout_seconds}s"

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

resource "google_cloud_run_v2_service_iam_binding" "invoker" {
  count = length(local.cloud_run_invoker_members) > 0 ? 1 : 0

  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_service.ai_backend.name
  role     = "roles/run.invoker"
  members  = local.cloud_run_invoker_members
}

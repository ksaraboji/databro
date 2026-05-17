output "project_id" {
  value = var.project_id
}

output "artifact_registry_repository" {
  value = google_artifact_registry_repository.ai_backend.name
}

output "artifact_registry_repository_url" {
  value = "${var.artifact_registry_location}-docker.pkg.dev/${var.project_id}/${var.artifact_registry_repository_id}"
}

output "cloud_run_service_name" {
  value = google_cloud_run_v2_service.ai_backend.name
}

output "cloud_run_service_uri" {
  value = google_cloud_run_v2_service.ai_backend.uri
}

output "cloud_run_invoker_service_account_email" {
  value = google_service_account.cloudrun_invoker.email
}

output "supabase_edge_function_env" {
  value = {
    CLOUDRUN_BASE_URL    = google_cloud_run_v2_service.ai_backend.uri
    BACKEND_ENVIRONMENT   = var.environment
  }
  description = "Environment variables to configure in Supabase Edge Function"
}

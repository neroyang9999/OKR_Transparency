output "service_name" {
  value = google_cloud_run_v2_service.api.name
}

output "service_url" {
  value = google_cloud_run_v2_service.api.uri
}

output "service_account_email" {
  value = google_service_account.api.email
}

output "artifact_registry_url" {
  value = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.internal.repository_id}"
}

output "auth_secret_id" {
  value = google_secret_manager_secret.auth_secret.secret_id
}

output "admin_token_secret_id" {
  value = google_secret_manager_secret.admin_token.secret_id
}

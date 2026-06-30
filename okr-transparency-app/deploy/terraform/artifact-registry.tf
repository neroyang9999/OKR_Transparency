resource "google_artifact_registry_repository" "internal" {
  location      = var.region
  repository_id = "unitx-internal"
  description   = "Internal Docker images for UnitX tools."
  format        = "DOCKER"

  depends_on = [google_project_service.apis]
}

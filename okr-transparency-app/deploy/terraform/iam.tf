resource "google_service_account" "api" {
  account_id   = "okr-api"
  display_name = "OKR Transparency App - Cloud Run"

  depends_on = [google_project_service.apis]
}

resource "google_project_iam_member" "api_datastore_user" {
  project = var.project_id
  role    = "roles/datastore.user"
  member  = "serviceAccount:${google_service_account.api.email}"
}

resource "google_project_iam_member" "api_secret_accessor" {
  project = var.project_id
  role    = "roles/secretmanager.secretAccessor"
  member  = "serviceAccount:${google_service_account.api.email}"
}

resource "random_password" "auth_secret" {
  length  = 48
  special = true
}

resource "random_password" "admin_token" {
  length  = 40
  special = false
}

resource "google_secret_manager_secret" "auth_secret" {
  secret_id = "okr-auth-secret"

  replication {
    auto {}
  }

  depends_on = [google_project_service.apis]
}

resource "google_secret_manager_secret_version" "auth_secret" {
  secret      = google_secret_manager_secret.auth_secret.id
  secret_data = random_password.auth_secret.result
}

resource "google_secret_manager_secret" "admin_token" {
  secret_id = "okr-admin-token"

  replication {
    auto {}
  }

  depends_on = [google_project_service.apis]
}

resource "google_secret_manager_secret_version" "admin_token" {
  secret      = google_secret_manager_secret.admin_token.id
  secret_data = random_password.admin_token.result
}

data "google_project" "current" {
  project_id = var.project_id
}

locals {
  service_name = "okr-transparency-app"
  image_url    = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.internal.repository_id}/${local.service_name}:${var.image_tag}"
  iap_audience = "/projects/${data.google_project.current.number}/locations/${var.region}/services/${local.service_name}"
}

resource "google_cloud_run_v2_service" "api" {
  provider     = google-beta
  name         = local.service_name
  location     = var.region
  ingress      = "INGRESS_TRAFFIC_ALL"
  launch_stage = "BETA"
  iap_enabled  = var.iap_enabled

  template {
    service_account = google_service_account.api.email

    scaling {
      min_instance_count = var.min_instances
      max_instance_count = var.max_instances
    }

    containers {
      image = local.image_url

      ports {
        container_port = 8080
      }

      env {
        name  = "NODE_ENV"
        value = "production"
      }

      env {
        name  = "OKR_STORAGE"
        value = "firestore"
      }

      env {
        name  = "FIRESTORE_PROJECT_ID"
        value = var.project_id
      }

      env {
        name  = "FIRESTORE_DATABASE_ID"
        value = var.firestore_database_id
      }

      env {
        name  = "OKR_ALLOWED_GOOGLE_DOMAINS"
        value = var.allowed_google_domains
      }

      env {
        name  = "NEXT_PUBLIC_ENABLE_ADMIN_TOKEN_LOGIN"
        value = tostring(var.enable_admin_token_login)
      }

      dynamic "env" {
        for_each = var.iap_enabled ? [1] : []
        content {
          name  = "IAP_EXPECTED_AUDIENCE"
          value = local.iap_audience
        }
      }

      env {
        name = "AUTH_SECRET"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.auth_secret.secret_id
            version = "latest"
          }
        }
      }

      env {
        name = "OKR_ADMIN_TOKEN"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.admin_token.secret_id
            version = "latest"
          }
        }
      }

      resources {
        limits = {
          cpu    = "1"
          memory = "1Gi"
        }
        cpu_idle = true
      }

      startup_probe {
        http_get {
          path = "/"
        }
        initial_delay_seconds = 5
        timeout_seconds       = 5
        period_seconds        = 5
        failure_threshold     = 6
      }
    }
  }

  depends_on = [
    google_secret_manager_secret_version.auth_secret,
    google_secret_manager_secret_version.admin_token,
    google_project_iam_member.api_datastore_user,
    google_project_iam_member.api_secret_accessor
  ]
}

resource "google_cloud_run_v2_service_iam_member" "invoker" {
  name     = google_cloud_run_v2_service.api.name
  location = google_cloud_run_v2_service.api.location
  role     = "roles/run.invoker"
  member   = var.iap_enabled ? "serviceAccount:service-${data.google_project.current.number}@gcp-sa-iap.iam.gserviceaccount.com" : var.invoker_principal
}

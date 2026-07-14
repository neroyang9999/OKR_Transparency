# Browser SSO for the Cloud Run service.
#
# One-time prerequisite:
#   Configure the OAuth consent screen / brand in the nero GCP project.
#   Use Internal user type for unitxlabs.com.
#
# Cloud Run direct IAP is enabled by google_cloud_run_v2_service.iap_enabled.

resource "google_iap_web_cloud_run_service_iam_member" "domain_access" {
  count = var.iap_enabled ? 1 : 0

  project                = var.project_id
  location               = google_cloud_run_v2_service.api.location
  cloud_run_service_name = google_cloud_run_v2_service.api.name
  role                   = "roles/iap.httpsResourceAccessor"
  member                 = var.iap_principal

  depends_on = [google_project_service.apis]
}

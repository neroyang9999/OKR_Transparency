# Browser SSO for the Cloud Run service.
#
# One-time prerequisite:
#   Configure the OAuth consent screen / brand in the nero GCP project.
#   Use Internal user type for unitxlabs.com.
#
# After terraform apply, enable IAP on the service if the provider does not
# expose Cloud Run direct IAP in this environment:
#   gcloud run services update okr-transparency-app --region=us-west1 --iap

resource "google_iap_web_cloud_run_service_iam_member" "domain_access" {
  count = var.iap_enabled ? 1 : 0

  project                = var.project_id
  location               = google_cloud_run_v2_service.api.location
  cloud_run_service_name = google_cloud_run_v2_service.api.name
  role                   = "roles/iap.httpsResourceAccessor"
  member                 = var.iap_principal

  depends_on = [google_project_service.apis]
}

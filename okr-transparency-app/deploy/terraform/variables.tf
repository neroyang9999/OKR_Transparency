variable "project_id" {
  description = "GCP project ID for the OKR app. Default is the nero project."
  type        = string
  default     = "gen-lang-client-0913302758"
}

variable "region" {
  description = "GCP region for Cloud Run and Artifact Registry."
  type        = string
  default     = "us-west1"
}

variable "image_tag" {
  description = "Docker image tag already pushed to Artifact Registry."
  type        = string
}

variable "allowed_google_domains" {
  description = "Comma-separated Google Workspace domains accepted by the app fallback auth."
  type        = string
  default     = "unitxlabs.com"
}

variable "firestore_database_id" {
  description = "Firestore database ID."
  type        = string
  default     = "(default)"
}

variable "iap_enabled" {
  description = "Create IAP access binding. Enable IAP on the Cloud Run service after OAuth consent is configured."
  type        = bool
  default     = true
}

variable "iap_principal" {
  description = "Principal allowed through IAP, e.g. domain:unitxlabs.com, group:eng@unitxlabs.com, or user:name@unitxlabs.com."
  type        = string
  default     = "domain:unitxlabs.com"
}

variable "invoker_principal" {
  description = "Cloud Run invoker principal for pre-IAP validation or proxy access."
  type        = string
  default     = "domain:unitxlabs.com"
}

variable "min_instances" {
  description = "Minimum Cloud Run instances."
  type        = number
  default     = 0
}

variable "max_instances" {
  description = "Maximum Cloud Run instances."
  type        = number
  default     = 3
}

variable "enable_admin_token_login" {
  description = "Expose admin-token login UI. Keep false in production unless doing break-glass access."
  type        = bool
  default     = false
}

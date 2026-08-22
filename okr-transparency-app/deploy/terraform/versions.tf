terraform {
  required_version = ">= 1.6.0"

  # State currently lives on whichever machine last ran apply, and terraform.tfstate is gitignored:
  # only one machine can apply, nobody can review what production is configured as, and losing that
  # machine means a fresh init starts from empty state and tries to create the Artifact Registry,
  # Cloud Run, IAP, Secret and IAM resources that already exist.
  #
  # Left commented because the bucket does not exist yet -- an active backend block would break
  # `terraform init` for everyone until it does. To turn it on, from the machine that holds the
  # current state:
  #
  #   gcloud storage buckets create gs://<BUCKET> --project=knowledge-base-496322 \
  #     --location=us-west1 --uniform-bucket-level-access
  #   gcloud storage buckets update gs://<BUCKET> --versioning
  #   cp terraform.tfstate terraform.tfstate.before-backend-migration
  #   # uncomment the block below, fill in the bucket, then:
  #   terraform init -migrate-state
  #
  # `init -migrate-state` copies the state file into the bucket. It calls no GCP API that changes
  # infrastructure, so it cannot affect the running service.
  #
  # backend "gcs" {
  #   bucket = "<BUCKET>"
  #   prefix = "okr-transparency-app"
  # }

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 6.0"
    }
    google-beta = {
      source  = "hashicorp/google-beta"
      version = "~> 6.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

provider "google-beta" {
  project = var.project_id
  region  = var.region
}

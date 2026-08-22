terraform {
  required_version = ">= 1.6.0"

  # There is no state to configure a backend for yet: this configuration has never been applied.
  # The live project was built with the ad-hoc gcloud scripts described in README.md, and no
  # terraform.tfstate exists on any machine or in any bucket in the project.
  #
  # So this block is for the day somebody adopts the existing resources -- turn it on *before* the
  # first `init`, so the state is remote from the start and never needs migrating:
  #
  #   gcloud storage buckets create gs://<BUCKET> --project=knowledge-base-496322 \
  #     --location=us-west1 --uniform-bucket-level-access
  #   gcloud storage buckets update gs://<BUCKET> --versioning
  #   # uncomment the block below, fill in the bucket, then:
  #   terraform init
  #   # then import each existing resource until `terraform plan` reports No changes
  #
  # Left commented because the bucket does not exist: an active backend block breaks
  # `terraform init` for everyone until it does.
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

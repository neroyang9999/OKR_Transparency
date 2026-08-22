#!/usr/bin/env bash
set -u
PROJECT_ID="knowledge-base-496322"
REGION="us-west1"
SERVICE="okr-transparency-app"
AR_REPO="unitx-internal"
ACCOUNT="$(gcloud config get-value account 2>/dev/null)"

echo "==== Project ===="
gcloud config set project "$PROJECT_ID" --quiet >/dev/null
gcloud projects describe "$PROJECT_ID" --format='yaml(projectId,projectNumber,lifecycleState,name)'

echo "==== Billing ===="
gcloud beta billing projects describe "$PROJECT_ID" --format='yaml(billingEnabled,billingAccountName,projectId)' || true

echo "==== Current account IAM on project ===="
gcloud projects get-iam-policy "$PROJECT_ID" --flatten='bindings[].members' --filter="bindings.members:user:$ACCOUNT" --format='table(bindings.role)' || true

echo "==== Required APIs status ===="
for api in run.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com firestore.googleapis.com datastore.googleapis.com iap.googleapis.com cloudbuild.googleapis.com; do
  if gcloud services list --enabled --project "$PROJECT_ID" --filter="config.name:$api" --format='value(config.name)' | grep -q "$api"; then
    echo "enabled  $api"
  else
    echo "missing  $api"
  fi
done

echo "==== Existing Cloud Run services ===="
gcloud run services list --platform=managed --region="$REGION" --project "$PROJECT_ID" --format='table(metadata.name,status.url)' || true

echo "==== Target service existence ===="
gcloud run services describe "$SERVICE" --region="$REGION" --project "$PROJECT_ID" --format='yaml(metadata.name,status.url,spec.template.spec.serviceAccountName)' || echo "target service not found"

echo "==== Artifact Registry repo ===="
gcloud artifacts repositories describe "$AR_REPO" --location="$REGION" --project "$PROJECT_ID" --format='yaml(name,format,location)' || echo "artifact repo not found"

echo "==== OKR service account/secrets ===="
gcloud iam service-accounts describe "okr-api@$PROJECT_ID.iam.gserviceaccount.com" --project "$PROJECT_ID" --format='yaml(email,displayName)' || echo "okr service account not found"
for s in okr-auth-secret okr-admin-token; do
  gcloud secrets describe "$s" --project "$PROJECT_ID" --format='yaml(name,replication)' || echo "$s not found"
done

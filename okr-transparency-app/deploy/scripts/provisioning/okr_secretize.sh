#!/usr/bin/env bash
set -Eeuo pipefail
PROJECT_ID="knowledge-base-496322"
REGION="us-west1"
SERVICE="okr-transparency-app"
IMAGE="us-west1-docker.pkg.dev/knowledge-base-496322/unitx-internal/okr-transparency-app:minimal-93767f3-kb"

gcloud config set project "$PROJECT_ID" --quiet >/dev/null

if ! gcloud secrets describe okr-auth-secret --project "$PROJECT_ID" >/dev/null 2>&1; then
  openssl rand -base64 48 | gcloud secrets create okr-auth-secret --project "$PROJECT_ID" --replication-policy=automatic --data-file=- >/dev/null
fi
if ! gcloud secrets describe okr-admin-token --project "$PROJECT_ID" >/dev/null 2>&1; then
  openssl rand -hex 32 | gcloud secrets create okr-admin-token --project "$PROJECT_ID" --replication-policy=automatic --data-file=- >/dev/null
fi

gcloud run deploy "$SERVICE"   --project "$PROJECT_ID"   --region "$REGION"   --image "$IMAGE"   --no-allow-unauthenticated   --set-env-vars NODE_ENV=production,OKR_STORAGE=file,OKR_ALLOWED_GOOGLE_DOMAINS=unitxlabs.com,NEXT_PUBLIC_ENABLE_ADMIN_TOKEN_LOGIN=false   --set-secrets AUTH_SECRET=okr-auth-secret:latest,OKR_ADMIN_TOKEN=okr-admin-token:latest   --quiet

gcloud run services describe "$SERVICE" --region="$REGION" --project "$PROJECT_ID" --format='value(status.url,metadata.annotations[run.googleapis.com/iap-enabled],spec.template.spec.containers[0].image)'

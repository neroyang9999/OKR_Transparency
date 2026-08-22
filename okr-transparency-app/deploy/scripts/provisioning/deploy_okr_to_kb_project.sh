#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_ID="knowledge-base-496322"
REGION="us-west1"
SERVICE="okr-transparency-app"
AR_REPO="unitx-internal"
GITHUB_REPO="https://github.com/neroyang9999/OKR_Transparency.git"
GITHUB_BRANCH="codex/cloud-run-iap-deploy"
TAG="staging-93767f3-kb"
IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${AR_REPO}/${SERVICE}:${TAG}"
SA_NAME="okr-api"
SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
IAP_PRINCIPAL="domain:unitxlabs.com"
WORKDIR="${HOME}/okr-cloud-run-deploy-kb-${TAG}-$(date +%Y%m%d%H%M%S)"

log() { printf '\n==== %s ====\n' "$*"; }

log "Set project"
gcloud config set project "$PROJECT_ID" --quiet
PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
ACCOUNT="$(gcloud config get-value account 2>/dev/null)"
printf 'Project: %s (%s)\nAccount: %s\n' "$PROJECT_ID" "$PROJECT_NUMBER" "$ACCOUNT"

log "Enable missing Firestore API only"
gcloud services enable firestore.googleapis.com --project "$PROJECT_ID" --quiet

log "Ensure Firestore database"
if gcloud firestore databases describe --database="(default)" --project "$PROJECT_ID" >/dev/null 2>&1; then
  echo "Firestore default database already exists."
else
  echo "Creating Firestore default database in nam5 for OKR app storage."
  gcloud firestore databases create --database="(default)" --location="nam5" --project "$PROJECT_ID" --quiet
fi

log "Verify Artifact Registry repository"
gcloud artifacts repositories describe "$AR_REPO" --location="$REGION" --project "$PROJECT_ID" --format='value(name)' >/dev/null

log "Ensure OKR runtime service account and IAM"
if gcloud iam service-accounts describe "$SA_EMAIL" --project "$PROJECT_ID" >/dev/null 2>&1; then
  echo "Service account already exists: $SA_EMAIL"
else
  gcloud iam service-accounts create "$SA_NAME" --display-name="OKR Transparency App - Cloud Run" --project "$PROJECT_ID" --quiet
fi

gcloud projects add-iam-policy-binding "$PROJECT_ID" --member="serviceAccount:${SA_EMAIL}" --role="roles/datastore.user" --condition=None --quiet >/dev/null
gcloud projects add-iam-policy-binding "$PROJECT_ID" --member="serviceAccount:${SA_EMAIL}" --role="roles/secretmanager.secretAccessor" --condition=None --quiet >/dev/null

log "Ensure OKR secrets"
if gcloud secrets describe okr-auth-secret --project "$PROJECT_ID" >/dev/null 2>&1; then
  echo "Secret okr-auth-secret already exists."
else
  openssl rand -base64 48 | gcloud secrets create okr-auth-secret --data-file=- --replication-policy=automatic --project "$PROJECT_ID" --quiet
fi
if gcloud secrets describe okr-admin-token --project "$PROJECT_ID" >/dev/null 2>&1; then
  echo "Secret okr-admin-token already exists."
else
  openssl rand -hex 32 | gcloud secrets create okr-admin-token --data-file=- --replication-policy=automatic --project "$PROJECT_ID" --quiet
fi

log "Clone OKR deployment branch"
git clone --branch "$GITHUB_BRANCH" --depth 1 "$GITHUB_REPO" "$WORKDIR"
cd "$WORKDIR/okr-transparency-app"
git rev-parse --short HEAD

log "Install dependencies for Firestore migration"
npm ci --no-audit --no-fund

log "Migrate local JSON data to Firestore"
OKR_STORAGE=firestore FIRESTORE_PROJECT_ID="$PROJECT_ID" FIRESTORE_DATABASE_ID="(default)" npm run migrate:firestore

log "Build and push OKR image with Cloud Build"
gcloud builds submit --tag "$IMAGE" --project "$PROJECT_ID" --quiet

log "Deploy new OKR Cloud Run service"
gcloud run deploy "$SERVICE" --image "$IMAGE" --region "$REGION" --project "$PROJECT_ID" --service-account "$SA_EMAIL" --port 8080 --cpu 1 --memory 1Gi --min-instances 0 --max-instances 3 --no-allow-unauthenticated --set-env-vars "NODE_ENV=production,OKR_STORAGE=firestore,FIRESTORE_PROJECT_ID=${PROJECT_ID},FIRESTORE_DATABASE_ID=(default),OKR_ALLOWED_GOOGLE_DOMAINS=unitxlabs.com,NEXT_PUBLIC_ENABLE_ADMIN_TOKEN_LOGIN=false" --set-secrets "AUTH_SECRET=okr-auth-secret:latest,OKR_ADMIN_TOKEN=okr-admin-token:latest" --quiet

log "Enable IAP on OKR service"
gcloud run services update "$SERVICE" --region "$REGION" --project "$PROJECT_ID" --iap --quiet

log "Grant IAP access to UnitX domain for OKR service only"
gcloud iap web add-iam-policy-binding --resource-type=cloud-run --service="$SERVICE" --region="$REGION" --member="$IAP_PRINCIPAL" --role="roles/iap.httpsResourceAccessor" --project "$PROJECT_ID" --quiet || true

log "Deployment result"
URL="$(gcloud run services describe "$SERVICE" --region "$REGION" --project "$PROJECT_ID" --format='value(status.url)')"
printf 'DEPLOYED_URL=%s\n' "$URL"
printf 'IMAGE=%s\n' "$IMAGE"
printf 'SERVICE_ACCOUNT=%s\n' "$SA_EMAIL"

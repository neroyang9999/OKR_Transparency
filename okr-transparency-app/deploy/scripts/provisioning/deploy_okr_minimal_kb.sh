#!/usr/bin/env bash
set -Eeuo pipefail
PROJECT_ID="knowledge-base-496322"
REGION="us-west1"
SERVICE="okr-transparency-app"
AR_REPO="unitx-internal"
GITHUB_REPO="https://github.com/neroyang9999/OKR_Transparency.git"
GITHUB_BRANCH="codex/cloud-run-iap-deploy"
TAG="minimal-93767f3-kb"
IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${AR_REPO}/${SERVICE}:${TAG}"
WORKDIR="${HOME}/okr-cloud-run-minimal-kb-${TAG}-$(date +%Y%m%d%H%M%S)"
AUTH_SECRET="$(openssl rand -base64 48 | tr -d '\n')"
ADMIN_TOKEN="$(openssl rand -hex 32 | tr -d '\n')"
IAP_PRINCIPAL="domain:unitxlabs.com"
log() { printf '\n==== %s ====\n' "$*"; }

log "Set project"
gcloud config set project "$PROJECT_ID" --quiet

gcloud artifacts repositories describe "$AR_REPO" --location="$REGION" --project "$PROJECT_ID" --format='value(name)' >/dev/null

log "Clone OKR deployment branch"
git clone --branch "$GITHUB_BRANCH" --depth 1 "$GITHUB_REPO" "$WORKDIR"
cd "$WORKDIR/okr-transparency-app"
git rev-parse --short HEAD

log "Build and push OKR image with Cloud Build"
gcloud builds submit --tag "$IMAGE" --project "$PROJECT_ID" --quiet

log "Deploy new OKR Cloud Run service with file storage smoke-test config"
gcloud run deploy "$SERVICE" --image "$IMAGE" --region "$REGION" --project "$PROJECT_ID" --port 8080 --cpu 1 --memory 1Gi --min-instances 0 --max-instances 3 --no-allow-unauthenticated --set-env-vars "NODE_ENV=production,OKR_STORAGE=file,OKR_ALLOWED_GOOGLE_DOMAINS=unitxlabs.com,NEXT_PUBLIC_ENABLE_ADMIN_TOKEN_LOGIN=false,AUTH_SECRET=${AUTH_SECRET},OKR_ADMIN_TOKEN=${ADMIN_TOKEN}" --quiet

log "Enable IAP on OKR service"
gcloud run services update "$SERVICE" --region "$REGION" --project "$PROJECT_ID" --iap --quiet

log "Grant IAP access to UnitX domain for OKR service only"
gcloud iap web add-iam-policy-binding --resource-type=cloud-run --service="$SERVICE" --region="$REGION" --member="$IAP_PRINCIPAL" --role="roles/iap.httpsResourceAccessor" --project "$PROJECT_ID" --quiet || true

log "Deployment result"
URL="$(gcloud run services describe "$SERVICE" --region "$REGION" --project "$PROJECT_ID" --format='value(status.url)')"
printf 'DEPLOYED_URL=%s\n' "$URL"
printf 'IMAGE=%s\n' "$IMAGE"

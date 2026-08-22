#!/usr/bin/env bash
set -Eeuo pipefail
PROJECT_ID="knowledge-base-496322"
REGION="us-west1"
SERVICE="okr-transparency-app"
IMAGE="us-west1-docker.pkg.dev/knowledge-base-496322/unitx-internal/okr-transparency-app:minimal-93767f3-kb"
RUNTIME_SA="okr-api@knowledge-base-496322.iam.gserviceaccount.com"
IAP_SA="service-403984849396@gcp-sa-iap.iam.gserviceaccount.com"
IAP_PRINCIPAL="domain:unitxlabs.com"

echo "== set project =="
gcloud config set project "$PROJECT_ID" --quiet

echo "== ensure okr service account =="
gcloud iam service-accounts describe "$RUNTIME_SA" --project "$PROJECT_ID" >/dev/null 2>&1 || gcloud iam service-accounts create okr-api --project "$PROJECT_ID" --display-name="OKR Transparency App - Cloud Run"

echo "== ensure secrets exist =="
if ! gcloud secrets describe okr-auth-secret --project "$PROJECT_ID" >/dev/null 2>&1; then
  openssl rand -base64 48 | gcloud secrets create okr-auth-secret --project "$PROJECT_ID" --replication-policy=automatic --data-file=-
fi
if ! gcloud secrets describe okr-admin-token --project "$PROJECT_ID" >/dev/null 2>&1; then
  openssl rand -hex 32 | gcloud secrets create okr-admin-token --project "$PROJECT_ID" --replication-policy=automatic --data-file=-
fi

echo "== grant secret access to okr runtime SA =="
gcloud secrets add-iam-policy-binding okr-auth-secret --project "$PROJECT_ID" --member="serviceAccount:$RUNTIME_SA" --role=roles/secretmanager.secretAccessor --quiet
gcloud secrets add-iam-policy-binding okr-admin-token --project "$PROJECT_ID" --member="serviceAccount:$RUNTIME_SA" --role=roles/secretmanager.secretAccessor --quiet

echo "== grant firestore/datastore access to okr runtime SA =="
gcloud projects add-iam-policy-binding "$PROJECT_ID" --member="serviceAccount:$RUNTIME_SA" --role=roles/datastore.user --quiet

echo "== ensure firestore default db =="
if gcloud firestore databases describe --database='(default)' --project "$PROJECT_ID" >/dev/null 2>&1; then
  echo "Firestore default database exists"
else
  gcloud firestore databases create --database='(default)' --location=nam5 --project "$PROJECT_ID"
fi

echo "== grant IAP service agent invoke permission on OKR service =="
gcloud run services add-iam-policy-binding "$SERVICE" --project "$PROJECT_ID" --region "$REGION" --member="serviceAccount:$IAP_SA" --role=roles/run.invoker --quiet

echo "== grant UnitX domain IAP access to OKR service =="
gcloud iap web add-iam-policy-binding --project "$PROJECT_ID" --region "$REGION" --resource-type=cloud-run --service="$SERVICE" --member="$IAP_PRINCIPAL" --role=roles/iap.httpsResourceAccessor --quiet

echo "== deploy production config revision =="
gcloud run deploy "$SERVICE" --project "$PROJECT_ID" --region "$REGION" --image "$IMAGE" --service-account "$RUNTIME_SA" --no-allow-unauthenticated --iap --set-env-vars NODE_ENV=production,OKR_STORAGE=firestore,FIRESTORE_PROJECT_ID="$PROJECT_ID",OKR_ALLOWED_GOOGLE_DOMAINS=unitxlabs.com,NEXT_PUBLIC_ENABLE_ADMIN_TOKEN_LOGIN=false --set-secrets AUTH_SECRET=okr-auth-secret:latest,OKR_ADMIN_TOKEN=okr-admin-token:latest --quiet

echo "== final status =="
gcloud run services describe "$SERVICE" --project "$PROJECT_ID" --region "$REGION" --format='flattened(status.url,status.latestReadyRevisionName,metadata.annotations[run.googleapis.com/iap-enabled],spec.template.spec.serviceAccountName,spec.template.spec.containers[0].env[].name)'
echo "== unauth check =="
curl -sSI "https://okr-transparency-app-403984849396.us-west1.run.app" | sed -n '1,12p'

#!/usr/bin/env bash
set -Eeuo pipefail
PROJECT_ID="knowledge-base-496322"
WORKDIR="$HOME/okr-migrate-$(date +%Y%m%d%H%M%S)"
REPO="https://github.com/neroyang9999/OKR_Transparency.git"
BRANCH="codex/cloud-run-iap-deploy"

echo "== clone repo =="
git clone --branch "$BRANCH" --single-branch "$REPO" "$WORKDIR"
cd "$WORKDIR"
mkdir -p data
cat > /tmp/okr-data.zip.b64 <<'DATAEOF'
# [16300 characters of base64 removed when this script was captured into the repo]
#
# The line here was a base64-encoded zip of the data/*.json files -- okr-admin-config.json
# and its siblings -- as they stood in July 2026. It existed to carry that snapshot into
# Cloud Shell for the one-time Firestore seed below, and it has no use after that run.
# The same files are tracked in the repository under data/, so nothing is lost by dropping
# it, and a 16KB unreviewable blob is not something to keep in git.
#
# To re-run this procedure, put the intended data/*.json into data/ yourself and skip
# straight to the migrate step.
DATAEOF
base64 -d /tmp/okr-data.zip.b64 > /tmp/okr-data.zip
rm -f data/*.json
unzip -o /tmp/okr-data.zip -d data

echo "== install deps =="
npm ci

echo "== migrate to firestore =="
FIRESTORE_PROJECT_ID="$PROJECT_ID" npm run migrate:firestore

echo "== verify firestore docs =="
gcloud firestore documents list okrAdmin --project "$PROJECT_ID" --database='(default)' --limit=10 || true
gcloud firestore documents list okrSnapshots --project "$PROJECT_ID" --database='(default)' --limit=10 || true

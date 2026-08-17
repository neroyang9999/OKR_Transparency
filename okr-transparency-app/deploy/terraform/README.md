# OKR Transparency App Terraform

Target project: `knowledge-base-496322`.

This deploys the Next.js OKR app to Cloud Run, stores app secrets in Secret
Manager, grants the runtime service account Firestore access, and binds IAP
access to `domain:unitxlabs.com` by default. It also enables Cloud Translation
and grants the runtime service account `roles/cloudtranslate.user` so OKR text
can be translated without storing a service-account key in the application.

## One-time setup

1. Select the project:

   ```powershell
   gcloud config set project knowledge-base-496322
   ```

2. Configure the OAuth consent screen for IAP:

   `APIs & Services -> OAuth consent screen`

   Use Internal user type, app name `OKR Transparency App`, and a UnitX support
   email. Save through the scopes step.

3. Create Firestore Native mode in this project if it does not already exist.

## Build and push

From `okr-transparency-app`:

```powershell
powershell -ExecutionPolicy Bypass -File .\deploy\scripts\push-image.ps1 -Tag staging
```

## Apply

```powershell
cd .\deploy\terraform
copy terraform.tfvars.example terraform.tfvars
terraform init
terraform apply
```

Terraform enables Cloud Run direct IAP, grants `roles/run.invoker` only to the
IAP service agent, and injects the exact expected JWT audience into the app.
Do not remove `IAP_EXPECTED_AUDIENCE`; the app fails closed when a signed IAP
JWT is missing or invalid.

## Migrate data

Before production cutover, run from `okr-transparency-app` with credentials that
can write Firestore:

```powershell
$env:OKR_STORAGE = "firestore"
$env:FIRESTORE_PROJECT_ID = "knowledge-base-496322"
npm run migrate:firestore
```

Do not delete the local `data/` directory. Keep it as the rollback source until
the Cloud Run deployment has been validated.

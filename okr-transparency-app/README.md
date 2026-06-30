# Engineering OKR Transparency App

Internal read-only OKR page for Engineering and team-level OKRs.

## Local Development

```powershell
npm install
npm run dev
```

Open `http://localhost:3000`.

For the local page-editing prototype on Windows, you can also run:

```powershell
.\start-local.cmd
```

Then open `http://127.0.0.1:3001/?mode=edit&team=Software`.

## Authentication and Permissions

OKR pages are visible to everyone with access to the app. JSON APIs, editing, publishing, rollback, and admin configuration require authentication.

Google OAuth is the normal identity source. Configure:

- `AUTH_SECRET`
- `AUTH_GOOGLE_ID`
- `AUTH_GOOGLE_SECRET`
- `OKR_ALLOWED_GOOGLE_DOMAINS` (defaults to `unitxlabs.com`)

Google OAuth callback URL:

`http://localhost:3000/api/auth/callback/google`

While Google OAuth is not configured, local development can use the credentials fallback. In non-production, the default fallback is `admin` / `1234`; set `OKR_LOCAL_ADMIN_USERNAME` and `OKR_LOCAL_ADMIN_PASSWORD` to override it. In production, the credentials provider and password form are disabled; use Google OAuth.

Google sign-in is accepted when the email matches `OKR_ALLOWED_GOOGLE_DOMAINS` or an enabled user in the admin config. The admin backend stores role rules in `data/okr-admin-config.json` for local file storage and `okrAdmin/config` for Firestore storage:

- `super_admin`: all admin, edit, publish, and rollback permissions.
- `team_leader`: edit and publish assigned teams.
- `user`: edit only OKR/KR records whose owner matches one of their `ownerAliases`.

`OKR_ADMIN_TOKEN` remains available as a break-glass fallback for API calls. In production, keep it in Secret Manager and leave the token UI hidden unless `NEXT_PUBLIC_ENABLE_ADMIN_TOKEN_LOGIN=true` is intentionally set.

For the Cloud Run deployment, Identity-Aware Proxy (IAP) protects the whole app first. The app also accepts the IAP-injected `X-Goog-Authenticated-User-Email` header as a production identity source and maps that email to the same admin-role config used by Google OAuth.

## Storage

`OKR_STORAGE` controls persistence:

- `file`: local `data/*.json`; default for local development.
- `firestore`: Google Firestore Native mode; default on Cloud Run when `K_SERVICE` is set.

Firestore documents:

- `okrAdmin/config`
- `okrSnapshots/current`
- `okrPeriodSnapshots/{periodId}`
- `okrDrafts/{periodId_team}`
- `okrProgressNotes/{periodId_team_objectiveId_weekStart}`
- `okrAdminEvents/{eventId}`

Before switching production to Firestore, migrate local JSON state:

```powershell
$env:OKR_STORAGE = "firestore"
$env:FIRESTORE_PROJECT_ID = "<gcp-project-id>"
npm run migrate:firestore
```

## Page Editing

Authorized users can add `mode=edit` to the overview page to edit OKRs directly in the browser. Drafts and published snapshots are saved through the configured storage backend.

## Data Entry

OKRs are created and maintained directly in the browser page editor. The app no longer imports OKRs from Google Docs or CSV files.

Drafts are saved first. Publishing a draft writes normalized OKR records into the current snapshot and the selected period snapshot. Rollback restores the previous snapshot backup.

## Cloud Run Deployment

The production deployment target is the `nero` GCP project:

- Project ID: `gen-lang-client-0913302758`
- Runtime: Cloud Run
- Image registry: Artifact Registry `unitx-internal`
- Auth boundary: IAP, default `domain:unitxlabs.com`
- Storage: Firestore

Build and push an image:

```powershell
powershell -ExecutionPolicy Bypass -File .\deploy\scripts\push-image.ps1 -Tag staging
```

Apply infrastructure:

```powershell
cd .\deploy\terraform
copy terraform.tfvars.example terraform.tfvars
terraform init
terraform apply
```

See `deploy/terraform/README.md` for the full setup and cutover checklist.

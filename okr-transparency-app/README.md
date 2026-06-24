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

OKR pages are visible to everyone with access to the app. JSON APIs, editing, publishing, sync, rollback, and admin configuration require authentication.

Google OAuth is the normal identity source. Configure:

- `AUTH_SECRET`
- `AUTH_GOOGLE_ID`
- `AUTH_GOOGLE_SECRET`
- `OKR_ALLOWED_GOOGLE_DOMAINS` (defaults to `unitxlabs.com`)

Google OAuth callback URL:

`http://localhost:3000/api/auth/callback/google`

While Google OAuth is not configured, local development can use the credentials fallback. In non-production, the default fallback is `admin` / `1234`; set `OKR_LOCAL_ADMIN_USERNAME` and `OKR_LOCAL_ADMIN_PASSWORD` to override it. In production, the credentials provider and password form are disabled; use Google OAuth.

Google sign-in is accepted when the email matches `OKR_ALLOWED_GOOGLE_DOMAINS` or an enabled user in the admin config. The admin backend stores role rules in `data/okr-admin-config.json` for local file storage and `okrAdmin/config` for Firestore storage:

- `super_admin`: all admin, edit, publish, sync, and rollback permissions.
- `team_leader`: edit and publish assigned teams.
- `user`: edit only OKR/KR records whose owner matches one of their `ownerAliases`.

`OKR_ADMIN_TOKEN` remains available as a break-glass fallback for API calls. In production, keep it in Secret Manager and leave the token UI hidden unless `NEXT_PUBLIC_ENABLE_ADMIN_TOKEN_LOGIN=true` is intentionally set.

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

## Data Sources

The app reads a structured OKR table and stores the latest valid normalized snapshot.

Supported sources:

- `OKR_SOURCE_CSV_FILE`: local CSV file under `data/` for import drills.
- `OKR_SOURCE_CSV_URL`: remote CSV export URL.
- `GOOGLE_DOC_ID`: Google Doc with a structured OKR table.

For Google Docs API access, provide either:

- `GOOGLE_SERVICE_ACCOUNT_JSON`: service account JSON string.
- `GOOGLE_APPLICATION_CREDENTIALS`: path to a service account JSON file.

## Sync

`POST /api/sync` triggers a read-only source sync. It requires a `super_admin` Google session or the emergency `OKR_ADMIN_TOKEN` fallback:

```powershell
Invoke-RestMethod -Method Post http://localhost:3000/api/sync -Headers @{ "x-admin-token" = "<token>" }
```

If `OKR_ADMIN_TOKEN` is unset in development, the emergency fallback token is `dev-admin-token`.

## Required OKR Fields

The structured Google Doc table or CSV must include these headers:

`okr_id,parent_id,level,team,objective,kr,type,owner,baseline,target,actual,score,confidence,dependencies,risks,decisions_needed,source_doc_url,last_update`

Production parsing is deterministic and does not rely on LLM extraction.

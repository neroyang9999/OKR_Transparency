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

OKRs are publicly visible to everyone. Editing, publishing, sync, rollback, and admin configuration require authentication.

Google OAuth is the normal identity source. Configure:

- `AUTH_SECRET`
- `AUTH_GOOGLE_ID`
- `AUTH_GOOGLE_SECRET`

Google OAuth callback URL:

`http://localhost:3000/api/auth/callback/google`

While Google OAuth is not configured, local development can use the credentials fallback. In non-production, the default fallback is `admin` / `1234`; set `OKR_LOCAL_ADMIN_USERNAME` and `OKR_LOCAL_ADMIN_PASSWORD` to override it. In production, the credentials fallback is disabled unless both environment variables are explicitly set.

The admin backend stores role rules in `data/okr-admin-config.json`:

- `super_admin`: all admin, edit, publish, sync, and rollback permissions.
- `team_leader`: edit and publish assigned teams.
- `user`: edit only OKR/KR records whose owner matches one of their `ownerAliases`.

`OKR_ADMIN_TOKEN` remains available as a local emergency fallback for admin configuration and operational writes.

## Page Editing

Authorized users can add `mode=edit` to the overview page to edit OKRs directly in the browser. Drafts are saved to `data/okr-drafts.json`; publishing writes the selected team's records into `data/okr-snapshot.json`.

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

# Engineering OKR Operating App

Internal Engineering OKR operating system for drafting, publishing, alignment, weekly progress, attention review, and safe team-scoped rollback.

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

## Version and Change Management

The project follows Semantic Versioning (`major.minor.patch`). `package.json` is the single source of truth for the application version; the UI reads the version from it directly, and `package-lock.json` must stay synchronized.

Every user-facing change must first be added under `Unreleased` in `CHANGELOG.md`. For a release:

1. Choose the SemVer increment: patch for compatible fixes, minor for compatible features, major for breaking changes.
2. Update `package.json` and `package-lock.json` to the same version.
3. Move the relevant `Unreleased` entries into a dated `vX.Y.Z` section.
4. Run `npm test`, `npm run lint`, and `npm run build` before merging into `main`.
5. Use a release commit such as `Release vX.Y.Z`; create and push a matching Git tag only when the release is deployed.

## Authentication and Permissions

OKR pages are visible to everyone with access to the app. JSON APIs, feedback submission, editing, publishing, rollback, and admin configuration require authentication.

Google OAuth is the normal identity source. Configure:

- `AUTH_SECRET`
- `AUTH_GOOGLE_ID`
- `AUTH_GOOGLE_SECRET`
- `OKR_ALLOWED_GOOGLE_DOMAINS` (defaults to `unitxlabs.com`)

Google OAuth callback URL:

`http://localhost:3000/api/auth/callback/google`

While Google OAuth is not configured, local development can use the credentials fallback. In non-production, the default fallback is `admin` / `1234`; set `OKR_LOCAL_ADMIN_USERNAME` and `OKR_LOCAL_ADMIN_PASSWORD` to override it. Production Cloud Run uses IAP as the required identity boundary.

Google sign-in is accepted when the email matches `OKR_ALLOWED_GOOGLE_DOMAINS` or an enabled user in the admin config. The admin backend stores role rules in `data/okr-admin-config.json` for local file storage and `okrAdmin/config` for Firestore storage:

- `super_admin`: all admin, edit, publish, and rollback permissions.
- `team_leader`: edit and publish assigned teams.
- `user`: edit only OKR/KR records whose owner matches one of their `ownerAliases`.

`OKR_ADMIN_TOKEN` remains available as a break-glass fallback for API calls. In production, keep it in Secret Manager and leave the token UI hidden unless `NEXT_PUBLIC_ENABLE_ADMIN_TOKEN_LOGIN=true` is intentionally set.

For the Cloud Run deployment, Identity-Aware Proxy (IAP) protects the whole app first. The app verifies the signed `X-Goog-IAP-JWT-Assertion` issuer, audience, algorithm, expiry, subject, and email before mapping that identity to the admin-role config. The unsigned IAP email header is never trusted.

Admin configuration must retain at least two enabled system administrators with valid email addresses. A signed-in administrator cannot delete, disable, or demote their own account; the admin-token break-glass path may be used only to bootstrap two real administrator accounts.

## Admin Operating Console

`/admin` is organized around five administrator jobs:

- Runtime status: current period, publish coverage, data quality, and actionable attention items.
- Periods: create a planned period, activate one current period, and lock historical periods.
- Organization and access: maintain the team hierarchy, account roles, team scope, and effective permissions.
- User feedback: review and search authenticated feedback with its submitter, source page, and timestamp.
- Audit and recovery: filter events, compare a saved team version with current records, roll back a scoped version, and export a full backup.

Admin configuration is normalized to v2 when read. Legacy JSON remains readable and is only rewritten after an administrator explicitly saves. v2 uses one period state (`planned`, `active`, or `locked`), removes the unused legacy permission list, and adds a revision number so stale admin saves are rejected instead of silently overwriting newer configuration.

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
- `okrFeedback/{feedbackId}`

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

Drafts are saved first. Publishing writes normalized OKR records into the selected period and, for the configured default period, the current snapshot. Rollback restores a selected team-and-period version without changing other teams.

Publishing validates the complete candidate graph before any public data changes. Structural Objective/KR relationships use `parent_id`; cross-team alignment uses `aligned_to_id`. Every publish stores a team-and-period version, and concurrent updates to the current Firestore snapshot are rejected instead of silently overwriting newer data.

KR publishing requires an owner, baseline, target, and risk/decision context for Yellow or Red status. Weekly KR updates can change actual value, progress, confidence, risk, next steps, and an evidence link in one action.

Local data repair and migration commands:

```powershell
npm run repair:okr-graph
npm run repair:okr-graph -- --write
npm run migrate:alignment-edges
npm run migrate:alignment-edges -- --write
```

Both write modes preserve the previous JSON files under `data/repair-backups/`.

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

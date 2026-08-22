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

Accounts in `OKR_ALLOWED_GOOGLE_DOMAINS` that are not present in the admin config receive read-only access. They can browse OKRs but have no team membership, owner aliases, edit, publish, progress-update, or admin permissions. Explicitly disabled accounts remain blocked.

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

## My Action Center

`/my` is the signed-in user's focused operating view for the active period. It derives four lists from existing OKR, progress-note, draft, owner, and permission data:

- My KRs: published KRs whose owner matches the user's configured aliases.
- Update due: owned KRs with no record or parent-Objective progress activity for more than seven days.
- Risks and decisions: owned KRs that are Yellow/Red or contain risk or decision-needed context.
- Review queue: unpublished team drafts inside a team leader's or system administrator's publish scope.

The action center does not maintain a second task model. Its links open the existing member-scoped editor, team draft editor, and OKR detail pages.

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

Production has run on Firestore since the July 2026 cutover, so this is history rather than a
step to perform -- `deploy/scripts/provisioning/okr_migrate_data.sh` is the run that did it.
To seed a *new* environment from local JSON state:

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

Objective, KR, risk, and decision text supports Chinese and English versions. The editor detects the language actually entered instead of assuming it from the page language, keeps acronym-only values unchanged, and generates the other language through Cloud Translation when running on GCP. Machine translations can be edited and are never overwritten after a user changes them. Translation failure never blocks saving the original text.

Publishing validates the complete candidate graph before any public data changes. Structural Objective/KR relationships use `parent_id`; cross-team alignment uses `aligned_to_id`. Every publish stores a team-and-period version, and concurrent updates to the current Firestore snapshot are rejected instead of silently overwriting newer data.

For the active period, one publication candidate is used for both `okrSnapshots/current` and `okrPeriodSnapshots/{periodId}` so the public and period views have the same records. Structural parents must be Objectives in the same team. When a republished parent team removes an alignment target, child-team Objectives are kept but their optional `aligned_to_id` is cleared with a warning (`ON DELETE SET NULL`).

Production OKR data can be inspected and reset without touching admin configuration, users, feedback, or audit events:

```powershell
npm run reset:firestore-okrs -- --project=knowledge-base-496322
npm run reset:firestore-okrs -- --project=knowledge-base-496322 --write --confirm=DELETE_PRODUCTION_OKR_DATA
```

The first command is always read-only. The write command backs up the raw Firestore documents under `data/firestore-reset-backups/`, deletes only OKR snapshots, period snapshots, drafts, progress notes, snapshot versions, and the legacy rollback snapshot, then verifies that none remain.

KR publishing requires a title and owner. Baseline, target, dependency, risk, and decision fields remain compatible with historical snapshots but are optional; detail views show them only when they contain data. Weekly KR updates can change actual value, progress, confidence, risk, next steps, and an evidence link in one action.

Local data repair and migration commands:

```powershell
npm run repair:okr-graph
npm run repair:okr-graph -- --write
npm run migrate:alignment-edges
npm run migrate:alignment-edges -- --write
```

Both write modes preserve the previous JSON files under `data/repair-backups/`.

## Cloud Run Deployment

The production deployment target is the `knowledge-base-496322` GCP project:

- Project ID: `knowledge-base-496322`
- Runtime: Cloud Run
- Image registry: Artifact Registry `unitx-internal`
- Auth boundary: IAP, default `domain:unitxlabs.com`
- Storage: Firestore
- Bilingual content: Cloud Translation Advanced using the Cloud Run service identity

Releasing a new version follows **`docs/RELEASE_CLOUD_RUN.md`**: Cloud Build produces an image,
Cloud Run takes it as a candidate revision at 0% traffic, and traffic shifts only after the
candidate has been checked. Nothing else is needed to ship.

The infrastructure itself was created by the gcloud scripts in
`deploy/scripts/provisioning/`, which are the only record of how it was set up.
`okr_finish_prod.sh` is the one that produced the configuration running today.

To see which version is live: `gcloud run services describe okr-transparency-app
--project=knowledge-base-496322 --region=us-west1 --format='value(status.traffic)'`.

`deploy/scripts/push-image.ps1` builds and pushes an image with local Docker. It is a one-off
alternative that skips the Cloud Build dependency cache, so releases should use the runbook.

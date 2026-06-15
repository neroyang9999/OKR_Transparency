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

## Page Editing Prototype

Add `mode=edit` to the overview page to edit OKRs directly in the browser. Drafts are saved to `data/okr-drafts.json`; publishing writes the selected team's records into `data/okr-snapshot.json`.

The prototype keeps the existing read-only pages intact. It uses `dev-admin-token` locally for draft save and publish API calls.

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

`POST /api/sync` triggers a read-only source sync. Set `OKR_ADMIN_TOKEN` and pass it with:

```powershell
Invoke-RestMethod -Method Post http://localhost:3000/api/sync -Headers @{ "x-admin-token" = "<token>" }
```

If `OKR_ADMIN_TOKEN` is unset in development, use `dev-admin-token`.

## Required OKR Fields

The structured Google Doc table or CSV must include these headers:

`okr_id,parent_id,level,team,objective,kr,type,owner,baseline,target,actual,score,confidence,dependencies,risks,decisions_needed,source_doc_url,last_update`

Production parsing is deterministic and does not rely on LLM extraction.

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { google } from "googleapis";

const projectId = process.argv.find((argument) => argument.startsWith("--project="))?.slice("--project=".length)
  || process.env.FIRESTORE_PROJECT_ID
  || process.env.GOOGLE_CLOUD_PROJECT;
const databaseId = process.env.FIRESTORE_DATABASE_ID || "(default)";
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = path.join(rootDir, "data");

if (!projectId) throw new Error("Pass --project=<google-cloud-project>");

const [config, snapshot, rollbackSnapshot, drafts, periods, progressNotes, versions] = await Promise.all([
  readDocument("okrAdmin/config"),
  readDocument("okrSnapshots/current"),
  readDocument("okrAdmin/rollbackSnapshot"),
  listDocuments("okrDrafts"),
  listDocuments("okrPeriodSnapshots"),
  listDocuments("okrProgressNotes"),
  listDocuments("okrSnapshotVersions")
]);

if (!config) throw new Error("Online okrAdmin/config is missing; local files were not changed");
if (!snapshot) throw new Error("Online okrSnapshots/current is missing; local files were not changed");

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupDir = path.join(dataDir, "local-sync-backups", stamp);
await fs.mkdir(backupDir, { recursive: true });

const localFiles = (await fs.readdir(dataDir)).filter((name) => name.startsWith("okr-") && name.endsWith(".json"));
for (const name of localFiles) {
  await fs.copyFile(path.join(dataDir, name), path.join(backupDir, name));
}

const outputs = [
  ["okr-admin-config.json", config],
  ["okr-snapshot.json", snapshot],
  ["okr-drafts.json", { version: 1, drafts }],
  ["okr-period-snapshots.json", { version: 1, periods }],
  ["okr-progress-notes.json", { version: 2, notes: progressNotes }],
  ["okr-snapshot-versions.json", { version: 1, versions }]
];
if (rollbackSnapshot) outputs.push(["okr-admin-rollback-snapshot.json", rollbackSnapshot]);

for (const [name, value] of outputs) {
  await fs.writeFile(path.join(dataDir, name), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

console.log(`Project: ${projectId}; database: ${databaseId}`);
console.log(`Snapshot records: ${Array.isArray(snapshot.records) ? snapshot.records.length : 0}`);
console.log(`Period snapshots: ${periods.length}; drafts: ${drafts.length}; progress notes: ${progressNotes.length}; versions: ${versions.length}`);
console.log(`Wrote ${outputs.length} local data file(s). Backup: ${backupDir}`);
if (!rollbackSnapshot) console.log("Online rollback snapshot is absent; the existing local rollback file was left unchanged and copied into the backup.");

async function listDocuments(collectionPath) {
  const values = [];
  let pageToken = "";
  do {
    const params = new URLSearchParams({ pageSize: "300" });
    if (pageToken) params.set("pageToken", pageToken);
    const response = await firestoreFetch(`${collectionPath}?${params}`);
    if (response.status === 404) return values;
    await assertOk(response, `list ${collectionPath}`);
    const body = await response.json();
    values.push(...(body.documents ?? []).map((document) => decodeFields(document.fields ?? {})));
    pageToken = body.nextPageToken ?? "";
  } while (pageToken);
  return values;
}

async function readDocument(documentPath) {
  const response = await firestoreFetch(documentPath);
  if (response.status === 404) return null;
  await assertOk(response, `read ${documentPath}`);
  const document = await response.json();
  return decodeFields(document.fields ?? {});
}

async function firestoreFetch(documentPath) {
  const accessToken = await getAccessToken();
  const encodedPath = documentPath
    .split("/")
    .map((segment) => segment.includes("?") ? segment : encodeURIComponent(segment))
    .join("/");
  return fetch(`${documentsUrl()}/${encodedPath}`, {
    headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" }
  });
}

function documentsUrl() {
  return `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/${encodeURIComponent(databaseId)}/documents`;
}

async function getAccessToken() {
  const auth = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
    ? new google.auth.GoogleAuth({ credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON), scopes: ["https://www.googleapis.com/auth/datastore"] })
    : new google.auth.GoogleAuth({ scopes: ["https://www.googleapis.com/auth/datastore"] });
  const client = await auth.getClient();
  const token = await client.getAccessToken();
  const accessToken = typeof token === "string" ? token : token?.token;
  if (!accessToken) throw new Error("Unable to obtain Google access token for Firestore");
  return accessToken;
}

function decodeFields(fields) {
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, decodeValue(value)]));
}

function decodeValue(value) {
  if ("nullValue" in value) return null;
  if ("booleanValue" in value) return value.booleanValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return value.doubleValue;
  if ("timestampValue" in value) return value.timestampValue;
  if ("stringValue" in value) return value.stringValue;
  if ("arrayValue" in value) return (value.arrayValue.values ?? []).map(decodeValue);
  if ("mapValue" in value) return decodeFields(value.mapValue.fields ?? {});
  if ("referenceValue" in value) return value.referenceValue;
  if ("geoPointValue" in value) return value.geoPointValue;
  return null;
}

async function assertOk(response, action) {
  if (response.ok) return;
  throw new Error(`Firestore ${action} failed: ${response.status} ${await response.text()}`);
}

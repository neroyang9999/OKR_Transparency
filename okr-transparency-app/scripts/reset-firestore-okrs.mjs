import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { google } from "googleapis";

const write = process.argv.includes("--write");
const confirmation = process.argv.find((argument) => argument.startsWith("--confirm="))?.slice("--confirm=".length);
const projectId = process.argv.find((argument) => argument.startsWith("--project="))?.slice("--project=".length)
  || process.env.FIRESTORE_PROJECT_ID
  || process.env.GOOGLE_CLOUD_PROJECT;
const databaseId = process.env.FIRESTORE_DATABASE_ID || "(default)";
const collections = ["okrSnapshots", "okrPeriodSnapshots", "okrDrafts", "okrProgressNotes", "okrSnapshotVersions"];
const standaloneDocuments = ["okrAdmin/rollbackSnapshot"];

if (!projectId) throw new Error("Pass --project=<google-cloud-project> before inspecting or deleting Firestore data");
if (write && confirmation !== "DELETE_PRODUCTION_OKR_DATA") {
  throw new Error("Refusing to delete. Pass --confirm=DELETE_PRODUCTION_OKR_DATA with --write");
}

const documents = [];
for (const collection of collections) documents.push(...await listDocuments(collection));
for (const documentPath of standaloneDocuments) {
  const document = await readDocument(documentPath);
  if (document) documents.push(document);
}

console.log(`Project: ${projectId}; database: ${databaseId}`);
for (const collection of collections) {
  const prefix = `${documentsResource()}/${collection}/`;
  console.log(`${collection}: ${documents.filter((document) => document.name?.startsWith(prefix)).length}`);
}
console.log(`okrAdmin/rollbackSnapshot: ${documents.some((document) => document.name?.endsWith("/okrAdmin/rollbackSnapshot")) ? 1 : 0}`);

if (!write) {
  console.log(`Dry run only. ${documents.length} OKR document(s) would be backed up and deleted.`);
  process.exit(0);
}

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const backupPath = path.join(rootDir, "data", "firestore-reset-backups", `${projectId}-${stamp}.json`);
await fs.mkdir(path.dirname(backupPath), { recursive: true });
await fs.writeFile(backupPath, `${JSON.stringify({ projectId, databaseId, createdAt: new Date().toISOString(), documents }, null, 2)}\n`, "utf8");

for (const document of documents) {
  if (!document.name) continue;
  await deleteDocument(document.name);
}

const remaining = [];
for (const collection of collections) remaining.push(...await listDocuments(collection));
for (const documentPath of standaloneDocuments) {
  const document = await readDocument(documentPath);
  if (document) remaining.push(document);
}
if (remaining.length > 0) throw new Error(`Reset verification failed: ${remaining.length} OKR document(s) remain`);

console.log(`Deleted and verified ${documents.length} OKR document(s). Backup: ${backupPath}`);

async function listDocuments(collectionPath) {
  const documents = [];
  let pageToken = "";
  do {
    const params = new URLSearchParams({ pageSize: "300" });
    if (pageToken) params.set("pageToken", pageToken);
    const response = await firestoreFetch(`${collectionPath}?${params}`);
    if (response.status === 404) return documents;
    await assertOk(response, `list ${collectionPath}`);
    const body = await response.json();
    documents.push(...(body.documents ?? []));
    pageToken = body.nextPageToken ?? "";
  } while (pageToken);
  return documents;
}

async function readDocument(documentPath) {
  const response = await firestoreFetch(documentPath);
  if (response.status === 404) return null;
  await assertOk(response, `read ${documentPath}`);
  return response.json();
}

async function deleteDocument(documentName) {
  const prefix = `${documentsResource()}/`;
  if (!documentName.startsWith(prefix)) throw new Error(`Unexpected Firestore document name: ${documentName}`);
  const documentPath = documentName.slice(prefix.length);
  const response = await firestoreFetch(documentPath, { method: "DELETE" });
  if (response.status === 404) return;
  await assertOk(response, `delete ${documentPath}`);
}

async function firestoreFetch(documentPath, init = {}) {
  const accessToken = await getAccessToken();
  const encodedPath = documentPath
    .split("/")
    .map((segment) => segment.includes("?") ? segment : encodeURIComponent(segment))
    .join("/");
  return fetch(`${documentsUrl()}/${encodedPath}`, {
    ...init,
    headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json", ...init.headers }
  });
}

function documentsUrl() {
  return `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/${encodeURIComponent(databaseId)}/documents`;
}

function documentsResource() {
  return `projects/${projectId}/databases/${databaseId}/documents`;
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

async function assertOk(response, action) {
  if (response.ok) return;
  throw new Error(`Firestore ${action} failed: ${response.status} ${await response.text()}`);
}

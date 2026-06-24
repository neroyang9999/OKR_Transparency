import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { google } from "googleapis";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = path.join(rootDir, "data");
const firestoreScope = "https://www.googleapis.com/auth/datastore";

const migrations = [
  {
    file: "okr-admin-config.json",
    migrate: async (value) => writeFirestoreDocument("okrAdmin/config", value)
  },
  {
    file: "okr-snapshot.json",
    migrate: async (value) => writeFirestoreDocument("okrSnapshots/current", value)
  },
  {
    file: "okr-admin-rollback-snapshot.json",
    migrate: async (value) => writeFirestoreDocument("okrAdmin/rollbackSnapshot", value)
  },
  {
    file: "okr-drafts.json",
    migrate: async (value) => {
      for (const draft of value.drafts ?? []) {
        await writeFirestoreDocument(`okrDrafts/${documentIdFromParts([draft.periodId, draft.team])}`, draft);
      }
    }
  },
  {
    file: "okr-period-snapshots.json",
    migrate: async (value) => {
      for (const period of value.periods ?? []) {
        await writeFirestoreDocument(`okrPeriodSnapshots/${documentIdFromParts([period.periodId])}`, period);
      }
    }
  },
  {
    file: "okr-progress-notes.json",
    migrate: async (value) => {
      for (const note of normalizeProgressNotes(value)) {
        await writeFirestoreDocument(
          `okrProgressNotes/${documentIdFromParts([note.periodId, note.team, note.objectiveId, note.weekStart])}`,
          note
        );
      }
    }
  },
  {
    file: "okr-admin-events.json",
    migrate: async (value) => {
      for (const event of value.events ?? []) {
        await writeFirestoreDocument(`okrAdminEvents/${event.id}`, event);
      }
    }
  }
];

for (const migration of migrations) {
  const filePath = path.join(dataDir, migration.file);
  const value = await readJson(filePath);
  if (!value) {
    console.log(`skip ${migration.file}: file not found`);
    continue;
  }

  await migration.migrate(value);
  console.log(`migrated ${migration.file}`);
}

async function readJson(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch (error) {
    if (error && error.code === "ENOENT") return null;
    throw error;
  }
}

async function writeFirestoreDocument(documentPath, value) {
  const response = await firestoreFetch(documentPath, {
    method: "PATCH",
    body: JSON.stringify({ fields: encodeFirestoreFields(value) })
  });
  if (response.ok) return;

  throw new Error(`Firestore write ${documentPath} failed: ${response.status} ${await response.text()}`);
}

async function firestoreFetch(documentPath, init) {
  const [projectId, accessToken] = await Promise.all([getProjectId(), getAccessToken()]);
  const databaseId = encodeURIComponent(process.env.FIRESTORE_DATABASE_ID || "(default)");
  const encodedPath = documentPath.split("/").map(encodeURIComponent).join("/");

  return fetch(`https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/${databaseId}/documents/${encodedPath}`, {
    ...init,
    headers: {
      "authorization": `Bearer ${accessToken}`,
      "content-type": "application/json",
      ...init.headers
    }
  });
}

async function getProjectId() {
  const explicitProjectId = process.env.FIRESTORE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT;
  if (explicitProjectId) return explicitProjectId;

  return getGoogleAuth().getProjectId();
}

async function getAccessToken() {
  const client = await getGoogleAuth().getClient();
  const token = await client.getAccessToken();
  const accessToken = typeof token === "string" ? token : token?.token;
  if (!accessToken) throw new Error("Unable to obtain Google access token for Firestore");
  return accessToken;
}

function getGoogleAuth() {
  const credentialsJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (credentialsJson) {
    return new google.auth.GoogleAuth({
      credentials: JSON.parse(credentialsJson),
      scopes: [firestoreScope]
    });
  }

  return new google.auth.GoogleAuth({ scopes: [firestoreScope] });
}

function encodeFirestoreFields(value) {
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, encodeFirestoreValue(item)])
  );
}

function encodeFirestoreValue(value) {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (typeof value === "string") return { stringValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encodeFirestoreValue) } };
  if (typeof value === "object") return { mapValue: { fields: encodeFirestoreFields(value) } };
  return { stringValue: String(value) };
}

function documentIdFromParts(parts) {
  return Buffer
    .from(parts.map((part) => String(part).trim()).join("\u0000") || "default", "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function normalizeProgressNotes(value) {
  if (!Array.isArray(value.notes)) return [];
  if (value.version !== 1) return value.notes;

  return value.notes
    .map((note) => ({
      team: note.team ?? "",
      periodId: note.periodId ?? "",
      objectiveId: note.objectiveId ?? "",
      weekStart: getWeekStart(note.updatedAt),
      summary: String(note.note ?? "").trim(),
      status: "Yellow",
      risks: "",
      nextSteps: "",
      updatedBy: note.updatedBy || "Lead",
      updatedAt: note.updatedAt || new Date().toISOString()
    }))
    .filter((note) => note.team && note.periodId && note.objectiveId && note.summary);
}

function getWeekStart(input) {
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return formatDate(new Date());

  const localDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = localDate.getDay();
  localDate.setDate(localDate.getDate() - (day === 0 ? 6 : day - 1));
  return formatDate(localDate);
}

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

import { google } from "googleapis";

type FirestoreValue =
  | { nullValue: null }
  | { booleanValue: boolean }
  | { integerValue: string }
  | { doubleValue: number }
  | { stringValue: string }
  | { arrayValue: { values?: FirestoreValue[] } }
  | { mapValue: { fields?: Record<string, FirestoreValue> } };

type FirestoreDocument = {
  name?: string;
  fields?: Record<string, FirestoreValue>;
};

const firestoreScope = "https://www.googleapis.com/auth/datastore";

export async function readFirestoreDocument<T>(documentPath: string): Promise<T | null> {
  const response = await firestoreFetch(documentPath);
  if (response.status === 404) return null;
  await assertOk(response, `read ${documentPath}`);

  const document = await response.json() as FirestoreDocument;
  return decodeFirestoreFields(document.fields ?? {}) as T;
}

export async function writeFirestoreDocument(documentPath: string, value: Record<string, unknown>) {
  const response = await firestoreFetch(documentPath, {
    method: "PATCH",
    body: JSON.stringify({ fields: encodeFirestoreFields(value) })
  });
  await assertOk(response, `write ${documentPath}`);
}

export async function listFirestoreCollection<T>(collectionPath: string, pageSize = 200, orderBy?: string): Promise<T[]> {
  const params = new URLSearchParams({ pageSize: String(pageSize) });
  if (orderBy) params.set("orderBy", orderBy);

  const response = await firestoreFetch(`${collectionPath}?${params.toString()}`);
  if (response.status === 404) return [];
  await assertOk(response, `list ${collectionPath}`);

  const body = await response.json() as { documents?: FirestoreDocument[] };
  return (body.documents ?? []).map((document) => decodeFirestoreFields(document.fields ?? {}) as T);
}

export function encodeFirestoreFields(value: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, encodeFirestoreValue(item)])
  );
}

export function decodeFirestoreFields(fields: Record<string, FirestoreValue>) {
  return Object.fromEntries(
    Object.entries(fields).map(([key, value]) => [key, decodeFirestoreValue(value)])
  );
}

function encodeFirestoreValue(value: unknown): FirestoreValue {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (typeof value === "string") return { stringValue: value };
  if (Array.isArray(value)) {
    return { arrayValue: { values: value.map(encodeFirestoreValue) } };
  }
  if (typeof value === "object") {
    return { mapValue: { fields: encodeFirestoreFields(value as Record<string, unknown>) } };
  }

  return { stringValue: String(value) };
}

function decodeFirestoreValue(value: FirestoreValue): unknown {
  if ("nullValue" in value) return null;
  if ("booleanValue" in value) return value.booleanValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return value.doubleValue;
  if ("stringValue" in value) return value.stringValue;
  if ("arrayValue" in value) return (value.arrayValue.values ?? []).map(decodeFirestoreValue);
  if ("mapValue" in value) return decodeFirestoreFields(value.mapValue.fields ?? {});
  return null;
}

async function firestoreFetch(documentOrCollectionPath: string, init: RequestInit = {}) {
  const [projectId, accessToken] = await Promise.all([getProjectId(), getAccessToken()]);
  const databaseId = encodeURIComponent(process.env.FIRESTORE_DATABASE_ID || "(default)");
  const path = documentOrCollectionPath
    .split("/")
    .map((segment) => segment.includes("?") ? segment : encodeURIComponent(segment))
    .join("/");
  const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/${databaseId}/documents/${path}`;

  return fetch(url, {
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

async function assertOk(response: Response, action: string) {
  if (response.ok) return;

  const body = await response.text().catch(() => "");
  throw new Error(`Firestore ${action} failed: ${response.status} ${body}`);
}

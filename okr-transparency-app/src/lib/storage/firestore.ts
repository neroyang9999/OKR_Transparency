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
  updateTime?: string;
};

type FirestoreWriteOptions = {
  updateTime?: string;
  exists?: boolean;
};

const firestoreScope = "https://www.googleapis.com/auth/datastore";

export async function readFirestoreDocument<T>(documentPath: string): Promise<T | null> {
  return (await readFirestoreDocumentWithMetadata<T>(documentPath))?.value ?? null;
}

export async function readFirestoreDocumentWithMetadata<T>(documentPath: string): Promise<{ value: T; updateTime: string } | null> {
  const response = await firestoreFetch(documentPath);
  if (response.status === 404) return null;
  await assertOk(response, `read ${documentPath}`);

  const document = await response.json() as FirestoreDocument;
  return {
    value: decodeFirestoreFields(document.fields ?? {}) as T,
    updateTime: document.updateTime ?? ""
  };
}

export async function writeFirestoreDocument(documentPath: string, value: Record<string, unknown>, options: FirestoreWriteOptions = {}) {
  const params = new URLSearchParams();
  if (options.updateTime) params.set("currentDocument.updateTime", options.updateTime);
  if (options.exists !== undefined) params.set("currentDocument.exists", String(options.exists));
  const query = params.toString();
  const response = await firestoreFetch(`${documentPath}${query ? `?${query}` : ""}`, {
    method: "PATCH",
    body: JSON.stringify({ fields: encodeFirestoreFields(value) })
  });
  if ((response.status === 409 || response.status === 412) && (options.updateTime || options.exists !== undefined)) {
    throw new FirestorePreconditionError();
  }
  await assertOk(response, `write ${documentPath}`);
  const document = await response.json() as FirestoreDocument;
  return document.updateTime ?? "";
}

export async function deleteFirestoreDocument(documentPath: string) {
  const response = await firestoreFetch(documentPath, { method: "DELETE" });
  if (response.status === 404) return false;
  await assertOk(response, `delete ${documentPath}`);
  return true;
}

export class FirestorePreconditionError extends Error {
  constructor() {
    super("Firestore document changed before write");
    this.name = "FirestorePreconditionError";
  }
}

const listRequestSize = 300;
const listPageCap = 200;

/**
 * Reads a collection, following nextPageToken until the collection is exhausted
 * or `limit` documents have been collected. Pass `limit: undefined` to read
 * everything — a single request only ever returns one page, so a caller that
 * needs the whole collection would otherwise get a silently truncated prefix
 * ordered by document name.
 */
export async function listFirestoreCollection<T>(collectionPath: string, limit?: number, orderBy?: string): Promise<T[]> {
  const documents: T[] = [];
  let pageToken = "";

  for (let page = 0; page < listPageCap; page += 1) {
    const remaining = limit === undefined ? listRequestSize : Math.min(limit - documents.length, listRequestSize);
    if (remaining <= 0) return documents;

    const params = new URLSearchParams({ pageSize: String(remaining) });
    if (orderBy) params.set("orderBy", orderBy);
    if (pageToken) params.set("pageToken", pageToken);

    const response = await firestoreFetch(`${collectionPath}?${params.toString()}`);
    if (response.status === 404) return documents;
    await assertOk(response, `list ${collectionPath}`);

    const body = await response.json() as { documents?: FirestoreDocument[]; nextPageToken?: string };
    (body.documents ?? []).forEach((document) => documents.push(decodeFirestoreFields(document.fields ?? {}) as T));

    pageToken = body.nextPageToken ?? "";
    if (!pageToken) return documents;
  }

  console.warn(`Firestore list ${collectionPath} hit the ${listPageCap}-page safety cap; results are incomplete`);
  return documents;
}

/**
 * Reads the documents in a collection whose `field` equals `value`. Firestore
 * indexes every single field by default, so this needs no deployed index.
 */
export async function queryFirestoreCollection<T>(collectionId: string, field: string, value: string, limit = 20000): Promise<T[]> {
  const response = await firestoreFetch(":runQuery", {
    method: "POST",
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId }],
        where: { fieldFilter: { field: { fieldPath: field }, op: "EQUAL", value: { stringValue: value } } },
        limit
      }
    })
  });
  if (response.status === 404) return [];
  await assertOk(response, `query ${collectionId} by ${field}`);

  const body = await response.json() as Array<{ document?: FirestoreDocument }>;
  return body
    .filter((result) => result.document)
    .map((result) => decodeFirestoreFields(result.document?.fields ?? {}) as T);
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
  const documentsUrl = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/${databaseId}/documents`;
  // Method calls such as ":runQuery" hang off the documents root itself, with no
  // separating slash and no escaping of the leading colon.
  const path = documentOrCollectionPath.startsWith(":")
    ? documentOrCollectionPath
    : `/${documentOrCollectionPath
      .split("/")
      .map((segment) => segment.includes("?") ? segment : encodeURIComponent(segment))
      .join("/")}`;
  const url = `${documentsUrl}${path}`;

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

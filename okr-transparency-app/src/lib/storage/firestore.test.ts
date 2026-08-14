import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { documentIdFromParts } from "./document-ids";
import { decodeFirestoreFields, encodeFirestoreFields, listFirestoreCollection, queryFirestoreCollection } from "./firestore";

vi.mock("googleapis", () => ({
  google: {
    auth: {
      GoogleAuth: class {
        async getClient() {
          return { getAccessToken: async () => ({ token: "test-token" }) };
        }
        async getProjectId() {
          return "test-project";
        }
      }
    }
  }
}));

describe("Firestore JSON helpers", () => {
  it("round-trips the JSON shapes used by OKR storage", () => {
    const input = {
      version: 1,
      meta: {
        status: "ok",
        rowCount: 2,
        archived: false,
        score: 0.75,
        empty: null
      },
      records: [
        { id: "SW-O1", owner: "Software Lead", score: 0.5 },
        { id: "SW-KR1", owner: "Team Member", score: null }
      ]
    };

    expect(decodeFirestoreFields(encodeFirestoreFields(input))).toEqual(input);
  });

  it("creates deterministic Firestore-safe document ids from composite keys", () => {
    const id = documentIdFromParts(["2026-q3", "Application Team", "APP/O1", "2026-06-22"]);

    expect(id).toBe(documentIdFromParts(["2026-q3", "Application Team", "APP/O1", "2026-06-22"]));
    expect(id).not.toContain("/");
    expect(id).not.toContain("+");
    expect(id).not.toContain("=");
  });
});

function documentPage(names: string[], nextPageToken?: string) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      documents: names.map((name) => ({ fields: { name: { stringValue: name } } })),
      ...(nextPageToken ? { nextPageToken } : {})
    })
  } as Response;
}

describe("Firestore collection reads", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    process.env.FIRESTORE_PROJECT_ID = "test-project";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("follows nextPageToken so a collection larger than one page is read in full", async () => {
    fetchMock
      .mockResolvedValueOnce(documentPage(["a", "b"], "token-1"))
      .mockResolvedValueOnce(documentPage(["c", "d"], "token-2"))
      .mockResolvedValueOnce(documentPage(["e"]));

    const documents = await listFirestoreCollection<{ name: string }>("okrProgressNotes");

    expect(documents.map((document) => document.name)).toEqual(["a", "b", "c", "d", "e"]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(String(fetchMock.mock.calls[1][0])).toContain("pageToken=token-1");
  });

  it("stops once the requested limit is reached", async () => {
    fetchMock.mockResolvedValueOnce(documentPage(["a", "b"], "token-1"));

    const documents = await listFirestoreCollection<{ name: string }>("okrAdminEvents", 2, "createdAt desc");

    expect(documents).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain("pageSize=2");
  });

  it("treats a missing collection as empty", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 404, json: async () => ({}) } as Response);

    await expect(listFirestoreCollection("okrProgressNotes")).resolves.toEqual([]);
  });

  it("queries by field equality against the documents root", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ([
        { document: { fields: { periodId: { stringValue: "2026-q3" } } } },
        { readTime: "2026-08-14T00:00:00Z" }
      ])
    } as Response);

    const documents = await queryFirestoreCollection<{ periodId: string }>("okrProgressNotes", "periodId", "2026-q3");

    expect(documents).toEqual([{ periodId: "2026-q3" }]);

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toMatch(/\/documents:runQuery$/);
    expect(JSON.parse(String((init as RequestInit).body))).toMatchObject({
      structuredQuery: {
        from: [{ collectionId: "okrProgressNotes" }],
        where: { fieldFilter: { field: { fieldPath: "periodId" }, op: "EQUAL", value: { stringValue: "2026-q3" } } }
      }
    });
  });
});

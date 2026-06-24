import { describe, expect, it } from "vitest";
import { documentIdFromParts } from "./document-ids";
import { decodeFirestoreFields, encodeFirestoreFields } from "./firestore";

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

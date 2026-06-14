import { describe, expect, it } from "vitest";
import { normalizeAndValidate } from "./normalize";

const baseRow = {
  okr_id: "ENG-O1",
  parent_id: "",
  level: "Engineering",
  team: "Engineering",
  objective: "Objective",
  kr: "",
  type: "Committed",
  owner: "Owner",
  baseline: "Base",
  target: "Target",
  actual: "",
  score: "0.4",
  confidence: "Yellow",
  dependencies: "Dependency",
  risks: "Risk",
  decisions_needed: "",
  source_doc_url: "https://example.com",
  last_update: "2026-06-10"
};

describe("normalizeAndValidate", () => {
  it("normalizes valid rows", () => {
    const result = normalizeAndValidate([baseRow]);
    expect(result.errors).toEqual([]);
    expect(result.records[0].score).toBe(0.4);
  });

  it("rejects duplicate ids", () => {
    const result = normalizeAndValidate([baseRow, baseRow]);
    expect(result.errors.some((error) => error.includes("duplicate okr_id"))).toBe(true);
  });

  it("rejects missing parent links", () => {
    const result = normalizeAndValidate([
      baseRow,
      { ...baseRow, okr_id: "SW-KR1", parent_id: "MISSING", level: "Team", team: "Software", kr: "KR" }
    ]);
    expect(result.errors.some((error) => error.includes("does not exist"))).toBe(true);
  });

  it("warns when Yellow or Red records omit risk and decision fields", () => {
    const result = normalizeAndValidate([{ ...baseRow, risks: "", decisions_needed: "" }]);
    expect(result.warnings.some((warning) => warning.includes("Yellow/Red"))).toBe(true);
  });
});

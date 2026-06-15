import { describe, expect, it } from "vitest";
import { draftToRecords, validateDraft, type OkrDraft } from "./edit-types";

const draft: OkrDraft = {
  version: 1,
  team: "Software",
  periodId: "2026-q3",
  updatedAt: "2026-06-15T00:00:00.000Z",
  objectives: [
    {
      id: "SW-O1",
      periodId: "2026-q3",
      team: "Software",
      title: "Improve software quality",
      owner: "Software Lead",
      type: "Committed",
      confidence: "Yellow",
      weight: 100,
      progress: null,
      alignedToId: "ENG-O1",
      status: "draft",
      keyResults: [
        {
          id: "SW-O1-KR1",
          title: "Reduce escaped issues",
          owner: "Software Lead",
          baseline: "Q2 baseline",
          target: "Q3 target",
          actual: "In progress",
          progress: 50,
          confidence: "Yellow",
          weight: 100,
          risks: "Taxonomy not locked",
          decisionsNeeded: ""
        }
      ]
    }
  ]
};

describe("OKR edit draft helpers", () => {
  it("validates a complete draft", () => {
    const result = validateDraft(draft);
    expect(result.errors).toEqual([]);
  });

  it("converts nested draft data to flat OKR records", () => {
    const records = draftToRecords(draft);
    expect(records).toHaveLength(2);
    expect(records[0]).toMatchObject({ okr_id: "SW-O1", kr: "", score: 0.5 });
    expect(records[1]).toMatchObject({ okr_id: "SW-O1-KR1", parent_id: "SW-O1", score: 0.5 });
    expect(records[1]).not.toHaveProperty("aligned_to_id");
  });

  it("does not require alignment for Software top-level OKRs", () => {
    const result = validateDraft({
      ...draft,
      objectives: draft.objectives.map((objective) => ({ ...objective, alignedToId: undefined }))
    });
    expect(result.warnings.some((warning) => warning.includes("alignment"))).toBe(false);
  });

  it("warns when child-team objectives are not aligned upward", () => {
    const result = validateDraft({
      ...draft,
      team: "QA Team",
      objectives: draft.objectives.map((objective) => ({ ...objective, team: "QA Team", alignedToId: undefined }))
    });
    expect(result.warnings.some((warning) => warning.includes("alignment"))).toBe(true);
  });
});

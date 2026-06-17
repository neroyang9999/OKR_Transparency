import { describe, expect, it } from "vitest";
import { draftToRecords, normalizeDraft, validateDraft, type OkrDraft } from "./edit-types";

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

  it("uses KR weighted progress for objective records", () => {
    const records = draftToRecords({
      ...draft,
      objectives: draft.objectives.map((objective) => ({
        ...objective,
        progress: 99,
        keyResults: [
          { ...objective.keyResults[0], progress: 20, weight: 50 },
          { ...objective.keyResults[0], id: "SW-O1-KR2", progress: 60, weight: 50 }
        ]
      }))
    });

    expect(records[0]).toMatchObject({ okr_id: "SW-O1", score: 0.4 });
  });

  it("keeps published scores within 100 percent", () => {
    const records = draftToRecords({
      ...draft,
      objectives: draft.objectives.map((objective) => ({
        ...objective,
        keyResults: [
          { ...objective.keyResults[0], progress: 200, weight: 100 },
          { ...objective.keyResults[0], id: "SW-O1-KR2", progress: 100, weight: 100 }
        ]
      }))
    });

    expect(records[0].score).toBe(1);
    expect(records[1].score).toBe(1);
    expect(records[2].score).toBe(1);
  });

  it("validates objective and KR numeric ranges", () => {
    const result = validateDraft({
      ...draft,
      objectives: draft.objectives.map((objective) => ({
        ...objective,
        progress: 120,
        weight: -1,
        keyResults: objective.keyResults.map((kr) => ({ ...kr, progress: 101, weight: Number.POSITIVE_INFINITY }))
      }))
    });

    expect(result.errors).toEqual(expect.arrayContaining([
      "O1: weight must be between 0 and 100",
      "O1: progress must be between 0 and 100",
      "O1-KR1: progress must be between 0 and 100",
      "O1-KR1: weight must be between 0 and 100"
    ]));
  });

  it("normalizes invalid draft numbers and derives owner from the selected team", () => {
    const normalized = normalizeDraft({
      ...draft,
      objectives: draft.objectives.map((objective) => ({
        ...objective,
        owner: "Someone Else",
        progress: Number.NaN,
        weight: 120,
        keyResults: objective.keyResults.map((kr) => ({ ...kr, owner: "", progress: -10, weight: 150 }))
      }))
    }, "QA Lead");

    expect(normalized.objectives[0]).toMatchObject({ owner: "QA Lead", progress: null, weight: 100 });
    expect(normalized.objectives[0].keyResults[0]).toMatchObject({ owner: "QA Lead", progress: 0, weight: 100 });
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

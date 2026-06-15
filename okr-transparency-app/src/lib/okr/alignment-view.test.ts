import { describe, expect, it } from "vitest";
import { buildAlignmentViewModel } from "./alignment-view";
import type { OkrRecord } from "./types";

const base = {
  level: "Team",
  team: "Software",
  objective: "Improve quality",
  kr: "",
  type: "Committed",
  owner: "Owner",
  baseline: "",
  target: "",
  actual: "",
  score: 0.3,
  confidence: "Yellow",
  dependencies: "",
  risks: "",
  decisions_needed: "",
  source_doc_url: "",
  last_update: "2026-06-15"
} satisfies Omit<OkrRecord, "okr_id" | "parent_id">;

function record(patch: Partial<OkrRecord> & Pick<OkrRecord, "okr_id" | "parent_id">): OkrRecord {
  return { ...base, ...patch };
}

describe("alignment view model", () => {
  it("turns KR alignment into Objective-to-Objective tree alignment", () => {
    const model = buildAlignmentViewModel([
      record({ okr_id: "SW-O1", parent_id: "", team: "Software", objective: "Software objective" }),
      record({ okr_id: "SW-O1-KR1", parent_id: "SW-O1", team: "Software", objective: "Software objective", kr: "Software KR" }),
      record({ okr_id: "APP-O1", parent_id: "SW-O1-KR1", team: "Application Team", objective: "Application objective" }),
      record({ okr_id: "APP-O1-KR1", parent_id: "APP-O1", team: "Application Team", objective: "Application objective", kr: "Application KR" })
    ]);

    expect(model.roots).toHaveLength(1);
    expect(model.roots[0].objective.okr_id).toBe("SW-O1");
    expect(model.roots[0].children.map((child) => child.objective.okr_id)).toEqual(["APP-O1"]);
    expect(model.roots[0].children[0].keyResults.map((item) => item.okr_id)).toEqual(["APP-O1-KR1"]);
  });

  it("keeps multi-level Objective alignment as a mind-map tree", () => {
    const model = buildAlignmentViewModel([
      record({ okr_id: "SW-TOP-O1", parent_id: "", team: "Software", objective: "Software top objective" }),
      record({ okr_id: "SW-TOP-O1-KR1", parent_id: "SW-TOP-O1", team: "Software", objective: "Software top objective", kr: "Software top KR" }),
      record({ okr_id: "SW-O1", parent_id: "SW-TOP-O1-KR1", team: "Software", objective: "Software objective" }),
      record({ okr_id: "SW-O1-KR1", parent_id: "SW-O1", team: "Software", objective: "Software objective", kr: "Software KR" }),
      record({ okr_id: "APP-O1", parent_id: "SW-O1-KR1", team: "Application Team", objective: "Application objective" })
    ]);

    expect(model.roots[0].objective.okr_id).toBe("SW-TOP-O1");
    expect(model.roots[0].children[0].objective.okr_id).toBe("SW-O1");
    expect(model.roots[0].children[0].children[0].objective.okr_id).toBe("APP-O1");
    expect(model.alignedObjectiveCount).toBe(2);
  });

  it("separates team Objectives that have no upper-level Objective alignment", () => {
    const model = buildAlignmentViewModel([
      record({ okr_id: "SW-O1", parent_id: "", team: "Software", objective: "Software objective" }),
      record({ okr_id: "TPM-O1", parent_id: "", team: "TPM Team", objective: "Unaligned objective" })
    ]);

    expect(model.unalignedObjectives.map((item) => item.okr_id)).toEqual(["TPM-O1"]);
  });

  it("filters the tree to a selected team while preserving ancestors", () => {
    const records = [
      record({ okr_id: "SW-O1", parent_id: "", team: "Software", objective: "Software objective" }),
      record({ okr_id: "APP-O1", parent_id: "SW-O1", team: "Application Team", objective: "Application objective" }),
      record({ okr_id: "QA-O1", parent_id: "SW-O1", team: "QA Team", objective: "QA objective" }),
      record({ okr_id: "TPM-O1", parent_id: "", team: "TPM Team", objective: "Unaligned objective" })
    ];

    const model = buildAlignmentViewModel(records, "QA Team");

    expect(model.roots[0].objective.okr_id).toBe("SW-O1");
    expect(model.roots[0].children.map((item) => item.objective.team)).toEqual(["QA Team"]);
    expect(model.unalignedObjectives).toEqual([]);
    expect(model.teams).toEqual(["Application Team", "QA Team", "TPM Team"]);
  });
});

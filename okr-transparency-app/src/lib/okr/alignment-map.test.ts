import { describe, expect, it } from "vitest";
import type { AdminTeam } from "@/lib/admin/config";
import { buildAlignmentMapModel } from "./alignment-map";
import type { OkrRecord } from "./types";

const teams: AdminTeam[] = [
  team("software", "Software"),
  team("qa", "QA Team", "Software"),
  team("tpm", "TPM Team", "Software"),
  team("application", "Application Team", "Software"),
  team("hardware", "Hardware")
];

describe("alignment map model", () => {
  it("splits Objectives into the three columns by team level and scope", () => {
    const model = buildAlignmentMapModel([
      record("SW-O1", "Software"),
      record("HW-O1", "Hardware"),
      record("QA-O1", "QA Team", "SW-O1"),
      record("QA-M1", "QA Team", "QA-O1", "member")
    ], teams);

    expect(model.groups.map((group) => group.team)).toEqual(["Software", "Hardware"]);
    expect(model.groups[0].objectives.map((objective) => objective.okrId)).toEqual(["SW-O1"]);
    expect(model.secondLevel.map((objective) => objective.okrId)).toEqual(["QA-O1"]);
    expect(model.memberGroups.map((group) => group.team)).toEqual(["QA Team"]);
    expect(model.memberGroups[0].members.map((member) => member.okrId)).toEqual(["QA-M1"]);
  });

  it("treats a top-level team Objective without a parent as a root, not as unaligned", () => {
    const model = buildAlignmentMapModel([
      record("SW-O1", "Software"),
      record("TPM-O1", "TPM Team")
    ], teams);

    expect(model.groups[0].objectives[0].isRoot).toBe(true);
    expect(model.groups[0].objectives[0].unaligned).toBe(false);
    expect(model.secondLevel[0].unaligned).toBe(true);
    expect(model.metrics.rootCount).toBe(1);
    expect(model.metrics.unalignedCount).toBe(1);
    expect(model.metrics.shouldAlignCount).toBe(1);
  });

  it("folds every member Objective of a team into one card with one edge per distinct parent", () => {
    const model = buildAlignmentMapModel([
      record("SW-O1", "Software"),
      record("QA-O1", "QA Team", "SW-O1"),
      record("QA-M1", "QA Team", "QA-O1", "member"),
      record("QA-M2", "QA Team", "QA-O1", "member"),
      record("QA-M3", "QA Team", "QA-O1", "member")
    ], teams);

    expect(model.memberGroups).toHaveLength(1);
    expect(model.memberGroups[0].members).toHaveLength(3);
    expect(model.edges.map((edge) => edge.id)).toEqual([
      "objective:QA-O1->objective:SW-O1",
      "member-group:QA Team->objective:QA-O1"
    ]);
  });

  it("marks a member group as cross-level when every member aligns outside its own team", () => {
    const model = buildAlignmentMapModel([
      record("SW-O1", "Software"),
      record("APP-M1", "Application Team", "SW-O1", "member"),
      record("APP-M2", "Application Team", "SW-O1", "member")
    ], teams);

    expect(model.memberGroups[0].crossLevel).toBe(true);
    expect(model.memberGroups[0].members.every((member) => member.crossLevel)).toBe(true);
    expect(model.secondLevelNotes).toContainEqual({
      kind: "team-without-objective",
      team: "Application Team",
      memberCount: 2,
      crossLevel: true
    });
  });

  it("counts an unaligned member inside its group without dropping the card", () => {
    const model = buildAlignmentMapModel([
      record("SW-O1", "Software"),
      record("TPM-O1", "TPM Team", "SW-O1"),
      record("TPM-M1", "TPM Team", "TPM-O1", "member"),
      record("TPM-M2", "TPM Team", "", "member")
    ], teams);

    expect(model.memberGroups[0].members).toHaveLength(2);
    expect(model.memberGroups[0].unalignedCount).toBe(1);
    expect(model.memberGroups[0].crossLevel).toBe(false);
    expect(model.metrics.unalignedCount).toBe(1);
  });

  it("aggregates a group band over its whole subtree, not just its root Objectives", () => {
    const model = buildAlignmentMapModel([
      record("SW-O1", "Software", "", "team", "Green", 0.6),
      record("QA-O1", "QA Team", "SW-O1", "team", "Yellow", 0.4),
      record("QA-M1", "QA Team", "QA-O1", "member", "Red", 0.2)
    ], teams);
    const software = model.groups[0];

    expect(software.statusCounts).toEqual({ Green: 1, Yellow: 1, Red: 1 });
    expect(software.memberCount).toBe(1);
    expect(software.averageProgress).toBeCloseTo(0.4);
  });

  it("reports Objectives with no downstream and rolls member counts up the chain", () => {
    const model = buildAlignmentMapModel([
      record("SW-O1", "Software"),
      record("QA-O1", "QA Team", "SW-O1"),
      record("QA-M1", "QA Team", "QA-O1", "member"),
      record("QA-M2", "QA Team", "QA-O1", "member")
    ], teams);

    expect(model.groups[0].objectives[0].alignedChildCount).toBe(1);
    expect(model.groups[0].objectives[0].memberCount).toBe(2);
    expect(model.secondLevel[0].alignedChildCount).toBe(0);
    expect(model.secondLevel[0].memberCount).toBe(2);
  });

  it("names the top-level teams that have no second-level or member OKRs", () => {
    const model = buildAlignmentMapModel([
      record("SW-O1", "Software"),
      record("HW-O1", "Hardware"),
      record("QA-O1", "QA Team", "SW-O1"),
      record("QA-M1", "QA Team", "QA-O1", "member")
    ], teams);

    expect(model.secondLevelNotes).toContainEqual({ kind: "teams-without-children", teams: ["Hardware"] });
    expect(model.memberNote).toEqual({ kind: "teams-without-children", teams: ["Hardware"] });
  });

  it("derives Objective progress from its Key Results when the Objective has no score", () => {
    const objective = { ...record("SW-O1", "Software"), score: null };
    const model = buildAlignmentMapModel([
      objective,
      keyResult("SW-O1-KR1", "SW-O1", "Software", 0.2),
      keyResult("SW-O1-KR2", "SW-O1", "Software", 0.8)
    ], teams);

    expect(model.groups[0].objectives[0].progress).toBeCloseTo(0.5);
    expect(model.groups[0].objectives[0].keyResultCount).toBe(2);
    expect(model.metrics.keyResultCount).toBe(2);
  });

  it("resolves alignment to a Key Result as alignment to its parent Objective", () => {
    const model = buildAlignmentMapModel([
      record("SW-O1", "Software"),
      keyResult("SW-O1-KR1", "SW-O1", "Software", 0.5),
      record("QA-O1", "QA Team", "SW-O1-KR1")
    ], teams);

    expect(model.secondLevel[0].parentNodeId).toBe("objective:SW-O1");
    expect(model.secondLevel[0].unaligned).toBe(false);
  });

  it("labels a group with the resolved owner display name, not the configured owner label", () => {
    const model = buildAlignmentMapModel([record("SW-O1", "Software")], teams, { Software: "Max Zheng" });

    expect(model.groups[0].owner).toBe("Max Zheng");
  });

  it("falls back to the configured owner label when no owner resolves", () => {
    const model = buildAlignmentMapModel([record("SW-O1", "Software")], teams);

    expect(model.groups[0].owner).toBe("Software Lead");
  });
  it("returns an empty model for no records", () => {
    const model = buildAlignmentMapModel([], teams);

    expect(model.groups).toEqual([]);
    expect(model.edges).toEqual([]);
    expect(model.metrics.objectiveCount).toBe(0);
    expect(model.metrics.averageProgress).toBeNull();
  });
});

function team(id: string, name: string, parentTeam = ""): AdminTeam {
  return { id, name, parentTeam, owner: `${name} Lead`, color: "blue", enabled: true };
}

function record(
  okrId: string,
  teamName: string,
  alignedToId = "",
  objectiveScope: OkrRecord["objective_scope"] = "team",
  confidence: OkrRecord["confidence"] = "Yellow",
  score: number | null = 0.3
): OkrRecord {
  return {
    okr_id: okrId,
    parent_id: "",
    aligned_to_id: alignedToId,
    objective_scope: objectiveScope,
    level: "Team",
    team: teamName,
    objective: `${okrId} objective`,
    kr: "",
    type: "Committed",
    owner: objectiveScope === "member" ? `${okrId} owner` : `${teamName} Lead`,
    baseline: "",
    target: "",
    actual: "",
    score,
    confidence,
    dependencies: "",
    risks: "",
    decisions_needed: "",
    source_doc_url: "",
    last_update: "2026-08-11"
  };
}

function keyResult(okrId: string, parentId: string, teamName: string, score: number | null): OkrRecord {
  return { ...record(okrId, teamName), parent_id: parentId, kr: `${okrId} key result`, score };
}

import { describe, expect, it } from "vitest";
import { buildOkrTree, findOkrLineage, getOkrStats } from "./tree";
import type { OkrRecord } from "./types";

const records: OkrRecord[] = [
  record("ENG-O1", "", "Engineering", "Engineering"),
  record("ENG-O1-KR1", "ENG-O1", "Engineering", "Engineering"),
  record("SW-KR1", "ENG-O1-KR1", "Team", "Software")
];

describe("OKR tree helpers", () => {
  it("builds parent-child trees", () => {
    const tree = buildOkrTree(records);
    expect(tree).toHaveLength(1);
    expect(tree[0].children[0].children[0].okr_id).toBe("SW-KR1");
  });

  it("finds lineage", () => {
    const lineage = findOkrLineage(records, "SW-KR1");
    expect(lineage?.ancestors.map((item) => item.okr_id)).toEqual(["ENG-O1", "ENG-O1-KR1"]);
  });

  it("computes stats", () => {
    const stats = getOkrStats(records);
    expect(stats.totalRecords).toBe(3);
    expect(stats.teamRecords).toBe(1);
    expect(stats.yellowCount).toBe(3);
  });
});

function record(
  okr_id: string,
  parent_id: string,
  level: OkrRecord["level"],
  team: string
): OkrRecord {
  return {
    okr_id,
    parent_id,
    level,
    team,
    objective: "Objective",
    kr: parent_id ? "KR" : "",
    type: "Committed",
    owner: "Owner",
    baseline: "Base",
    target: "Target",
    actual: "",
    score: 0.4,
    confidence: "Yellow",
    dependencies: "",
    risks: "Risk",
    decisions_needed: "",
    source_doc_url: "https://example.com",
    last_update: "2026-06-10"
  };
}

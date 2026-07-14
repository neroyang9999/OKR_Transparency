import { describe, expect, it } from "vitest";
import { getOkrQualityStats, validateOkrGraph, validateOkrRecordQuality } from "./graph-validation";
import type { OkrRecord } from "./types";

describe("OKR graph validation", () => {
  it("rejects missing parents and cycles", () => {
    const missing = validateOkrGraph([record("O1", "MISSING")]);
    expect(missing.errors).toContain("O1: parent MISSING does not exist");

    const cyclic = validateOkrGraph([record("O1", "O2"), record("O2", "O1")]);
    expect(cyclic.errors.some((error) => error.includes("cycle"))).toBe(true);
  });

  it("rejects duplicate ids and root KRs", () => {
    const result = validateOkrGraph([
      record("O1", ""),
      record("O1", ""),
      { ...record("KR1", ""), kr: "Measure result" }
    ]);

    expect(result.errors).toEqual(expect.arrayContaining([
      "O1: duplicate OKR id",
      "KR1: KR must belong to an Objective"
    ]));
  });

  it("keeps structural and content validation separate", () => {
    const incomplete = { ...record("KR1", "O1"), kr: "Measure result", baseline: "", target: "", confidence: "Yellow" as const };
    expect(validateOkrGraph([record("O1", ""), incomplete]).errors).toEqual([]);
    expect(validateOkrRecordQuality([incomplete]).errors).toEqual(expect.arrayContaining([
      "KR1: baseline is required",
      "KR1: target is required",
      "KR1: Yellow/Red KR requires a risk or decision needed"
    ]));
    expect(getOkrQualityStats([incomplete]).missingMetricCount).toBe(1);
  });
});

function record(okr_id: string, parent_id: string): OkrRecord {
  return {
    okr_id,
    parent_id,
    level: "Team",
    team: "Software",
    objective: "Objective",
    kr: "",
    type: "Committed",
    owner: "Owner",
    baseline: "Baseline",
    target: "Target",
    actual: "",
    score: 0.4,
    confidence: "Green",
    dependencies: "",
    risks: "",
    decisions_needed: "",
    source_doc_url: "page-edit",
    last_update: new Date().toISOString().slice(0, 10)
  };
}

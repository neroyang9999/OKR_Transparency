import { describe, expect, it } from "vitest";
import { searchOkrs } from "./search";
import type { OkrRecord } from "./types";

describe("searchOkrs", () => {
  const records: OkrRecord[] = [
    record("SW-KR1", "Software", "Yellow", "Committed", "release quality"),
    record("QA-KR1", "QA", "Green", "Aspirational", "automation")
  ];

  it("filters by query, team, confidence and type", () => {
    const results = searchOkrs(records, {
      q: "release",
      team: "Software",
      confidence: "Yellow",
      type: "Committed"
    });
    expect(results.map((record) => record.okr_id)).toEqual(["SW-KR1"]);
  });
});

function record(
  okr_id: string,
  team: string,
  confidence: OkrRecord["confidence"],
  type: OkrRecord["type"],
  kr: string
): OkrRecord {
  return {
    okr_id,
    parent_id: "ENG-O1",
    level: "Team",
    team,
    objective: "Objective",
    kr,
    type,
    owner: "Owner",
    baseline: "",
    target: "",
    actual: "",
    score: null,
    confidence,
    dependencies: "",
    risks: "",
    decisions_needed: "",
    source_doc_url: "https://example.com",
    last_update: "2026-06-10"
  };
}

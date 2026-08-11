import { describe, expect, it } from "vitest";
import { buildPublicationCandidate } from "./publication-candidate";
import { validateOkrGraph } from "./graph-validation";
import type { OkrRecord } from "./types";

describe("publication candidate", () => {
  it("builds a valid graph when teams are filled again from an empty dataset", () => {
    const software = buildPublicationCandidate([], [objective("SW-O1", "Software"), kr("SW-O1-KR1", "SW-O1", "Software")], { team: "Software" });
    const qa = buildPublicationCandidate(software.records, [
      { ...objective("QA-O1", "QA Team"), aligned_to_id: "SW-O1-KR1" },
      kr("QA-O1-KR1", "QA-O1", "QA Team")
    ], { team: "QA Team" });

    expect(validateOkrGraph(qa.records).errors).toEqual([]);
    expect(qa.records.find((record) => record.okr_id === "QA-O1")?.aligned_to_id).toBe("SW-O1-KR1");
  });

  it("clears child-team alignment when its target is removed during a parent-team refill", () => {
    const current = [
      objective("SW-O1", "Software"),
      kr("SW-O1-KR1", "SW-O1", "Software"),
      { ...objective("QA-O1", "QA Team"), aligned_to_id: "SW-O1-KR1" },
      kr("QA-O1-KR1", "QA-O1", "QA Team")
    ];
    const next = buildPublicationCandidate(current, [objective("SW-O2", "Software"), kr("SW-O2-KR1", "SW-O2", "Software")], { team: "Software" });

    expect(validateOkrGraph(next.records).errors).toEqual([]);
    expect(next.records.find((record) => record.okr_id === "QA-O1")).not.toHaveProperty("aligned_to_id");
    expect(next.warnings).toContain("QA-O1: removed missing alignment target SW-O1-KR1");
  });

  it("replaces only the selected owner scope without orphaning the other owner's KRs", () => {
    const current = [
      { ...objective("TPM-A-O1", "TPM Team"), owner: "Owner A" },
      { ...kr("TPM-A-O1-KR1", "TPM-A-O1", "TPM Team"), owner: "Owner A" },
      { ...objective("TPM-B-O1", "TPM Team"), owner: "Owner B" },
      { ...kr("TPM-B-O1-KR1", "TPM-B-O1", "TPM Team"), owner: "Owner B" }
    ];
    const next = buildPublicationCandidate(current, [
      { ...objective("TPM-A-O2", "TPM Team"), owner: "Owner A" },
      { ...kr("TPM-A-O2-KR1", "TPM-A-O2", "TPM Team"), owner: "Owner A" }
    ], { team: "TPM Team", ownerAliases: ["Owner A"] });

    expect(next.records.map((record) => record.okr_id)).toEqual(["TPM-B-O1", "TPM-B-O1-KR1", "TPM-A-O2", "TPM-A-O2-KR1"]);
    expect(validateOkrGraph(next.records).errors).toEqual([]);
  });

  it("refills a member scope without deleting a same-owner team Objective", () => {
    const current = [
      { ...objective("TPM-TEAM-O1", "TPM Team"), owner: "TPM Lead", objective_scope: "team" as const },
      { ...kr("TPM-TEAM-O1-KR1", "TPM-TEAM-O1", "TPM Team"), owner: "TPM Lead", objective_scope: "team" as const },
      { ...objective("TPM-MEMBER-O1", "TPM Team"), owner: "TPM Lead", objective_scope: "member" as const, owner_email: "lead@unitxlabs.com" },
      { ...kr("TPM-MEMBER-O1-KR1", "TPM-MEMBER-O1", "TPM Team"), owner: "TPM Lead", objective_scope: "member" as const, owner_email: "lead@unitxlabs.com" }
    ];
    const published = [
      { ...objective("TPM-MEMBER-O2", "TPM Team"), owner: "TPM Lead", objective_scope: "member" as const, owner_email: "lead@unitxlabs.com" },
      { ...kr("TPM-MEMBER-O2-KR1", "TPM-MEMBER-O2", "TPM Team"), owner: "TPM Lead", objective_scope: "member" as const, owner_email: "lead@unitxlabs.com" }
    ];
    const next = buildPublicationCandidate(current, published, {
      team: "TPM Team",
      objectiveScope: "member",
      ownerEmail: "lead@unitxlabs.com"
    });

    expect(next.records.map((record) => record.okr_id)).toEqual([
      "TPM-TEAM-O1",
      "TPM-TEAM-O1-KR1",
      "TPM-MEMBER-O2",
      "TPM-MEMBER-O2-KR1"
    ]);
  });
});

function objective(okr_id: string, team: string): OkrRecord {
  return record(okr_id, "", team, "");
}

function kr(okr_id: string, parent_id: string, team: string): OkrRecord {
  return record(okr_id, parent_id, team, "Result");
}

function record(okr_id: string, parent_id: string, team: string, krText: string): OkrRecord {
  return {
    okr_id,
    parent_id,
    level: "Team",
    team,
    objective: "Objective",
    kr: krText,
    type: "Committed",
    owner: "Owner",
    baseline: "",
    target: "",
    actual: "",
    score: null,
    confidence: "Green",
    dependencies: "",
    risks: "",
    decisions_needed: "",
    source_doc_url: "page-edit",
    last_update: "2026-08-11"
  };
}

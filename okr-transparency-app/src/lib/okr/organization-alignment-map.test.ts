import { describe, expect, it } from "vitest";
import type { AdminTeam } from "@/lib/admin/config";
import { buildAlignmentViewModel } from "./alignment-view";
import { buildOrganizationAlignmentMap, type OrganizationMapNode } from "./organization-alignment-map";
import type { OkrRecord } from "./types";

const teams: AdminTeam[] = [
  team("software", "Software"),
  team("application", "Application Team", "Software"),
  team("qa", "QA Team", "Software"),
  team("tpm", "TPM Team", "Software"),
  team("hardware", "Hardware")
];

describe("organization alignment map", () => {
  it("keeps an unaligned TPM Objective under Engineering > Software > TPM Team", () => {
    const map = buildMap([
      record("SW-O1", "Software"),
      record("TPM-O1", "TPM Team")
    ]);

    expect(child(map.roots[0], "team:Software").id).toBe("team:Software");
    expect(child(child(map.roots[0], "team:Software"), "team:TPM Team").children.map((node) => node.id)).toEqual([
      "objective:TPM-O1"
    ]);
    expect(map.roots[0].children.map((node) => node.id)).not.toContain("team:TPM Team");
    expect(map.alignmentEdges).toEqual([]);
  });

  it("adds and removes only the alignment edge without moving the TPM Objective", () => {
    const unaligned = buildMap([
      record("SW-O1", "Software"),
      record("TPM-O1", "TPM Team")
    ]);
    const aligned = buildMap([
      record("SW-O1", "Software"),
      record("TPM-O1", "TPM Team", "SW-O1")
    ]);

    expect(pathTo(unaligned.roots[0], "objective:TPM-O1")).toEqual([
      "engineering",
      "team:Software",
      "team:TPM Team",
      "objective:TPM-O1"
    ]);
    expect(pathTo(aligned.roots[0], "objective:TPM-O1")).toEqual([
      "engineering",
      "team:Software",
      "team:TPM Team",
      "objective:TPM-O1"
    ]);
    expect(aligned.alignmentEdges).toEqual([
      { fromId: "objective:TPM-O1", toId: "objective:SW-O1" }
    ]);
    expect(child(child(aligned.roots[0], "team:Software"), "team:TPM Team").visualIndent).toBe(1);
  });

  it("applies the same organization rule to every Software child team", () => {
    const map = buildMap([
      record("SW-O1", "Software"),
      record("APP-O1", "Application Team"),
      record("QA-O1", "QA Team"),
      record("TPM-O1", "TPM Team")
    ]);
    const software = child(map.roots[0], "team:Software");

    expect(software.children.filter((node) => node.kind === "team").map((node) => node.id)).toEqual([
      "team:Application Team",
      "team:QA Team",
      "team:TPM Team"
    ]);
  });

  it("keeps top-level teams such as Hardware directly under Engineering", () => {
    const map = buildMap([
      record("SW-O1", "Software"),
      record("HW-O1", "Hardware")
    ]);

    expect(map.roots[0].children.map((node) => node.id)).toEqual(["team:Software", "team:Hardware"]);
  });

  it("places member Objectives after their team Objective and collapses them by default", () => {
    const map = buildMap([
      record("SW-O1", "Software"),
      record("TPM-O1", "TPM Team", "SW-O1"),
      record("TPM-M1-O1", "TPM Team", "TPM-O1", "member", "member@unitxlabs.com")
    ]);
    const teamObjective = child(child(child(map.roots[0], "team:Software"), "team:TPM Team"), "objective:TPM-O1");

    expect(teamObjective.children.map((node) => node.id)).toEqual(["objective:TPM-M1-O1"]);
    expect(map.defaultCollapsedIds).toContain("objective:TPM-O1");
  });

  it("keeps an unaligned member Objective in a collapsed member group", () => {
    const map = buildMap([
      record("SW-O1", "Software"),
      record("TPM-O1", "TPM Team", "SW-O1"),
      record("TPM-M1-O1", "TPM Team", "", "member", "member@unitxlabs.com")
    ]);
    const tpm = child(child(map.roots[0], "team:Software"), "team:TPM Team");
    const memberGroup = child(tpm, "member-group:TPM Team");

    expect(memberGroup.children.map((node) => node.id)).toEqual(["objective:TPM-M1-O1"]);
    expect(map.defaultCollapsedIds).toContain("member-group:TPM Team");
  });
});

function buildMap(records: OkrRecord[]) {
  return buildOrganizationAlignmentMap(buildAlignmentViewModel(records).roots, teams, "zh");
}

function child(node: OrganizationMapNode, id: string) {
  const result = node.children.find((candidate) => candidate.id === id);
  if (!result) throw new Error(`${id} is not a child of ${node.id}`);
  return result;
}

function pathTo(node: OrganizationMapNode, id: string): string[] | null {
  if (node.id === id) return [node.id];
  for (const candidate of node.children) {
    const path = pathTo(candidate, id);
    if (path) return [node.id, ...path];
  }
  return null;
}

function team(id: string, name: string, parentTeam = ""): AdminTeam {
  return { id, name, parentTeam, owner: `${name} Lead`, color: "blue", enabled: true };
}

function record(
  okrId: string,
  teamName: string,
  alignedToId = "",
  objectiveScope: OkrRecord["objective_scope"] = "team",
  ownerEmail = ""
): OkrRecord {
  return {
    okr_id: okrId,
    parent_id: "",
    aligned_to_id: alignedToId,
    objective_scope: objectiveScope,
    owner_email: ownerEmail || undefined,
    level: "Team",
    team: teamName,
    objective: `${teamName} objective`,
    kr: "",
    type: "Committed",
    owner: `${teamName} Lead`,
    baseline: "",
    target: "",
    actual: "",
    score: 0.3,
    confidence: "Yellow",
    dependencies: "",
    risks: "",
    decisions_needed: "",
    source_doc_url: "",
    last_update: "2026-08-11"
  };
}

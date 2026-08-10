import { describe, expect, it } from "vitest";
import type { AdminTeam } from "@/lib/admin/config";
import type { OkrRecord } from "./types";
import { buildMapTeamScope } from "./map-team-scope";

const teams: AdminTeam[] = [
  team("software", "Software"),
  team("application", "Application Team", "Software"),
  team("system", "System Team", "Software"),
  team("qa", "QA Team", "Software"),
  team("infra", "Infra Team", "Software"),
  team("algorithm", "Algorithm Team", "Software"),
  team("tpm", "TPM Team", "Software"),
  team("hardware", "Hardware"),
  team("advanced", "Advanced Technology"),
  team("ap-ops", "AP OPS")
];

const records = [
  record("Software"),
  record("System Team"),
  record("QA Team"),
  record("Hardware"),
  record("Advanced Technology"),
  record("AP OPS"),
  record("Optics Team"),
  record("QA"),
  record("Service")
];

describe("map team scope", () => {
  it("uses enabled admin teams for the top-level navigation and removes obsolete teams", () => {
    const scope = buildMapTeamScope(teams, records);

    expect(scope.topLevelTeams.map((item) => item.name)).toEqual([
      "Software",
      "Hardware",
      "Advanced Technology",
      "AP OPS"
    ]);
    expect(scope.records.map((item) => item.team)).toEqual([
      "Software",
      "System Team",
      "QA Team",
      "Hardware",
      "Advanced Technology",
      "AP OPS"
    ]);
  });

  it("shows Software and all of its child teams in the Software overview", () => {
    const scope = buildMapTeamScope(teams, records, "Software");

    expect(scope.selectedGroup).toBe("Software");
    expect(scope.childTeams.map((item) => item.name)).toEqual([
      "Application Team",
      "System Team",
      "QA Team",
      "Infra Team",
      "Algorithm Team",
      "TPM Team"
    ]);
    expect(scope.records.map((item) => item.team)).toEqual(["Software", "System Team", "QA Team"]);
    expect(scope.focusTeam).toBeUndefined();
  });

  it("focuses a Software child team while retaining its Software parent context", () => {
    const scope = buildMapTeamScope(teams, records, "System Team");

    expect(scope.selectedGroup).toBe("Software");
    expect(scope.selectedTeam).toBe("System Team");
    expect(scope.focusTeam).toBe("System Team");
    expect(scope.records.map((item) => item.team)).toEqual(["Software", "System Team"]);
  });

  it("ignores an obsolete team selection", () => {
    const scope = buildMapTeamScope(teams, records, "Optics Team");

    expect(scope.selectedTeam).toBeUndefined();
    expect(scope.records.some((item) => item.team === "Optics Team")).toBe(false);
  });
});

function team(id: string, name: string, parentTeam = ""): AdminTeam {
  return { id, name, parentTeam, owner: `${name} Leader`, color: "#2563eb", enabled: true };
}

function record(teamName: string): OkrRecord {
  return {
    okr_id: `${teamName}-O1`,
    parent_id: "",
    level: "Team",
    team: teamName,
    objective: `${teamName} objective`,
    kr: "",
    type: "Committed",
    owner: `${teamName} Leader`,
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
  };
}

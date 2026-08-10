import { describe, expect, it } from "vitest";
import { normalizeAdminConfig } from "./config";
import { deleteAdminTeam, teamDeleteBlockReason } from "./team-delete";

describe("admin team deletion", () => {
  it("removes a leaf team and its member assignments without deleting other configuration", () => {
    const base = normalizeAdminConfig({});
    const config = {
      ...base,
      teams: [...base.teams, { id: "temporary", name: "Temporary Team", owner: "", parentTeam: "Software", color: "slate", enabled: false }],
      users: base.users.map((user, index) => index === 0 ? { ...user, teams: [...user.teams, "Temporary Team"], leaderTeams: ["Temporary Team"] } : user)
    };

    const next = deleteAdminTeam(config, "temporary");

    expect(next.teams.some((team) => team.id === "temporary")).toBe(false);
    expect(next.users[0].teams).not.toContain("Temporary Team");
    expect(next.users[0].leaderTeams).not.toContain("Temporary Team");
    expect(next.periods).toEqual(config.periods);
  });

  it("blocks deleting the default team or a team with children", () => {
    const config = normalizeAdminConfig({});
    expect(teamDeleteBlockReason(config, config.teams.find((team) => team.name === config.defaultTeam)!.id)).toContain("默认团队");
    expect(teamDeleteBlockReason({ ...config, defaultTeam: "Hardware" }, config.teams.find((team) => team.name === "Software")!.id)).toContain("下级团队");
  });
});

import { describe, expect, it } from "vitest";
import type { AdminConfig } from "./admin/config";
import { accessFromAdminUser } from "./admin/permissions";
import { buildMyKrEntryTeams } from "./action-center-entry";

const config: AdminConfig = {
  version: 2,
  revision: 1,
  defaultPeriodId: "2026-q3",
  periods: [{ id: "2026-q3", label: "Q3", labelEn: "Q3", shortLabel: "Q3", status: "active" }],
  defaultTeam: "Software",
  teams: [
    { id: "software", name: "Software", owner: "Lead", parentTeam: "", color: "blue", enabled: true },
    { id: "app", name: "Application", owner: "App Lead", parentTeam: "Software", color: "blue", enabled: true },
    { id: "hardware", name: "Hardware", owner: "HW Lead", parentTeam: "", color: "green", enabled: true },
    { id: "disabled", name: "Disabled", owner: "Lead", parentTeam: "", color: "gray", enabled: false }
  ],
  users: [],
  settings: { defaultLanguage: "zh", showEditLinks: true, allowProgressNotes: true, backupExportEnabled: true }
};

describe("my KR entry teams", () => {
  it("shows a regular user only their assigned team as personal scope", () => {
    const access = accessFromAdminUser({
      email: "member@company.com",
      displayName: "Member",
      role: "user",
      teams: ["Application"],
      ownerAliases: ["Member"],
      enabled: true
    });

    expect(buildMyKrEntryTeams(config, access)).toEqual([
      { name: "Application", parentTeam: "Software", scope: "personal" }
    ]);
  });

  it("shows a team leader their team first and descendants as team scope", () => {
    const access = accessFromAdminUser({
      email: "lead@company.com",
      displayName: "Lead",
      role: "team_leader",
      teams: ["Software"],
      ownerAliases: ["Lead"],
      enabled: true
    });

    expect(buildMyKrEntryTeams(config, access)).toEqual([
      { name: "Software", parentTeam: "", scope: "personal" },
      { name: "Application", parentTeam: "Software", scope: "team" }
    ]);
  });

  it("shows all enabled teams to a super admin", () => {
    const access = accessFromAdminUser({
      email: "admin@company.com",
      displayName: "Admin",
      role: "super_admin",
      teams: [],
      ownerAliases: ["Admin"],
      enabled: true
    });

    expect(buildMyKrEntryTeams(config, access).map((team) => team.name)).toEqual(["Application", "Hardware", "Software"]);
  });
});

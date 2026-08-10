import { describe, expect, it } from "vitest";
import { normalizeAdminConfig, summarizeAdminConfigChanges, validateAdminConfig, validateAdminConfigUpdate } from "./config";

describe("admin config v2", () => {
  it("migrates legacy period flags, colors, permissions, and aliases without writing files", () => {
    const config = normalizeAdminConfig({
      version: 1,
      defaultPeriodId: "2026-q3",
      periods: [
        { id: "2026-q3", label: "Q3", labelEn: "Q3", shortLabel: "Q3", editable: true, locked: false },
        { id: "2026-q2", label: "Q2", labelEn: "Q2", shortLabel: "Q2", editable: false, locked: true }
      ],
      defaultTeam: "Software",
      teams: [{ name: "Software", owner: "Lead", parentTeam: "", color: "bg-blue-500", enabled: true }],
      permissions: [{ team: "Software" }],
      users: [{ email: "ADMIN@EXAMPLE.COM", displayName: "Admin", role: "super_admin", teams: [], ownerAliases: [], enabled: true }],
      settings: { defaultLanguage: "zh", showEditLinks: true, allowProgressNotes: true, backupExportEnabled: true }
    });

    expect(config).toMatchObject({ version: 2, revision: 1, defaultPeriodId: "2026-q3" });
    expect(config.periods.map((period) => period.status)).toEqual(["active", "locked"]);
    expect(config.teams[0]).toMatchObject({ id: "software", color: "blue" });
    expect(config.users[0].ownerAliases).toEqual(["Admin", "admin@example.com"]);
    expect(config).not.toHaveProperty("permissions");
  });

  it("rejects ambiguous active periods and fewer than two valid administrators", () => {
    const config = normalizeAdminConfig({});
    const invalid = {
      ...config,
      periods: config.periods.map((period) => ({ ...period, status: "active" as const })),
      users: config.users.map((user) => ({ ...user, enabled: false }))
    };
    expect(validateAdminConfig(invalid)).toEqual(expect.arrayContaining([
      "Exactly one active period is required",
      "At least two enabled system administrators with valid email addresses are required"
    ]));
  });

  it("maps legacy System and Infra team names without changing user assignments", () => {
    const config = normalizeAdminConfig({
      teams: [
        { id: "integration-team", name: "Integration Team", owner: "Integration Lead", parentTeam: "Software", enabled: true },
        { id: "platform-team", name: "Platform Team", owner: "Platform Lead", parentTeam: "Software", enabled: true }
      ],
      users: [{ email: "lead@example.com", displayName: "Lead", role: "team_leader", teams: ["Integration Team", "Platform Team"], ownerAliases: ["Integration Lead", "Platform Lead"], enabled: true }]
    });

    expect(config.teams.map((team) => [team.id, team.name, team.owner])).toEqual([
      ["integration-team", "System Team", "System Leader"],
      ["platform-team", "Infra Team", "Infra Leader"]
    ]);
    expect(config.users[0].teams).toEqual(["System Team", "Infra Team"]);
    expect(config.users[0].ownerAliases).toEqual(expect.arrayContaining(["System Leader", "Infra Leader"]));
  });

  it("prevents the current administrator from removing or demoting their own account", () => {
    const config = normalizeAdminConfig({});
    const next = {
      ...config,
      users: [
        ...config.users.map((user) => user.email === "admin@company.com" ? { ...user, role: "user" as const } : user),
        { email: "admin2@company.com", displayName: "Admin 2", role: "super_admin" as const, teams: [], ownerAliases: ["Admin 2"], enabled: true },
        { email: "admin3@company.com", displayName: "Admin 3", role: "super_admin" as const, teams: [], ownerAliases: ["Admin 3"], enabled: true }
      ]
    };

    expect(validateAdminConfigUpdate(next, "admin@company.com")).toContain(
      "You cannot remove, disable, or demote your own system administrator account"
    );
  });

  it("summarizes only the configuration domains that changed", () => {
    const config = normalizeAdminConfig({});
    const next = { ...config, settings: { ...config.settings, showEditLinks: false } };
    expect(summarizeAdminConfigChanges(config, next)).toEqual(["system settings"]);
  });
});

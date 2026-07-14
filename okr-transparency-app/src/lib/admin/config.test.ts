import { describe, expect, it } from "vitest";
import { normalizeAdminConfig, summarizeAdminConfigChanges, validateAdminConfig } from "./config";

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

  it("rejects ambiguous active periods and removal of the last administrator", () => {
    const config = normalizeAdminConfig({});
    const invalid = {
      ...config,
      periods: config.periods.map((period) => ({ ...period, status: "active" as const })),
      users: config.users.map((user) => ({ ...user, enabled: false }))
    };
    expect(validateAdminConfig(invalid)).toEqual(expect.arrayContaining([
      "Exactly one active period is required",
      "At least one enabled system administrator is required"
    ]));
  });

  it("summarizes only the configuration domains that changed", () => {
    const config = normalizeAdminConfig({});
    const next = { ...config, settings: { ...config.settings, showEditLinks: false } };
    expect(summarizeAdminConfigChanges(config, next)).toEqual(["system settings"]);
  });
});

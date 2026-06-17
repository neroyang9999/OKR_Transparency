import { describe, expect, it } from "vitest";
import type { AdminConfig } from "./config";
import { authorizeDraftChange, authorizePublish, getAccessForSessionUser, getTeamEditPolicy } from "./permissions";
import type { OkrDraft } from "../okr/edit-types";

const config: AdminConfig = {
  version: 1,
  defaultPeriodId: "2026-q3",
  periods: [
    { id: "2026-q3", label: "Q3", labelEn: "Q3", shortLabel: "Q3", editable: true, locked: false },
    { id: "2026-q2", label: "Q2", labelEn: "Q2", shortLabel: "Q2", editable: false, locked: true }
  ],
  defaultTeam: "Software",
  teams: [
    { name: "Software", owner: "Software Lead", parentTeam: "", color: "bg-blue-500", enabled: true },
    { name: "Hardware", owner: "Hardware Lead", parentTeam: "", color: "bg-green-500", enabled: true }
  ],
  permissions: [],
  users: [
    { email: "admin@company.com", displayName: "Admin", role: "super_admin", teams: [], ownerAliases: ["Admin"], enabled: true },
    { email: "lead@company.com", displayName: "Software Lead", role: "team_leader", teams: ["Software"], ownerAliases: ["Software Lead"], enabled: true },
    { email: "user@company.com", displayName: "Member", role: "user", teams: ["Software"], ownerAliases: ["Member"], enabled: true },
    { email: "disabled@company.com", displayName: "Disabled", role: "super_admin", teams: [], ownerAliases: ["Disabled"], enabled: false }
  ],
  settings: {
    defaultLanguage: "zh",
    showEditLinks: true,
    allowProgressNotes: true,
    backupExportEnabled: true
  }
};

const draft: OkrDraft = {
  version: 1,
  team: "Software",
  periodId: "2026-q3",
  updatedAt: "2026-06-17T00:00:00.000Z",
  objectives: [
    {
      id: "SW-O1",
      periodId: "2026-q3",
      team: "Software",
      title: "Improve quality",
      owner: "Software Lead",
      type: "Committed",
      confidence: "Yellow",
      weight: 100,
      progress: null,
      status: "draft",
      keyResults: [
        {
          id: "SW-O1-KR1",
          title: "Member owned KR",
          owner: "Member",
          baseline: "",
          target: "",
          actual: "",
          progress: 20,
          confidence: "Yellow",
          weight: 50,
          risks: "",
          decisionsNeeded: ""
        },
        {
          id: "SW-O1-KR2",
          title: "Lead owned KR",
          owner: "Software Lead",
          baseline: "",
          target: "",
          actual: "",
          progress: 40,
          confidence: "Yellow",
          weight: 50,
          risks: "",
          decisionsNeeded: ""
        }
      ]
    }
  ]
};

describe("role-based OKR permissions", () => {
  it("resolves configured Google users case-insensitively and rejects disabled users", () => {
    expect(getAccessForSessionUser(config, { email: "ADMIN@COMPANY.COM", name: "Admin" })?.role).toBe("super_admin");
    expect(getAccessForSessionUser(config, { email: "disabled@company.com", name: "Disabled" })).toBeNull();
  });

  it("allows super admins to edit and publish every team", () => {
    const access = getAccessForSessionUser(config, { email: "admin@company.com", name: "Admin" });
    expect(getTeamEditPolicy(config, "Hardware", access)).toMatchObject({ canEdit: true, canPublish: true });
    expect(authorizePublish(config, access, "Hardware", "2026-q3")).toMatchObject({ ok: true });
  });

  it("allows team leaders to publish their team but not other teams", () => {
    const access = getAccessForSessionUser(config, { email: "lead@company.com", name: "Software Lead" });
    expect(authorizePublish(config, access, "Software", "2026-q3")).toMatchObject({ ok: true });
    expect(authorizePublish(config, access, "Hardware", "2026-q3")).toMatchObject({ ok: false });
  });

  it("prevents every role from editing locked periods", () => {
    const access = getAccessForSessionUser(config, { email: "admin@company.com", name: "Admin" });
    expect(authorizePublish(config, access, "Software", "2026-q2")).toMatchObject({ ok: false, error: "Period is locked" });
  });

  it("allows users to edit only KR records matching their owner aliases", () => {
    const access = getAccessForSessionUser(config, { email: "user@company.com", name: "Member" });
    const allowedDraft = {
      ...draft,
      objectives: draft.objectives.map((objective) => ({
        ...objective,
        keyResults: objective.keyResults.map((kr) =>
          kr.owner === "Member" ? { ...kr, progress: 80 } : kr
        )
      }))
    };
    const deniedDraft = {
      ...draft,
      objectives: draft.objectives.map((objective) => ({
        ...objective,
        keyResults: objective.keyResults.map((kr) =>
          kr.owner === "Software Lead" ? { ...kr, progress: 80 } : kr
        )
      }))
    };

    expect(authorizeDraftChange(config, access, draft, allowedDraft)).toMatchObject({ ok: true });
    expect(authorizeDraftChange(config, access, draft, deniedDraft)).toMatchObject({ ok: false });
  });
});

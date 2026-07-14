import { expect, it } from "vitest";
import { diffVersionRecords, getAdminRuntimeSummary } from "./dashboard";
import type { AdminConfig } from "./config";
import type { OkrRecord } from "../okr/types";

const config: AdminConfig = {
  version: 2,
  revision: 1,
  defaultPeriodId: "2026-q3",
  periods: [{ id: "2026-q3", label: "Q3", labelEn: "Q3", shortLabel: "Q3", status: "active" }],
  defaultTeam: "Software",
  teams: [
    { id: "software", name: "Software", owner: "Lead", parentTeam: "", color: "blue", enabled: true },
    { id: "qa", name: "QA", owner: "QA Lead", parentTeam: "Software", color: "emerald", enabled: true }
  ],
  users: [{ email: "admin@example.com", displayName: "Admin", role: "super_admin", teams: [], ownerAliases: ["Admin"], enabled: true }],
  settings: { defaultLanguage: "zh", showEditLinks: true, allowProgressNotes: true, backupExportEnabled: true }
};

const objective: OkrRecord = {
  okr_id: "SW-O1", parent_id: "", level: "Team", team: "Software", objective: "Quality", kr: "", type: "Committed", owner: "Lead",
  baseline: "", target: "", actual: "", score: null, confidence: "Green", dependencies: "", risks: "", decisions_needed: "", source_doc_url: "", last_update: "2026-07-14"
};

it("turns missing operational state into actionable attention items", () => {
  const summary = getAdminRuntimeSummary(config, [], [objective]);
  expect(summary.publishedTeamCount).toBe(1);
  expect(summary.attention.map((item) => item.id)).toEqual(expect.arrayContaining(["single-admin", "unpublished-teams"]));
});

it("describes the impact of restoring a version", () => {
  const current = [{ ...objective, owner: "Current Lead" }, { ...objective, okr_id: "SW-O2", objective: "Remove me" }];
  const target = [{ ...objective, owner: "Previous Lead" }, { ...objective, okr_id: "SW-O3", objective: "Restore me" }];
  const diff = diffVersionRecords(current, target);
  expect(diff).toMatchObject({ changeCount: 1, restoreCount: 1, removeCount: 1 });
  expect(diff.changes.find((change) => change.id === "SW-O1")?.fields).toContain("owner");
});

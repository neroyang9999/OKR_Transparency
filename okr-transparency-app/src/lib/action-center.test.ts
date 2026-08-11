import { describe, expect, it } from "vitest";
import type { AdminConfig } from "./admin/config";
import { accessFromAdminUser } from "./admin/permissions";
import { buildActionCenter } from "./action-center";
import type { OkrDraft } from "./okr/edit-types";
import type { OkrRecord } from "./okr/types";

const config: AdminConfig = {
  version: 2,
  revision: 1,
  defaultPeriodId: "2026-q3",
  periods: [{ id: "2026-q3", label: "Q3", labelEn: "Q3", shortLabel: "Q3", status: "active" }],
  defaultTeam: "Software",
  teams: [
    { id: "software", name: "Software", owner: "Lead", parentTeam: "", color: "blue", enabled: true },
    { id: "app", name: "Application", owner: "App Lead", parentTeam: "Software", color: "blue", enabled: true },
    { id: "hardware", name: "Hardware", owner: "HW Lead", parentTeam: "", color: "green", enabled: true }
  ],
  users: [
    { email: "lead@company.com", displayName: "Lead", role: "team_leader", teams: ["Software"], ownerAliases: ["Lead"], enabled: true },
    { email: "member@company.com", displayName: "Member", role: "user", teams: ["Software"], ownerAliases: ["Member"], enabled: true }
  ],
  settings: { defaultLanguage: "zh", showEditLinks: true, allowProgressNotes: true, backupExportEnabled: true }
};

const records: OkrRecord[] = [
  kr("SW-KR1", "Software", "Member", "Red", "2026-07-01", "Blocked", "Need decision"),
  kr("SW-KR2", "Software", "Member", "Green", "2026-07-12"),
  kr("SW-KR3", "Software", "Other", "Yellow", "2026-07-01")
];

describe("action center", () => {
  it("shows only owned KRs and derives stale and attention lists", () => {
    const access = accessFromAdminUser(config.users[1]);
    const result = buildActionCenter({
      config,
      access,
      periodId: "2026-q3",
      records,
      progressNotes: [],
      drafts: [],
      now: new Date("2026-07-14T12:00:00.000Z")
    });

    expect(result.ownedKrs.map((item) => item.record.okr_id)).toEqual(["SW-KR1", "SW-KR2"]);
    expect(result.staleKrs.map((item) => item.record.okr_id)).toEqual(["SW-KR1"]);
    expect(result.attentionKrs.map((item) => item.record.okr_id)).toEqual(["SW-KR1"]);
  });

  it("counts an objective progress note as activity for its child KR", () => {
    const access = accessFromAdminUser(config.users[1]);
    const result = buildActionCenter({
      config,
      access,
      periodId: "2026-q3",
      records: [records[0]],
      progressNotes: [{
        team: "Software",
        periodId: "2026-q3",
        objectiveId: "SW-O1",
        weekStart: "2026-07-13",
        summary: "Updated",
        status: "Red",
        risks: "Blocked",
        nextSteps: "Escalate",
        actual: "",
        progress: null,
        evidenceUrl: "",
        updatedBy: "Member",
        updatedAt: "2026-07-13T08:00:00.000Z"
      }],
      drafts: [],
      now: new Date("2026-07-14T12:00:00.000Z")
    });

    expect(result.staleKrs).toHaveLength(0);
  });

  it("hides stale update work when weekly progress is disabled", () => {
    const access = accessFromAdminUser(config.users[1]);
    const result = buildActionCenter({
      config: { ...config, settings: { ...config.settings, allowProgressNotes: false } },
      access,
      periodId: "2026-q3",
      records: [{ ...records[0], last_update: "2026-06-30" }],
      progressNotes: [],
      drafts: [],
      now: new Date("2026-07-14T12:00:00.000Z")
    });

    expect(result.staleKrs).toHaveLength(0);
    expect(result.updateDueKrs.map((item) => item.record.okr_id)).toEqual(["SW-KR1"]);
    expect(result.attentionKrs.map((item) => item.record.okr_id)).toEqual(["SW-KR1"]);
  });

  it("shows other teams aligned to an owned KR", () => {
    const access = accessFromAdminUser(config.users[1]);
    const result = buildActionCenter({
      config,
      access,
      periodId: "2026-q3",
      records: [
        records[0],
        objective("APP-O1", "Application", "App Lead", "SW-KR1"),
        objective("HW-O1", "Hardware", "HW Lead", "SW-KR3"),
        objective("SW-O1-CHILD", "Software", "Other", "SW-KR1")
      ],
      progressNotes: [],
      drafts: []
    });

    expect(result.alignmentUpdates.map((item) => item.source.okr_id)).toEqual(["APP-O1"]);
    expect(result.alignmentUpdates[0].target.okr_id).toBe("SW-KR1");
  });

  it("shows alignments into the user's team scope", () => {
    const access = accessFromAdminUser(config.users[0]);
    const result = buildActionCenter({
      config,
      access,
      periodId: "2026-q3",
      records: [
        kr("SW-KR4", "Software", "Other", "Green", "2026-07-12"),
        objective("APP-O1", "Application", "App Lead", "SW-KR4")
      ],
      progressNotes: [],
      drafts: []
    });

    expect(result.alignmentUpdates.map((item) => item.source.okr_id)).toEqual(["APP-O1"]);
  });

  it("shows pending drafts only inside a team leader's publish scope", () => {
    const access = accessFromAdminUser(config.users[0]);
    const result = buildActionCenter({
      config,
      access,
      periodId: "2026-q3",
      records: [],
      progressNotes: [],
      drafts: [draft("Software", "draft"), draft("Application", "draft"), draft("Hardware", "draft"), draft("Software", "published")],
      now: new Date("2026-07-14T12:00:00.000Z")
    });

    expect(result.pendingReviews.map((item) => item.team)).toEqual(["Application", "Software"]);
  });
});

function kr(id: string, team: string, owner: string, confidence: OkrRecord["confidence"], lastUpdate: string, risks = "", decisions = ""): OkrRecord {
  return {
    okr_id: id,
    parent_id: "SW-O1",
    level: "Team",
    team,
    objective: "Objective",
    kr: id,
    type: "Committed",
    owner,
    baseline: "0",
    target: "100",
    actual: "",
    score: 0.5,
    confidence,
    dependencies: "",
    risks,
    decisions_needed: decisions,
    source_doc_url: "page-edit",
    last_update: lastUpdate
  };
}

function draft(team: string, status: "draft" | "published"): OkrDraft {
  return {
    version: 1,
    team,
    periodId: "2026-q3",
    updatedAt: team === "Application" ? "2026-07-14T11:00:00.000Z" : "2026-07-14T10:00:00.000Z",
    objectives: [{
      id: `${team}-O1`,
      periodId: "2026-q3",
      team,
      title: "Objective",
      owner: "Lead",
      type: "Committed",
      confidence: "Green",
      weight: 100,
      progress: 0,
      status,
      keyResults: []
    }]
  };
}

function objective(id: string, team: string, owner: string, alignedToId: string): OkrRecord {
  return {
    ...kr(id, team, owner, "Green", "2026-07-13"),
    parent_id: "",
    objective: `${id} Objective`,
    kr: "",
    score: null,
    aligned_to_id: alignedToId
  };
}

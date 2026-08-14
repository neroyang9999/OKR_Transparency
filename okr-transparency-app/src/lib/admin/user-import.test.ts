import { describe, expect, it } from "vitest";
import type { AdminConfig, AdminUser } from "./config";
import { applyUserImport, parseUserImport } from "./user-import";

const config = {
  version: 2,
  revision: 4,
  defaultPeriodId: "2026-q3",
  periods: [{ id: "2026-q3", label: "2026 Q3", labelEn: "2026 Q3", shortLabel: "Q3", status: "active" }],
  defaultTeam: "Software",
  teams: [
    { id: "software", name: "Software", aliases: [], owner: "Lead", parentTeam: "", color: "blue", enabled: true },
    { id: "platform", name: "Platform", aliases: [], owner: "Lead", parentTeam: "", color: "slate", enabled: true }
  ],
  users: [
    { email: "lead@example.com", displayName: "Lead", role: "team_leader", teams: ["Software"], ownerAliases: ["Lead"], enabled: true }
  ],
  settings: { defaultLanguage: "zh", showEditLinks: true, allowProgressNotes: true, backupExportEnabled: true }
} as AdminConfig;

function userByEmail(users: AdminUser[], email: string) {
  return users.find((user) => user.email === email);
}

describe("parseUserImport", () => {
  it("adds new members from a header row and multi-value team cells", () => {
    const preview = parseUserImport([
      "email,displayName,role,teams",
      "li.ming@example.com,李明,user,Software",
      "wang.fang@example.com,王芳,team_leader,Software|Platform"
    ].join("\n"), config);

    expect(preview.issues).toEqual([]);
    expect(preview.addCount).toBe(2);
    expect(preview.updateCount).toBe(0);
    expect(preview.rows[1].user).toMatchObject({
      email: "wang.fang@example.com",
      displayName: "王芳",
      role: "team_leader",
      teams: ["Software", "Platform"]
    });
  });

  it("reads a headerless paste in the default column order", () => {
    const preview = parseUserImport("li.ming@example.com,李明,user,Software", config);

    expect(preview.rows).toHaveLength(1);
    expect(preview.rows[0].user).toMatchObject({ email: "li.ming@example.com", displayName: "李明", teams: ["Software"] });
  });

  it("accepts tab-separated input pasted straight from a spreadsheet", () => {
    const preview = parseUserImport("email\tdisplayName\nli.ming@example.com\t李明", config);

    expect(preview.issues).toEqual([]);
    expect(preview.rows[0].user.email).toBe("li.ming@example.com");
  });

  it("leaves unlisted columns on an existing member untouched", () => {
    const preview = parseUserImport("email,teams\nlead@example.com,Platform", config);

    expect(preview.updateCount).toBe(1);
    expect(preview.rows[0].user).toMatchObject({
      displayName: "Lead",
      role: "team_leader",
      ownerAliases: ["Lead"],
      teams: ["Platform"]
    });
    expect(preview.rows[0].changedFields).toEqual(["teams"]);
  });

  it("skips rows that would not change an existing member", () => {
    const preview = parseUserImport("email,teams\nlead@example.com,Software", config);

    expect(preview.rows).toEqual([]);
  });

  it("reports unknown teams, bad roles, bad emails, and repeated rows without importing them", () => {
    const preview = parseUserImport([
      "email,role,teams",
      "a@example.com,user,Nonexistent",
      "b@example.com,overlord,Software",
      "not-an-email,user,Software",
      "c@example.com,user,Software",
      "c@example.com,user,Platform"
    ].join("\n"), config);

    expect(preview.rows.map((row) => row.user.email)).toEqual(["c@example.com"]);
    expect(preview.issues.map((issue) => issue.line)).toEqual([2, 3, 4, 6]);
    expect(preview.issues[0].message).toContain("Nonexistent");
  });

  it("defaults name and role, and reads the disabled flag", () => {
    const preview = parseUserImport("email,enabled\nzhao.lei@example.com,false", config);

    expect(preview.rows[0].user).toMatchObject({
      displayName: "zhao.lei",
      role: "user",
      teams: [],
      enabled: false
    });
  });

  it("ignores columns it does not recognise instead of misreading them", () => {
    const preview = parseUserImport([
      "email,displayName,department,notes",
      "li.ming@example.com,李明,研发一部,入职中"
    ].join("\n"), config);

    expect(preview.issues).toEqual([]);
    expect(preview.rows[0].user).toMatchObject({ email: "li.ming@example.com", displayName: "李明" });
  });

  it("keeps quoted cells that contain the delimiter intact", () => {
    const preview = parseUserImport('email,displayName\nsun.li@example.com,"Sun, Li"', config);

    expect(preview.rows[0].user.displayName).toBe("Sun, Li");
  });
});

describe("applyUserImport", () => {
  it("updates matched members in place and appends the new ones", () => {
    const preview = parseUserImport([
      "email,displayName,teams",
      "lead@example.com,Lead Renamed,Platform",
      "li.ming@example.com,李明,Software"
    ].join("\n"), config);
    const next = applyUserImport(config, preview.rows);

    expect(next.users).toHaveLength(2);
    expect(userByEmail(next.users, "lead@example.com")).toMatchObject({ displayName: "Lead Renamed", teams: ["Platform"], role: "team_leader" });
    expect(userByEmail(next.users, "li.ming@example.com")).toMatchObject({ displayName: "李明", role: "user" });
  });

  it("does not mutate the config it was given", () => {
    const preview = parseUserImport("email,displayName\nli.ming@example.com,李明", config);
    applyUserImport(config, preview.rows);

    expect(config.users).toHaveLength(1);
  });
});

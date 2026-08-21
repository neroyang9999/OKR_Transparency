import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { normalizeAdminConfig, type AdminConfig, type AdminTeam, type AdminUser } from "../admin/config";
import { getAlignmentOptions } from "./alignment-candidates";
import { normalizeDraft } from "./edit-types";
import { ownerScopeForTeam, ownerScopeForUser } from "./owner-scope";
import type { ObjectiveScope, OkrRecord } from "./types";

function user(partial: Partial<AdminUser> & Pick<AdminUser, "displayName" | "email">): AdminUser {
  return {
    role: "user",
    teams: [],
    leaderTeams: null,
    ownerAliases: [partial.displayName, partial.email],
    enabled: true,
    ...partial
  } as AdminUser;
}

function team(partial: Partial<AdminTeam> & Pick<AdminTeam, "name" | "owner">): AdminTeam {
  return { id: partial.name, parentTeam: "", color: "bg-blue-500", enabled: true, ...partial } as AdminTeam;
}

function record(partial: Partial<OkrRecord> & Pick<OkrRecord, "okr_id" | "team" | "owner">): OkrRecord {
  return {
    objective: `${partial.okr_id} objective`,
    kr: "",
    parent_id: "",
    type: "Committed",
    confidence: "Green",
    score: null,
    objective_scope: "team" as ObjectiveScope,
    ...partial
  } as OkrRecord;
}

const leader = user({
  displayName: "Xiaojun (June) Duan",
  email: "xiaojun@unitxlabs.com",
  role: "team_leader",
  teams: ["QA Team"],
  ownerAliases: ["Xiaojun (June) Duan", "xiaojun@unitxlabs.com", "QA Lead"]
});
const member = user({ displayName: "Liang Zhang", email: "liang.zhang@unitxlabs.com", teams: ["QA Team"] });

// The shape production runs: the team's configured `owner` is a role label, not the leader's name.
const config = {
  teams: [team({ name: "Software", owner: "Software Lead" }), team({ name: "QA Team", owner: "QA Lead", parentTeam: "Software" })],
  users: [leader, member]
} as AdminConfig;

/** What `publishDraft` stamps onto every record of a team-level publish. */
function publishedTeamOwner(cfg: AdminConfig, teamName: string) {
  return ownerScopeForTeam(cfg, teamName)?.owner ?? teamName;
}

describe("member alignment targets", () => {
  it("offers the team OKR published under the leader's resolved display name", () => {
    const records = [
      record({ okr_id: "QA-O1", team: "QA Team", owner: publishedTeamOwner(config, "QA Team") }),
      record({ okr_id: "QA-O1-KR1", team: "QA Team", owner: publishedTeamOwner(config, "QA Team"), parent_id: "QA-O1", kr: "KR one" })
    ];

    const options = getAlignmentOptions(records, "QA Team", config, "member");

    expect(options.map((option) => option.id)).toEqual(["QA-O1", "QA-O1-KR1"]);
  });

  it("still offers legacy records published under the team name", () => {
    const records = [record({ okr_id: "QA-LEGACY", team: "QA Team", owner: "QA Team", objective_scope: undefined })];

    expect(getAlignmentOptions(records, "QA Team", config, "member").map((option) => option.id)).toEqual(["QA-LEGACY"]);
  });

  it("hides the leader's own member OKR, whose owner is a valid team owner alias", () => {
    const records = [
      record({ okr_id: "QA-TEAM-O", team: "QA Team", owner: publishedTeamOwner(config, "QA Team") }),
      record({
        okr_id: "QA-LEADER-PERSONAL",
        team: "QA Team",
        owner: ownerScopeForUser(leader).owner,
        objective_scope: "member"
      })
    ];

    expect(getAlignmentOptions(records, "QA Team", config, "member").map((option) => option.id)).toEqual(["QA-TEAM-O"]);
  });

  it("hides other members' OKRs", () => {
    const records = [
      record({ okr_id: "QA-TEAM-O", team: "QA Team", owner: publishedTeamOwner(config, "QA Team") }),
      record({ okr_id: "QA-PEER", team: "QA Team", owner: "yating li", objective_scope: "member" })
    ];

    expect(getAlignmentOptions(records, "QA Team", config, "member").map((option) => option.id)).toEqual(["QA-TEAM-O"]);
  });

  it("never reaches outside the member's own team", () => {
    const records = [record({ okr_id: "SW-O1", team: "Software", owner: publishedTeamOwner(config, "Software") })];

    expect(getAlignmentOptions(records, "QA Team", config, "member")).toEqual([]);
  });
});

describe("team alignment targets", () => {
  it("offers the parent team's records without an owner filter", () => {
    const records = [
      record({ okr_id: "SW-O1", team: "Software", owner: publishedTeamOwner(config, "Software") }),
      record({ okr_id: "QA-O1", team: "QA Team", owner: publishedTeamOwner(config, "QA Team") })
    ];

    expect(getAlignmentOptions(records, "QA Team", config, "team").map((option) => option.id)).toEqual(["SW-O1"]);
  });

  it("offers nothing to a top-level team", () => {
    const records = [record({ okr_id: "SW-O1", team: "Software", owner: "Software Lead" })];

    expect(getAlignmentOptions(records, "Software", config, "team")).toEqual([]);
  });
});

/**
 * The defect this guards: the picker filtered candidates by an owner allowlist built from the
 * configured owner *label*, while publishing stamps the resolved owner *display name*. Every team
 * with a correctly configured leader therefore showed its members no alignment target at all.
 */
describe("publish/align round trip", () => {
  const ownerLabels: Array<[string, (leaderUser: AdminUser, teamName: string) => string]> = [
    ["a role label listed in the leader's aliases", () => "QA Lead"],
    ["the leader's display name", (leaderUser) => leaderUser.displayName],
    ["the leader's email", (leaderUser) => leaderUser.email],
    ["the team name", (_leaderUser, teamName) => teamName],
    ["a label no user claims", () => "Nobody In Particular"]
  ];

  ownerLabels.forEach(([label, ownerOf]) => {
    it(`aligns when the team owner is configured as ${label}`, () => {
      const teamName = "QA Team";
      const cfg = {
        teams: [team({ name: "Software", owner: "Software Lead" }), team({ name: teamName, owner: ownerOf(leader, teamName), parentTeam: "Software" })],
        users: [leader, member]
      } as AdminConfig;

      // Publish exactly the way the team page does, then look for the result as the member does.
      const publishedOwner = publishedTeamOwner(cfg, teamName);
      const draft = normalizeDraft(
        {
          version: 1,
          team: teamName,
          periodId: "2026-q3",
          updatedAt: "2026-06-15T00:00:00.000Z",
          objectives: [{
            id: "QA-O1",
            periodId: "2026-q3",
            team: teamName,
            title: "Team objective",
            owner: "",
            type: "Committed",
            confidence: "Green",
            weight: 100,
            progress: null,
            status: "draft",
            keyResults: []
          }]
        },
        publishedOwner,
        true
      );
      const records = [record({ okr_id: "QA-O1", team: teamName, owner: draft.objectives[0].owner })];

      expect(records[0].owner).toBe(publishedOwner);
      expect(getAlignmentOptions(records, teamName, cfg, "member").map((option) => option.id)).toEqual(["QA-O1"]);
    });
  });

  it("holds for every team in the shipped admin config", () => {
    const shipped = normalizeAdminConfig(JSON.parse(readFileSync("data/okr-admin-config.json", "utf8")));
    const withoutTargets: string[] = [];

    shipped.teams.filter((item) => item.enabled).forEach((item) => {
      const publishedOwner = publishedTeamOwner(shipped, item.name);
      const records = [record({ okr_id: `${item.name}-O1`, team: item.name, owner: publishedOwner })];
      if (getAlignmentOptions(records, item.name, shipped, "member").length === 0) {
        withoutTargets.push(`${item.name} (published owner "${publishedOwner}", configured label "${item.owner}")`);
      }
    });

    expect(withoutTargets).toEqual([]);
  });
});

import type { AdminConfig, AdminUser } from "@/lib/admin/config";
import { resolveTeamOwner } from "../admin/team-owners";
import type { ObjectiveScope, OkrRecord } from "./types";

export type OkrOwnerScope = {
  owner: string;
  aliases: string[];
  objectiveScope: ObjectiveScope;
  ownerEmail?: string;
};

export function ownerScopeForUser(user: AdminUser): OkrOwnerScope {
  const owner = user.displayName || user.email;
  return {
    owner,
    aliases: unique([owner, ...user.ownerAliases, user.email]),
    objectiveScope: "member",
    ownerEmail: user.email.trim().toLowerCase()
  };
}

export function ownerScopeForMember(config: AdminConfig, team: string, ownerEmail: string): OkrOwnerScope | null {
  const email = ownerEmail.trim().toLowerCase();
  const user = config.users.find((item) =>
    item.enabled &&
    item.email.toLowerCase() === email &&
    item.teams.includes(team)
  );
  return user ? ownerScopeForUser(user) : null;
}

export function ownerScopeForTeam(config: AdminConfig, team: string): OkrOwnerScope | null {
  const configuredTeam = config.teams.find((item) => item.enabled && item.name === team);
  if (!configuredTeam) return null;

  const owner = resolveTeamOwner(config.users, configuredTeam);
  const leaders = config.users.filter((user) => user.enabled && (
    (user.role === "team_leader" && user.teams.includes(team)) ||
    (user.leaderTeams ?? []).includes(team)
  ));

  return {
    owner: owner?.displayName ?? configuredTeam.owner,
    objectiveScope: "team",
    aliases: unique([
      configuredTeam.owner,
      ...(owner ? ownerScopeForUser(owner).aliases : []),
      ...leaders.flatMap((leader) => ownerScopeForUser(leader).aliases)
    ])
  };
}

export function isMemberScopedRecord(record: Pick<OkrRecord, "objective_scope">) {
  return (record.objective_scope ?? "team") === "member";
}

/** A member's personal OKRs belong to that member's page, never to the team page they align into. */
export function teamScopedRecords(records: OkrRecord[]) {
  return records.filter((record) => !isMemberScopedRecord(record));
}

function unique(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

import type { AdminConfig } from "./admin/config";
import { getTeamEditPolicy, type UserAccess } from "./admin/permissions";

export type MyKrEntryTeam = {
  name: string;
  parentTeam: string;
  scope: "personal" | "team";
};

export function buildMyKrEntryTeams(config: AdminConfig, access: UserAccess): MyKrEntryTeam[] {
  return config.teams
    .filter((team) => team.enabled && getTeamEditPolicy(config, team.name, access).canEdit)
    .map((team) => ({
      name: team.name,
      parentTeam: team.parentTeam,
      scope: access.teams.includes(team.name) ? "personal" as const : "team" as const
    }))
    .sort((left, right) =>
      scopePriority(left.scope) - scopePriority(right.scope) || left.name.localeCompare(right.name)
    );
}

function scopePriority(scope: MyKrEntryTeam["scope"]) {
  return scope === "personal" ? 0 : 1;
}

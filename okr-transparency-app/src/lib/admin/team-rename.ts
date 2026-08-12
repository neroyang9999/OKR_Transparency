import type { AdminConfig } from "./config";
import { canonicalTeamName, legacyTeamNamesFor } from "../team-names";

export function renameAdminTeam(config: AdminConfig, teamId: string, requestedName: string): AdminConfig {
  const team = config.teams.find((item) => item.id === teamId);
  if (!team) throw new Error("Team not found");

  const name = requestedName.trim();
  const error = teamRenameError(config, teamId, name);
  if (error) throw new Error(error);

  const previousName = team.name;
  return {
    ...config,
    defaultTeam: config.defaultTeam === previousName ? name : config.defaultTeam,
    teams: config.teams.map((item) => {
      if (item.id === teamId) {
        return {
          ...item,
          name,
          aliases: unique([...(item.aliases ?? []), previousName]).filter((alias) => !sameTeamName(alias, name))
        };
      }
      return item.parentTeam === previousName ? { ...item, parentTeam: name } : item;
    }),
    users: config.users.map((user) => ({
      ...user,
      teams: user.teams.map((item) => item === previousName ? name : item),
      leaderTeams: user.leaderTeams?.map((item) => item === previousName ? name : item)
    }))
  };
}

export function teamRenameError(config: AdminConfig, teamId: string, requestedName: string) {
  const team = config.teams.find((item) => item.id === teamId);
  if (!team) return "团队不存在";
  const name = requestedName.trim();
  if (!name) return "团队名称不能为空";
  if (sameTeamIdentity(name, team.name)) return "新名称不能与当前名称相同";
  const conflict = config.teams.some((item) =>
    item.id !== teamId && [item.name, ...(item.aliases ?? [])].some((candidate) => sameTeamIdentity(candidate, name))
  );
  return conflict ? "团队名称已存在或曾被其他团队使用" : null;
}

export function resolveAdminTeamName(config: AdminConfig, storedName: string) {
  const canonicalName = canonicalTeamName(storedName);
  const team = config.teams.find((item) =>
    sameTeamName(item.name, canonicalName) ||
    (item.aliases ?? []).some((alias) => sameTeamName(alias, storedName) || sameTeamName(alias, canonicalName))
  );
  return team?.name ?? canonicalName;
}

export function adminTeamNameCandidates(config: AdminConfig, teamName: string) {
  const resolvedName = resolveAdminTeamName(config, teamName);
  const team = config.teams.find((item) => sameTeamName(item.name, resolvedName));
  return unique([
    resolvedName,
    ...(team?.aliases ?? []),
    ...legacyTeamNamesFor(resolvedName)
  ]);
}

function sameTeamName(left: string, right: string) {
  return left.trim().toLocaleLowerCase() === right.trim().toLocaleLowerCase();
}

function sameTeamIdentity(left: string, right: string) {
  return sameTeamName(canonicalTeamName(left), canonicalTeamName(right));
}

function unique(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

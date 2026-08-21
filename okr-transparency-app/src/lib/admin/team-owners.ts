import type { AdminTeam, AdminUser } from "./config";

export function selectableTeamOwners(users: AdminUser[]) {
  return users.filter((user) => user.enabled && hasCompleteIdentity(user));
}

export function resolveTeamOwner(users: AdminUser[], team: Pick<AdminTeam, "name" | "owner">) {
  const candidates = selectableTeamOwners(users);
  const configuredOwner = normalize(team.owner);
  const configured = candidates.find((user) => [user.displayName, user.email, ...user.ownerAliases]
    .some((value) => normalize(value) === configuredOwner));
  if (configured) return configured;

  return candidates.find((user) => user.role === "team_leader" && user.teams.includes(team.name))
    ?? candidates.find((user) => (user.leaderTeams ?? []).includes(team.name))
    ?? null;
}

/** The name to show for a team's owner. Falls back to the configured label when no user resolves. */
export function teamOwnerDisplayName(users: AdminUser[], team: Pick<AdminTeam, "name" | "owner">) {
  return resolveTeamOwner(users, team)?.displayName || team.owner;
}

/** Owner display names keyed by team name, for views that render many teams at once. */
export function teamOwnerDisplayNames(users: AdminUser[], teams: AdminTeam[]): Record<string, string> {
  return Object.fromEntries(teams.map((team) => [team.name, teamOwnerDisplayName(users, team)]));
}

function hasCompleteIdentity(user: AdminUser) {
  const displayName = user.displayName.trim();
  const email = user.email.trim().toLowerCase();
  if (!displayName || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return false;
  if (["新成员", "new member", "new user"].includes(displayName.toLowerCase())) return false;
  return !/^new-user-\d+@company\.com$/.test(email);
}

function normalize(value: string) {
  return value.trim().toLowerCase();
}

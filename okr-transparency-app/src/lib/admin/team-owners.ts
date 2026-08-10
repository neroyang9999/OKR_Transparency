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

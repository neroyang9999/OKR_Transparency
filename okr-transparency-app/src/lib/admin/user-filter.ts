import type { AdminRole, AdminUser } from "./config";

export function filterAdminUsers(users: AdminUser[], role: AdminRole, query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  return users
    .map((user, index) => ({ user, index }))
    .filter(({ user }) => matchesAdminRoleCategory(user, role))
    .filter(({ user }) => !normalizedQuery || [user.displayName, user.email, ...user.teams, ...(user.leaderTeams ?? [])]
      .join(" ")
      .toLowerCase()
      .includes(normalizedQuery));
}

export function matchesAdminRoleCategory(user: AdminUser, role: AdminRole) {
  if (role === "team_leader") return user.role === "team_leader" || (user.leaderTeams?.length ?? 0) > 0;
  return user.role === role;
}

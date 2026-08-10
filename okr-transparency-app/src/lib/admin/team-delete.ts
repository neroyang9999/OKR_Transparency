import type { AdminConfig } from "./config";

export function teamDeleteBlockReason(config: AdminConfig, teamId: string) {
  const team = config.teams.find((item) => item.id === teamId);
  if (!team) return "团队不存在";
  if (team.name === config.defaultTeam) return "默认团队不可删除，请先设置其他默认团队";
  if (config.teams.some((item) => item.parentTeam === team.name)) return "该团队仍有下级团队，请先调整下级团队归属";
  return "";
}

export function deleteAdminTeam(config: AdminConfig, teamId: string) {
  const reason = teamDeleteBlockReason(config, teamId);
  if (reason) throw new Error(reason);
  const team = config.teams.find((item) => item.id === teamId)!;

  return {
    ...config,
    teams: config.teams.filter((item) => item.id !== teamId),
    users: config.users.map((user) => ({
      ...user,
      teams: user.teams.filter((name) => name !== team.name),
      leaderTeams: user.leaderTeams?.filter((name) => name !== team.name)
    }))
  };
}

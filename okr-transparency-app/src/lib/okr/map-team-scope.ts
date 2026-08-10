import type { AdminTeam } from "@/lib/admin/config";
import type { OkrRecord } from "./types";

const preferredTopLevelOrder = ["Software", "Hardware", "Advanced Technology", "AP OPS"];

export type MapTeamScope = {
  topLevelTeams: AdminTeam[];
  childTeams: AdminTeam[];
  selectedGroup?: string;
  selectedTeam?: string;
  focusTeam?: string;
  records: OkrRecord[];
};

export function buildMapTeamScope(teams: AdminTeam[], records: OkrRecord[], requestedTeam?: string): MapTeamScope {
  const enabledTeams = teams.filter((team) => team.enabled);
  const teamByName = new Map(enabledTeams.map((team) => [team.name, team]));
  const topLevelTeams = enabledTeams
    .filter((team) => !team.parentTeam)
    .sort((a, b) => teamRank(a.name) - teamRank(b.name) || a.name.localeCompare(b.name));
  const selectedTeam = requestedTeam && teamByName.has(requestedTeam) ? requestedTeam : undefined;
  const selectedConfig = selectedTeam ? teamByName.get(selectedTeam) : undefined;
  const selectedGroup = selectedConfig?.parentTeam || selectedConfig?.name;
  const childTeams = selectedGroup
    ? enabledTeams.filter((team) => team.parentTeam === selectedGroup)
    : [];
  const configuredRecords = records.filter((record) => teamByName.has(record.team));

  if (!selectedConfig) {
    return { topLevelTeams, childTeams, records: configuredRecords };
  }

  if (!selectedConfig.parentTeam) {
    const visibleTeams = new Set([selectedConfig.name, ...collectDescendantNames(enabledTeams, selectedConfig.name)]);
    return {
      topLevelTeams,
      childTeams,
      selectedGroup,
      selectedTeam,
      records: configuredRecords.filter((record) => visibleTeams.has(record.team))
    };
  }

  const visibleTeams = new Set([selectedConfig.parentTeam, selectedConfig.name]);
  return {
    topLevelTeams,
    childTeams,
    selectedGroup,
    selectedTeam,
    focusTeam: selectedConfig.name,
    records: configuredRecords.filter((record) => visibleTeams.has(record.team))
  };
}

function collectDescendantNames(teams: AdminTeam[], parentName: string): string[] {
  const directChildren = teams.filter((team) => team.parentTeam === parentName);
  return directChildren.flatMap((team) => [team.name, ...collectDescendantNames(teams, team.name)]);
}

function teamRank(team: string) {
  const index = preferredTopLevelOrder.indexOf(team);
  return index === -1 ? preferredTopLevelOrder.length : index;
}

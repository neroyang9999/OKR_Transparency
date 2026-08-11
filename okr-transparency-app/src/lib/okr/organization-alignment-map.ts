import type { AdminTeam } from "@/lib/admin/config";
import type { Lang } from "@/lib/i18n";
import type { ObjectiveAlignmentNode } from "./alignment-view";

const preferredTopLevelOrder = ["Software", "Hardware", "Advanced Technology", "AP OPS"];

export type OrganizationMapNode = {
  id: string;
  kind: "engineering" | "team" | "objective";
  label: string;
  team?: string;
  objectiveNode?: ObjectiveAlignmentNode;
  children: OrganizationMapNode[];
  alignmentChildCount: number;
  objectiveCount: number;
  keyResultCount: number;
  averageProgress: number | null;
};

export type ObjectiveAlignmentEdge = {
  fromId: string;
  toId: string;
};

export type OrganizationAlignmentMap = {
  roots: OrganizationMapNode[];
  alignmentEdges: ObjectiveAlignmentEdge[];
};

export function buildOrganizationAlignmentMap(
  alignmentRoots: ObjectiveAlignmentNode[],
  teams: AdminTeam[],
  lang: Lang
): OrganizationAlignmentMap {
  if (alignmentRoots.length === 0) return { roots: [], alignmentEdges: [] };

  const objectiveNodes = flattenObjectiveNodes(alignmentRoots);
  const objectivesByTeam = new Map<string, ObjectiveAlignmentNode[]>();
  objectiveNodes.forEach((node) => {
    const team = node.objective.team || (lang === "en" ? "Other" : "其他");
    objectivesByTeam.set(team, [...(objectivesByTeam.get(team) ?? []), node]);
  });

  const enabledTeams = teams.filter((team) => team.enabled);
  const teamByName = new Map(enabledTeams.map((team) => [team.name, team]));
  const visibleTeamNames = collectVisibleTeamNames(objectivesByTeam, teamByName);
  const configuredRootTeams = enabledTeams
    .filter((team) => visibleTeamNames.has(team.name))
    .filter((team) => !team.parentTeam || !visibleTeamNames.has(team.parentTeam))
    .sort(compareTeams);
  const configuredNames = new Set(enabledTeams.map((team) => team.name));
  const unconfiguredTeams = Array.from(objectivesByTeam.keys())
    .filter((team) => !configuredNames.has(team))
    .sort();

  const teamNodes = [
    ...configuredRootTeams.map((team) => buildTeamNode(team, enabledTeams, visibleTeamNames, objectivesByTeam)),
    ...unconfiguredTeams.map((team) => aggregateNode({
      id: `team:${team}`,
      kind: "team",
      label: team,
      team,
      children: (objectivesByTeam.get(team) ?? []).map(objectiveToMapNode)
    }))
  ];

  return {
    roots: [aggregateNode({
      id: "engineering",
      kind: "engineering",
      label: "Engineering",
      children: teamNodes
    })],
    alignmentEdges: collectAlignmentEdges(alignmentRoots)
  };
}

function flattenObjectiveNodes(roots: ObjectiveAlignmentNode[]) {
  const result: ObjectiveAlignmentNode[] = [];
  const visited = new Set<string>();

  function visit(node: ObjectiveAlignmentNode) {
    if (visited.has(node.objective.okr_id)) return;
    visited.add(node.objective.okr_id);
    result.push(node);
    node.children.forEach(visit);
  }

  roots.forEach(visit);
  return result;
}

function collectVisibleTeamNames(
  objectivesByTeam: Map<string, ObjectiveAlignmentNode[]>,
  teamByName: Map<string, AdminTeam>
) {
  const result = new Set<string>();

  objectivesByTeam.forEach((_, teamName) => {
    let current = teamByName.get(teamName);
    const visited = new Set<string>();
    while (current && !visited.has(current.name)) {
      visited.add(current.name);
      result.add(current.name);
      current = current.parentTeam ? teamByName.get(current.parentTeam) : undefined;
    }
  });

  return result;
}

function buildTeamNode(
  team: AdminTeam,
  teams: AdminTeam[],
  visibleTeamNames: Set<string>,
  objectivesByTeam: Map<string, ObjectiveAlignmentNode[]>
): OrganizationMapNode {
  const objectiveChildren = (objectivesByTeam.get(team.name) ?? [])
    .sort((a, b) => a.objective.okr_id.localeCompare(b.objective.okr_id))
    .map(objectiveToMapNode);
  const teamChildren = teams
    .filter((candidate) => candidate.parentTeam === team.name && visibleTeamNames.has(candidate.name))
    .sort(compareTeams)
    .map((candidate) => buildTeamNode(candidate, teams, visibleTeamNames, objectivesByTeam));

  return aggregateNode({
    id: `team:${team.name}`,
    kind: "team",
    label: team.name,
    team: team.name,
    children: [...objectiveChildren, ...teamChildren]
  });
}

function collectAlignmentEdges(roots: ObjectiveAlignmentNode[]) {
  const edges: ObjectiveAlignmentEdge[] = [];

  function visit(parent: ObjectiveAlignmentNode) {
    parent.children.forEach((child) => {
      edges.push({
        fromId: `objective:${child.objective.okr_id}`,
        toId: `objective:${parent.objective.okr_id}`
      });
      visit(child);
    });
  }

  roots.forEach(visit);
  return edges;
}

function objectiveToMapNode(node: ObjectiveAlignmentNode): OrganizationMapNode {
  return aggregateNode({
    id: `objective:${node.objective.okr_id}`,
    kind: "objective",
    label: node.objective.objective,
    team: node.objective.team,
    objectiveNode: node,
    alignmentChildCount: node.children.length,
    children: []
  });
}

function aggregateNode(
  base: Pick<OrganizationMapNode, "id" | "kind" | "label" | "children">
    & Partial<Pick<OrganizationMapNode, "team" | "objectiveNode" | "alignmentChildCount">>
): OrganizationMapNode {
  const selfObjectiveCount = base.kind === "objective" ? 1 : 0;
  const ownKeyResults = base.objectiveNode?.keyResults.length ?? 0;
  const childObjectiveCount = base.children.reduce((sum, child) => sum + child.objectiveCount, 0);
  const childKeyResultCount = base.children.reduce((sum, child) => sum + child.keyResultCount, 0);
  const progressValues = collectProgressValues(base);

  return {
    id: base.id,
    kind: base.kind,
    label: base.label,
    team: base.team,
    objectiveNode: base.objectiveNode,
    children: base.children,
    alignmentChildCount: base.alignmentChildCount ?? 0,
    objectiveCount: selfObjectiveCount + childObjectiveCount,
    keyResultCount: ownKeyResults + childKeyResultCount,
    averageProgress: progressValues.length > 0
      ? progressValues.reduce((sum, value) => sum + value, 0) / progressValues.length
      : null
  };
}

function collectProgressValues(
  node: Pick<OrganizationMapNode, "kind" | "children"> & Partial<Pick<OrganizationMapNode, "objectiveNode">>
): number[] {
  const ownScore = node.kind === "objective" ? node.objectiveNode?.objective.score : null;
  return [
    ...(ownScore === null || ownScore === undefined ? [] : [ownScore]),
    ...node.children.flatMap((child) => collectProgressValues(child))
  ];
}

function compareTeams(a: AdminTeam, b: AdminTeam) {
  return teamRank(a.name) - teamRank(b.name) || a.name.localeCompare(b.name);
}

function teamRank(team: string) {
  const index = preferredTopLevelOrder.indexOf(team);
  return index === -1 ? preferredTopLevelOrder.length : index;
}

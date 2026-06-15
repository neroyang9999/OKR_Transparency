import type { OkrRecord } from "./types";

const topLevelTeams = new Set(["Software", "Hardware", "Advanced Technology", "AP OPS"]);
const topLevelTeamOrder = ["Software", "Hardware", "Advanced Technology", "AP OPS"];

export type ObjectiveAlignmentNode = {
  objective: OkrRecord;
  keyResults: OkrRecord[];
  children: ObjectiveAlignmentNode[];
};

export type AlignmentViewModel = {
  roots: ObjectiveAlignmentNode[];
  unalignedObjectives: OkrRecord[];
  teams: string[];
  objectiveCount: number;
  alignedObjectiveCount: number;
};

export function buildAlignmentViewModel(records: OkrRecord[], selectedTeam?: string): AlignmentViewModel {
  const recordById = new Map(records.map((record) => [record.okr_id, record]));
  const objectives = records.filter((record) => !record.kr);
  const objectiveById = new Map(objectives.map((objective) => [objective.okr_id, objective]));
  const keyResultsByParent = new Map<string, OkrRecord[]>();
  const parentByObjectiveId = new Map<string, string>();
  const childrenByParentId = new Map<string, OkrRecord[]>();

  records.filter((record) => record.kr).forEach((record) => {
    keyResultsByParent.set(record.parent_id, [...(keyResultsByParent.get(record.parent_id) ?? []), record]);
  });

  objectives.forEach((objective) => {
    const parentObjective = resolveParentObjective(objective, recordById);
    if (!parentObjective) return;

    parentByObjectiveId.set(objective.okr_id, parentObjective.okr_id);
    childrenByParentId.set(parentObjective.okr_id, [
      ...(childrenByParentId.get(parentObjective.okr_id) ?? []),
      objective
    ]);
  });

  const allAlignedTeams = Array.from(new Set([
    ...Array.from(parentByObjectiveId.keys())
      .map((id) => objectiveById.get(id)?.team)
      .filter((team): team is string => Boolean(team)),
    ...objectives
      .filter((objective) => isUnalignedObjective(objective, parentByObjectiveId, childrenByParentId))
      .map((objective) => objective.team)
  ])).sort();

  const visibleIds = selectedTeam
    ? collectVisibleIdsForTeam(objectives, selectedTeam, parentByObjectiveId, childrenByParentId)
    : new Set(objectives.map((objective) => objective.okr_id));

  const roots = objectives
    .filter((objective) => !parentByObjectiveId.has(objective.okr_id))
    .filter((objective) => visibleIds.has(objective.okr_id))
    .filter((objective) => isTopLevelObjective(objective) || childrenByParentId.has(objective.okr_id))
    .map((objective) => buildNode(objective, keyResultsByParent, childrenByParentId, visibleIds))
    .filter((node) => node.children.length > 0 || !selectedTeam)
    .sort(sortNodes);

  const unalignedObjectives = objectives
    .filter((objective) => isUnalignedObjective(objective, parentByObjectiveId, childrenByParentId))
    .filter((objective) => !selectedTeam || objective.team === selectedTeam)
    .sort((a, b) => a.team.localeCompare(b.team) || a.okr_id.localeCompare(b.okr_id));

  return {
    roots,
    unalignedObjectives,
    teams: allAlignedTeams,
    objectiveCount: countNodes(roots),
    alignedObjectiveCount: Array.from(parentByObjectiveId.keys())
      .filter((id) => visibleIds.has(id))
      .length
  };
}

function resolveParentObjective(objective: OkrRecord, recordById: Map<string, OkrRecord>) {
  const target = objective.parent_id ? recordById.get(objective.parent_id) : null;
  if (!target) return null;
  if (!target.kr) return target;
  return target.parent_id ? recordById.get(target.parent_id) ?? null : null;
}

function collectVisibleIdsForTeam(
  objectives: OkrRecord[],
  selectedTeam: string,
  parentByObjectiveId: Map<string, string>,
  childrenByParentId: Map<string, OkrRecord[]>
) {
  const objectiveById = new Map(objectives.map((objective) => [objective.okr_id, objective]));
  const visibleIds = new Set<string>();

  objectives
    .filter((objective) => objective.team === selectedTeam)
    .forEach((objective) => {
      addAncestors(objective.okr_id, visibleIds, parentByObjectiveId);
      addDescendants(objective.okr_id, visibleIds, childrenByParentId);
    });

  Array.from(visibleIds).forEach((id) => {
    if (!objectiveById.has(id)) visibleIds.delete(id);
  });

  return visibleIds;
}

function addAncestors(id: string, visibleIds: Set<string>, parentByObjectiveId: Map<string, string>) {
  visibleIds.add(id);
  const parentId = parentByObjectiveId.get(id);
  if (parentId) addAncestors(parentId, visibleIds, parentByObjectiveId);
}

function addDescendants(id: string, visibleIds: Set<string>, childrenByParentId: Map<string, OkrRecord[]>) {
  visibleIds.add(id);
  (childrenByParentId.get(id) ?? []).forEach((child) => addDescendants(child.okr_id, visibleIds, childrenByParentId));
}

function buildNode(
  objective: OkrRecord,
  keyResultsByParent: Map<string, OkrRecord[]>,
  childrenByParentId: Map<string, OkrRecord[]>,
  visibleIds: Set<string>
): ObjectiveAlignmentNode {
  return {
    objective,
    keyResults: keyResultsByParent.get(objective.okr_id) ?? [],
    children: (childrenByParentId.get(objective.okr_id) ?? [])
      .filter((child) => visibleIds.has(child.okr_id))
      .map((child) => buildNode(child, keyResultsByParent, childrenByParentId, visibleIds))
      .sort(sortNodes)
  };
}

function isUnalignedObjective(
  objective: OkrRecord,
  parentByObjectiveId: Map<string, string>,
  childrenByParentId: Map<string, OkrRecord[]>
) {
  return !parentByObjectiveId.has(objective.okr_id)
    && !isTopLevelObjective(objective)
    && !childrenByParentId.has(objective.okr_id);
}

function isTopLevelObjective(objective: OkrRecord) {
  return !objective.parent_id && topLevelTeams.has(objective.team);
}

function countNodes(nodes: ObjectiveAlignmentNode[]): number {
  return nodes.reduce((sum, node) => sum + 1 + countNodes(node.children), 0);
}

function sortNodes(a: ObjectiveAlignmentNode, b: ObjectiveAlignmentNode) {
  const teamDiff = teamRank(a.objective.team) - teamRank(b.objective.team);
  if (teamDiff !== 0) return teamDiff;
  const teamNameDiff = a.objective.team.localeCompare(b.objective.team);
  if (teamNameDiff !== 0) return teamNameDiff;
  const childDiff = b.children.length - a.children.length;
  if (childDiff !== 0) return childDiff;
  return a.objective.okr_id.localeCompare(b.objective.okr_id);
}

function teamRank(team: string) {
  const index = topLevelTeamOrder.indexOf(team);
  return index === -1 ? topLevelTeamOrder.length : index;
}

import type { AdminTeam } from "@/lib/admin/config";
import type { ConfidenceLevel, OkrLocalizedFields, OkrRecord, OkrType } from "./types";

const preferredTopLevelOrder = ["Software", "Hardware", "Advanced Technology", "AP OPS"];
const confidenceOrder: ConfidenceLevel[] = ["Green", "Yellow", "Red"];

export type AlignmentStatusCounts = Record<ConfidenceLevel, number>;

/** One Objective placed on the alignment canvas. `nodeId` is what edges anchor to. */
export type AlignmentObjective = {
  nodeId: string;
  okrId: string;
  title: string;
  localized?: OkrLocalizedFields;
  team: string;
  owner: string;
  type: OkrType;
  confidence: ConfidenceLevel;
  /** 0..1, or null when neither the Objective nor its KRs report progress. */
  progress: number | null;
  keyResultCount: number;
  member: boolean;
  parentNodeId: string | null;
  isRoot: boolean;
  unaligned: boolean;
  crossLevel: boolean;
  /** Direct team-scope children aligned to this Objective. */
  alignedChildCount: number;
  /** Member Objectives anywhere below this Objective. */
  memberCount: number;
};

/** L1 column: one collapsible band per top-level team. */
export type AlignmentGroup = {
  nodeId: string;
  team: string;
  owner: string;
  color: string;
  objectives: AlignmentObjective[];
  memberCount: number;
  averageProgress: number | null;
  statusCounts: AlignmentStatusCounts;
};

/** L3 column: every member Objective of one team folded into a single card. */
export type AlignmentMemberGroup = {
  nodeId: string;
  team: string;
  color: string;
  members: AlignmentObjective[];
  parents: Array<{ nodeId: string; title: string; localized?: OkrLocalizedFields }>;
  statusCounts: AlignmentStatusCounts;
  averageProgress: number | null;
  unalignedCount: number;
  crossLevel: boolean;
  confidence: ConfidenceLevel;
};

export type AlignmentEmptyNote =
  | { kind: "team-without-objective"; team: string; memberCount: number; crossLevel: boolean }
  | { kind: "teams-without-children"; teams: string[] };

export type AlignmentMetrics = {
  objectiveCount: number;
  memberObjectiveCount: number;
  keyResultCount: number;
  rootCount: number;
  unalignedCount: number;
  shouldAlignCount: number;
  averageProgress: number | null;
};

export type AlignmentEdge = { id: string; fromNodeId: string; toNodeId: string };

export type AlignmentMapModel = {
  groups: AlignmentGroup[];
  secondLevel: AlignmentObjective[];
  secondLevelNotes: AlignmentEmptyNote[];
  memberGroups: AlignmentMemberGroup[];
  memberNote: AlignmentEmptyNote | null;
  edges: AlignmentEdge[];
  metrics: AlignmentMetrics;
  columns: {
    l1: { teamCount: number; objectiveCount: number };
    l2: { teamCount: number; objectiveCount: number };
    l3: { groupCount: number; memberCount: number };
  };
};

export function objectiveNodeId(okrId: string) {
  return `objective:${okrId}`;
}

export function memberGroupNodeId(team: string) {
  return `member-group:${team}`;
}

export function groupNodeId(team: string) {
  return `group:${team}`;
}

export function buildAlignmentMapModel(
  records: OkrRecord[],
  teams: AdminTeam[],
  /** Owner display names by team, from `teamOwnerDisplayNames`. The configured owner label is
   *  only a lookup key, so falling back to it shows a different name than every other view. */
  teamOwners: Record<string, string> = {}
): AlignmentMapModel {
  const teamByName = new Map(teams.filter((team) => team.enabled).map((team) => [team.name, team]));
  const topLevelTeamOf = buildTopLevelResolver(teamByName);
  const isTopLevelTeam = (team: string) => teamByName.has(team) && !hasVisibleParent(teamByName.get(team), teamByName);

  const recordById = new Map(records.map((record) => [record.okr_id, record]));
  const objectiveRecords = records.filter((record) => !record.kr);
  const objectiveById = new Map(objectiveRecords.map((objective) => [objective.okr_id, objective]));
  const keyResultsByObjective = new Map<string, OkrRecord[]>();
  records.filter((record) => record.kr).forEach((record) => {
    keyResultsByObjective.set(record.parent_id, [...(keyResultsByObjective.get(record.parent_id) ?? []), record]);
  });

  const parentIdByObjective = new Map<string, string>();
  const childIdsByObjective = new Map<string, string[]>();
  objectiveRecords.forEach((objective) => {
    const parent = resolveParentObjective(objective, recordById);
    if (!parent || parent.kr || parent.okr_id === objective.okr_id || !objectiveById.has(parent.okr_id)) return;
    parentIdByObjective.set(objective.okr_id, parent.okr_id);
    childIdsByObjective.set(parent.okr_id, [...(childIdsByObjective.get(parent.okr_id) ?? []), objective.okr_id]);
  });

  const isMemberRecord = (objective: OkrRecord) => (objective.objective_scope ?? "team") === "member";

  const objectives = objectiveRecords.map((objective): AlignmentObjective => {
    const parentId = parentIdByObjective.get(objective.okr_id) ?? null;
    const parent = parentId ? objectiveById.get(parentId) : null;
    const member = isMemberRecord(objective);
    const expectedParentTeam = member ? objective.team : teamByName.get(objective.team)?.parentTeam || null;
    const isRoot = !parentId && !member && isTopLevelTeam(objective.team);
    const keyResults = keyResultsByObjective.get(objective.okr_id) ?? [];
    const childIds = childIdsByObjective.get(objective.okr_id) ?? [];

    return {
      nodeId: objectiveNodeId(objective.okr_id),
      okrId: objective.okr_id,
      title: objective.objective,
      localized: objective.localized,
      team: objective.team,
      owner: objective.owner,
      type: objective.type,
      confidence: objective.confidence,
      progress: resolveProgress(objective, keyResults),
      keyResultCount: keyResults.length,
      member,
      parentNodeId: parentId ? objectiveNodeId(parentId) : null,
      isRoot,
      unaligned: !parentId && !isRoot,
      crossLevel: Boolean(parent) && Boolean(expectedParentTeam) && parent?.team !== expectedParentTeam,
      alignedChildCount: childIds.filter((childId) => {
        const child = objectiveById.get(childId);
        return Boolean(child) && !isMemberRecord(child as OkrRecord);
      }).length,
      memberCount: countMembersBelow(objective.okr_id, childIdsByObjective, objectiveById, isMemberRecord)
    };
  });

  const objectiveByNodeId = new Map(objectives.map((objective) => [objective.nodeId, objective]));
  const memberObjectives = objectives.filter((objective) => objective.member);
  const teamObjectives = objectives.filter((objective) => !objective.member);
  const rootObjectives = teamObjectives.filter((objective) => isTopLevelTeam(objective.team));
  const secondLevelRaw = teamObjectives.filter((objective) => !isTopLevelTeam(objective.team));

  const groups = buildGroups(objectives, rootObjectives, teamByName, topLevelTeamOf, teamOwners);
  const rootOrder = new Map(groups.flatMap((group) => group.objectives).map((objective, index) => [objective.nodeId, index]));
  const secondLevel = [...secondLevelRaw].sort(
    (a, b) => parentRank(a, rootOrder) - parentRank(b, rootOrder)
      || a.team.localeCompare(b.team)
      || a.okrId.localeCompare(b.okrId)
  );

  const secondLevelOrder = new Map(secondLevel.map((objective, index) => [objective.nodeId, index]));
  const memberGroups = buildMemberGroups(memberObjectives, objectiveByNodeId, teamByName, secondLevelOrder, rootOrder);

  return {
    groups,
    secondLevel,
    secondLevelNotes: buildSecondLevelNotes(memberObjectives, secondLevel, groups, teamByName, topLevelTeamOf),
    memberGroups,
    memberNote: buildMissingTeamsNote(groups, new Set(memberObjectives.map((objective) => topLevelTeamOf(objective.team)))),
    edges: buildEdges(teamObjectives, memberGroups),
    metrics: {
      objectiveCount: objectives.length,
      memberObjectiveCount: memberObjectives.length,
      keyResultCount: records.length - objectiveRecords.length,
      rootCount: objectives.filter((objective) => objective.isRoot).length,
      unalignedCount: objectives.filter((objective) => objective.unaligned).length,
      shouldAlignCount: objectives.filter((objective) => !objective.isRoot).length,
      averageProgress: averageProgress(objectives)
    },
    columns: {
      l1: { teamCount: groups.length, objectiveCount: rootObjectives.length },
      l2: { teamCount: new Set(secondLevel.map((objective) => objective.team)).size, objectiveCount: secondLevel.length },
      l3: { groupCount: memberGroups.length, memberCount: memberObjectives.length }
    }
  };
}

function buildGroups(
  objectives: AlignmentObjective[],
  rootObjectives: AlignmentObjective[],
  teamByName: Map<string, AdminTeam>,
  topLevelTeamOf: (team: string) => string | null,
  teamOwners: Record<string, string>
): AlignmentGroup[] {
  const subtreeByTeam = new Map<string, AlignmentObjective[]>();
  objectives.forEach((objective) => {
    const top = topLevelTeamOf(objective.team);
    if (!top) return;
    subtreeByTeam.set(top, [...(subtreeByTeam.get(top) ?? []), objective]);
  });

  const rootsByTeam = new Map<string, AlignmentObjective[]>();
  rootObjectives.forEach((objective) => {
    rootsByTeam.set(objective.team, [...(rootsByTeam.get(objective.team) ?? []), objective]);
  });

  return Array.from(subtreeByTeam.keys())
    .sort((a, b) => teamRank(a) - teamRank(b) || a.localeCompare(b))
    .map((team) => {
      const subtree = subtreeByTeam.get(team) ?? [];
      return {
        nodeId: groupNodeId(team),
        team,
        owner: teamOwners[team] || teamByName.get(team)?.owner || "",
        color: teamByName.get(team)?.color ?? "",
        objectives: (rootsByTeam.get(team) ?? []).sort(
          (a, b) => b.alignedChildCount - a.alignedChildCount || a.okrId.localeCompare(b.okrId)
        ),
        memberCount: subtree.filter((objective) => objective.member).length,
        averageProgress: averageProgress(subtree),
        statusCounts: countStatuses(subtree)
      };
    });
}

function buildMemberGroups(
  memberObjectives: AlignmentObjective[],
  objectiveByNodeId: Map<string, AlignmentObjective>,
  teamByName: Map<string, AdminTeam>,
  secondLevelOrder: Map<string, number>,
  rootOrder: Map<string, number>
): AlignmentMemberGroup[] {
  const byTeam = new Map<string, AlignmentObjective[]>();
  memberObjectives.forEach((objective) => {
    byTeam.set(objective.team, [...(byTeam.get(objective.team) ?? []), objective]);
  });

  return Array.from(byTeam.entries())
    .map(([team, rawMembers]): AlignmentMemberGroup => {
      const members = [...rawMembers].sort(
        (a, b) => confidenceRank(a.confidence) - confidenceRank(b.confidence) || a.owner.localeCompare(b.owner)
      );
      const aligned = members.filter((member) => member.parentNodeId);
      return {
        nodeId: memberGroupNodeId(team),
        team,
        color: teamByName.get(team)?.color ?? "",
        members,
        parents: collectParents(aligned, objectiveByNodeId),
        statusCounts: countStatuses(members),
        averageProgress: averageProgress(members),
        unalignedCount: members.filter((member) => member.unaligned).length,
        crossLevel: aligned.length > 0 && aligned.every((member) => member.crossLevel),
        confidence: worstConfidence(members)
      };
    })
    .sort((a, b) => memberGroupRank(a, secondLevelOrder, rootOrder) - memberGroupRank(b, secondLevelOrder, rootOrder)
      || a.team.localeCompare(b.team));
}

function collectParents(aligned: AlignmentObjective[], objectiveByNodeId: Map<string, AlignmentObjective>) {
  const counts = new Map<string, number>();
  aligned.forEach((member) => {
    const parentNodeId = member.parentNodeId as string;
    counts.set(parentNodeId, (counts.get(parentNodeId) ?? 0) + 1);
  });

  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .flatMap(([parentNodeId]) => {
      const parent = objectiveByNodeId.get(parentNodeId);
      return parent ? [{ nodeId: parent.nodeId, title: parent.title, localized: parent.localized }] : [];
    });
}

function buildSecondLevelNotes(
  memberObjectives: AlignmentObjective[],
  secondLevel: AlignmentObjective[],
  groups: AlignmentGroup[],
  teamByName: Map<string, AdminTeam>,
  topLevelTeamOf: (team: string) => string | null
): AlignmentEmptyNote[] {
  const teamsWithObjective = new Set(secondLevel.map((objective) => objective.team));
  const membersByTeam = new Map<string, AlignmentObjective[]>();
  memberObjectives.forEach((objective) => {
    membersByTeam.set(objective.team, [...(membersByTeam.get(objective.team) ?? []), objective]);
  });

  const notes: AlignmentEmptyNote[] = Array.from(membersByTeam.entries())
    .filter(([team]) => !teamsWithObjective.has(team) && hasVisibleParent(teamByName.get(team), teamByName))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([team, members]) => ({
      kind: "team-without-objective" as const,
      team,
      memberCount: members.length,
      crossLevel: members.some((member) => member.crossLevel)
    }));

  const coveredTopLevel = new Set(secondLevel.map((objective) => topLevelTeamOf(objective.team)));
  const missing = buildMissingTeamsNote(groups, coveredTopLevel);
  return missing ? [...notes, missing] : notes;
}

function buildMissingTeamsNote(groups: AlignmentGroup[], covered: Set<string | null>): AlignmentEmptyNote | null {
  const teams = groups.map((group) => group.team).filter((team) => !covered.has(team));
  return teams.length > 0 ? { kind: "teams-without-children", teams } : null;
}

function buildEdges(teamObjectives: AlignmentObjective[], memberGroups: AlignmentMemberGroup[]): AlignmentEdge[] {
  return [
    ...teamObjectives
      .filter((objective) => objective.parentNodeId)
      .map((objective) => ({
        id: `${objective.nodeId}->${objective.parentNodeId}`,
        fromNodeId: objective.nodeId,
        toNodeId: objective.parentNodeId as string
      })),
    ...memberGroups.flatMap((group) =>
      group.parents.map((parent) => ({
        id: `${group.nodeId}->${parent.nodeId}`,
        fromNodeId: group.nodeId,
        toNodeId: parent.nodeId
      }))
    )
  ];
}

function resolveParentObjective(objective: OkrRecord, recordById: Map<string, OkrRecord>) {
  const target = objective.aligned_to_id ? recordById.get(objective.aligned_to_id) : null;
  if (!target) return null;
  if (!target.kr) return target;
  return target.parent_id ? recordById.get(target.parent_id) ?? null : null;
}

function resolveProgress(objective: OkrRecord, keyResults: OkrRecord[]) {
  if (objective.score !== null) return objective.score;
  const scores = keyResults.map((kr) => kr.score).filter((score): score is number => score !== null);
  return scores.length > 0 ? scores.reduce((sum, score) => sum + score, 0) / scores.length : null;
}

function countMembersBelow(
  okrId: string,
  childIdsByObjective: Map<string, string[]>,
  objectiveById: Map<string, OkrRecord>,
  isMemberRecord: (objective: OkrRecord) => boolean,
  seen = new Set<string>()
): number {
  if (seen.has(okrId)) return 0;
  seen.add(okrId);
  return (childIdsByObjective.get(okrId) ?? []).reduce((sum, childId) => {
    const child = objectiveById.get(childId);
    if (!child) return sum;
    return sum + (isMemberRecord(child) ? 1 : 0)
      + countMembersBelow(childId, childIdsByObjective, objectiveById, isMemberRecord, seen);
  }, 0);
}

function buildTopLevelResolver(teamByName: Map<string, AdminTeam>) {
  return (team: string): string | null => {
    let current = teamByName.get(team);
    const seen = new Set<string>();
    while (current && !seen.has(current.name)) {
      seen.add(current.name);
      if (!hasVisibleParent(current, teamByName)) return current.name;
      current = teamByName.get(current.parentTeam);
    }
    return null;
  };
}

function hasVisibleParent(team: AdminTeam | undefined, teamByName: Map<string, AdminTeam>) {
  return Boolean(team?.parentTeam) && teamByName.has(team?.parentTeam as string);
}

function parentRank(objective: AlignmentObjective, rootOrder: Map<string, number>) {
  const rank = objective.parentNodeId ? rootOrder.get(objective.parentNodeId) : undefined;
  return rank ?? rootOrder.size;
}

function memberGroupRank(
  group: AlignmentMemberGroup,
  secondLevelOrder: Map<string, number>,
  rootOrder: Map<string, number>
) {
  const primary = group.parents[0]?.nodeId;
  if (!primary) return secondLevelOrder.size + rootOrder.size;
  const secondLevelRank = secondLevelOrder.get(primary);
  if (secondLevelRank !== undefined) return secondLevelRank;
  return secondLevelOrder.size + (rootOrder.get(primary) ?? rootOrder.size);
}

function countStatuses(objectives: AlignmentObjective[]): AlignmentStatusCounts {
  return objectives.reduce<AlignmentStatusCounts>(
    (counts, objective) => ({ ...counts, [objective.confidence]: counts[objective.confidence] + 1 }),
    { Green: 0, Yellow: 0, Red: 0 }
  );
}

function worstConfidence(objectives: AlignmentObjective[]): ConfidenceLevel {
  if (objectives.some((objective) => objective.confidence === "Red")) return "Red";
  if (objectives.some((objective) => objective.confidence === "Yellow")) return "Yellow";
  return "Green";
}

function averageProgress(objectives: AlignmentObjective[]) {
  const values = objectives.map((objective) => objective.progress).filter((value): value is number => value !== null);
  return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function confidenceRank(confidence: ConfidenceLevel) {
  return confidenceOrder.indexOf(confidence);
}

function teamRank(team: string) {
  const index = preferredTopLevelOrder.indexOf(team);
  return index === -1 ? preferredTopLevelOrder.length : index;
}

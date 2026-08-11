export type AlignmentOption = {
  id: string;
  kind: "O" | "KR";
  team: string;
  owner: string;
  title: string;
  parentId?: string;
  parentTitle?: string;
  progress: number | null;
  confidence: string;
};

export type AlignmentOptionGroup = {
  key: string;
  objective?: AlignmentOption;
  parentTitle?: string;
  keyResults: AlignmentOption[];
};

export function filterAlignmentOptionGroups(options: AlignmentOption[], query = ""): AlignmentOptionGroup[] {
  const normalizedQuery = query.trim().toLowerCase();
  const objectives = options.filter((option) => option.kind === "O");
  const keyResults = options.filter((option) => option.kind === "KR");
  const groupedKrIds = new Set<string>();
  const groups: AlignmentOptionGroup[] = [];

  objectives.forEach((objective) => {
    const children = keyResults.filter((option) => option.parentId === objective.id);
    children.forEach((option) => groupedKrIds.add(option.id));
    const objectiveMatches = matchesAlignmentQuery(objective, normalizedQuery);
    const visibleChildren = !normalizedQuery || objectiveMatches
      ? children
      : children.filter((option) => matchesAlignmentQuery(option, normalizedQuery));

    if (!normalizedQuery || objectiveMatches || visibleChildren.length > 0) {
      groups.push({
        key: objective.id,
        objective,
        parentTitle: objective.title,
        keyResults: visibleChildren
      });
    }
  });

  const orphanGroups = new Map<string, AlignmentOptionGroup>();
  keyResults
    .filter((option) => !groupedKrIds.has(option.id))
    .filter((option) => matchesAlignmentQuery(option, normalizedQuery))
    .forEach((option) => {
      const key = option.parentId || option.parentTitle || "other";
      const group = orphanGroups.get(key) ?? {
        key,
        parentTitle: option.parentTitle,
        keyResults: []
      };
      group.keyResults.push(option);
      orphanGroups.set(key, group);
    });

  return [...groups, ...orphanGroups.values()];
}

export function flattenAlignmentOptionGroups(groups: AlignmentOptionGroup[]): AlignmentOption[] {
  return groups.flatMap((group) => [
    ...(group.objective ? [group.objective] : []),
    ...group.keyResults
  ]);
}

export function alignmentOptionMatchesQuery(option: AlignmentOption, query: string) {
  return matchesAlignmentQuery(option, query.trim().toLowerCase());
}

function matchesAlignmentQuery(option: AlignmentOption, normalizedQuery: string) {
  if (!normalizedQuery) return true;
  return [option.id, option.kind, option.team, option.owner, option.title, option.parentTitle ?? ""]
    .join(" ")
    .toLowerCase()
    .includes(normalizedQuery);
}

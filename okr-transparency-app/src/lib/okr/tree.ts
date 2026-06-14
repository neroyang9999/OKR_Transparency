import type { OkrNode, OkrRecord, OkrStats } from "./types";

export function buildOkrTree(records: OkrRecord[]): OkrNode[] {
  const byId = new Map<string, OkrNode>();
  records.forEach((record) => byId.set(record.okr_id, { ...record, children: [] }));

  const roots: OkrNode[] = [];
  byId.forEach((node) => {
    if (node.parent_id) {
      byId.get(node.parent_id)?.children.push(node);
      return;
    }
    roots.push(node);
  });

  const sortNodes = (nodes: OkrNode[]) => {
    nodes.sort((a, b) => a.okr_id.localeCompare(b.okr_id));
    nodes.forEach((node) => sortNodes(node.children));
  };
  sortNodes(roots);

  return roots;
}

export function getOkrStats(records: OkrRecord[]): OkrStats {
  const scores = records
    .map((record) => record.score)
    .filter((score): score is number => typeof score === "number");

  return {
    totalRecords: records.length,
    engineeringRecords: records.filter((record) => record.level === "Engineering").length,
    teamRecords: records.filter((record) => record.level === "Team").length,
    teams: Array.from(new Set(records.map((record) => record.team))).sort(),
    redCount: records.filter((record) => record.confidence === "Red").length,
    yellowCount: records.filter((record) => record.confidence === "Yellow").length,
    greenCount: records.filter((record) => record.confidence === "Green").length,
    riskyCount: records.filter((record) => record.risks).length,
    decisionsNeededCount: records.filter((record) => record.decisions_needed).length,
    averageScore: scores.length
      ? Number((scores.reduce((sum, score) => sum + score, 0) / scores.length).toFixed(2))
      : null
  };
}

export function findOkrLineage(records: OkrRecord[], okrId: string) {
  const byId = new Map(records.map((record) => [record.okr_id, record]));
  const current = byId.get(okrId);
  if (!current) return null;

  const ancestors: OkrRecord[] = [];
  let cursor = current.parent_id ? byId.get(current.parent_id) : undefined;
  while (cursor) {
    ancestors.unshift(cursor);
    cursor = cursor.parent_id ? byId.get(cursor.parent_id) : undefined;
  }

  const descendants = collectDescendants(records, okrId);
  return { current, ancestors, descendants };
}

function collectDescendants(records: OkrRecord[], okrId: string): OkrRecord[] {
  const direct = records.filter((record) => record.parent_id === okrId);
  return direct.flatMap((record) => [record, ...collectDescendants(records, record.okr_id)]);
}

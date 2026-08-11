import type { OkrRecord } from "./types";

export type PublishScope = {
  team: string;
  ownerAliases?: string[];
  objectiveScope?: OkrRecord["objective_scope"];
  ownerEmail?: string;
};

export function buildPublicationCandidate(
  currentRecords: OkrRecord[],
  publishedRecords: OkrRecord[],
  scope: PublishScope
): { records: OkrRecord[]; warnings: string[] } {
  const aliases = (scope.ownerAliases ?? []).map(normalizeToken).filter(Boolean);
  const removesRecord = (record: OkrRecord) => {
    if (record.team !== scope.team) return false;
    if (scope.objectiveScope) {
      if ((record.objective_scope ?? "team") !== scope.objectiveScope) return false;
      if (scope.objectiveScope === "member") {
        return normalizeToken(record.owner_email ?? "") === normalizeToken(scope.ownerEmail ?? "");
      }
      return true;
    }
    if (aliases.length === 0) return true;
    return aliases.includes(normalizeToken(record.owner));
  };

  return clearDanglingAlignments([
    ...currentRecords.filter((record) => !removesRecord(record)),
    ...publishedRecords
  ]);
}

export function clearDanglingAlignments(records: OkrRecord[]): { records: OkrRecord[]; warnings: string[] } {
  const ids = new Set(records.map((record) => record.okr_id));
  const warnings: string[] = [];
  return {
    records: records.map((record) => {
      if (!record.aligned_to_id || ids.has(record.aligned_to_id)) return record;
      warnings.push(`${record.okr_id}: removed missing alignment target ${record.aligned_to_id}`);
      const nextRecord = { ...record };
      delete nextRecord.aligned_to_id;
      return nextRecord;
    }),
    warnings
  };
}

function normalizeToken(value: string) {
  return value.trim().toLowerCase();
}

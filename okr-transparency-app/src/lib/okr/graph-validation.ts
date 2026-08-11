import type { OkrRecord } from "./types";

export type OkrGraphValidation = {
  errors: string[];
  warnings: string[];
};

export type OkrQualityStats = {
  krCount: number;
  missingOwnerCount: number;
  staleCount: number;
};

export function validateOkrGraph(records: OkrRecord[]): OkrGraphValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const ids = new Set<string>();

  records.forEach((record) => {
    if (!record.okr_id.trim()) {
      errors.push("OKR id is required");
      return;
    }
    if (ids.has(record.okr_id)) errors.push(`${record.okr_id}: duplicate OKR id`);
    ids.add(record.okr_id);
  });

  const byId = new Map(records.map((record) => [record.okr_id, record]));
  records.forEach((record) => {
    if (record.parent_id && !byId.has(record.parent_id)) {
      errors.push(`${record.okr_id}: parent ${record.parent_id} does not exist`);
    }
    if (record.kr && !record.parent_id) {
      errors.push(`${record.okr_id}: KR must belong to an Objective`);
    }
    if (!record.kr && record.parent_id) {
      errors.push(`${record.okr_id}: Objective alignment must use aligned_to_id, not parent_id`);
    }
    if (record.kr && record.aligned_to_id) {
      errors.push(`${record.okr_id}: KR cannot define aligned_to_id`);
    }
    if (record.aligned_to_id && !byId.has(record.aligned_to_id)) {
      errors.push(`${record.okr_id}: alignment target ${record.aligned_to_id} does not exist`);
    }
    const parent = record.parent_id ? byId.get(record.parent_id) : undefined;
    if (record.kr && parent?.kr) errors.push(`${record.okr_id}: KR parent must be an Objective`);
    if (record.kr && parent && parent.team !== record.team) {
      errors.push(`${record.okr_id}: KR parent must belong to the same team`);
    }
  });

  const checked = new Set<string>();
  records.forEach((record) => {
    if (checked.has(record.okr_id)) return;
    const path = new Set<string>();
    let cursor: OkrRecord | undefined = record;
    while (cursor) {
      if (path.has(cursor.okr_id)) {
        errors.push(`${cursor.okr_id}: alignment cycle detected`);
        break;
      }
      if (checked.has(cursor.okr_id)) break;
      path.add(cursor.okr_id);
      cursor = cursor.parent_id ? byId.get(cursor.parent_id) : undefined;
    }
    path.forEach((id) => checked.add(id));
  });

  const objectives = records.filter((record) => !record.kr);
  const objectiveIds = new Set(objectives.map((record) => record.okr_id));
  objectives.forEach((objective) => {
    const path = new Set<string>();
    let cursor: OkrRecord | undefined = objective;
    while (cursor?.aligned_to_id) {
      if (path.has(cursor.okr_id)) {
        errors.push(`${cursor.okr_id}: alignment cycle detected`);
        break;
      }
      path.add(cursor.okr_id);
      const target = byId.get(cursor.aligned_to_id);
      const parentObjective = target?.kr && target.parent_id ? byId.get(target.parent_id) : target;
      cursor = parentObjective && objectiveIds.has(parentObjective.okr_id) ? parentObjective : undefined;
    }
  });

  return { errors: unique(errors), warnings: unique(warnings) };
}

export function validateOkrRecordQuality(records: OkrRecord[]): OkrGraphValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  records.filter((record) => record.kr).forEach((record) => {
    if (!record.owner.trim()) errors.push(`${record.okr_id}: owner is required`);
    if (isStale(record.last_update, 14)) warnings.push(`${record.okr_id}: update is older than 14 days`);
  });
  return { errors: unique(errors), warnings: unique(warnings) };
}

export function getOkrQualityStats(records: OkrRecord[]): OkrQualityStats {
  const krs = records.filter((record) => record.kr);
  return {
    krCount: krs.length,
    missingOwnerCount: krs.filter((record) => !record.owner.trim()).length,
    staleCount: krs.filter((record) => isStale(record.last_update, 14)).length
  };
}

function isStale(value: string, days: number) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return true;
  return Date.now() - timestamp > days * 24 * 60 * 60 * 1000;
}

function unique(values: string[]) {
  return Array.from(new Set(values));
}

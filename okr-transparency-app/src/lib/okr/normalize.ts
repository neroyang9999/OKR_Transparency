import {
  confidenceLevels,
  okrLevels,
  okrTypes,
  type ConfidenceLevel,
  type OkrRecord,
  type OkrType,
  type ValidationResult
} from "./types";

type RawOkrRecord = Record<string, string>;

export function normalizeAndValidate(rows: RawOkrRecord[]): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const records: OkrRecord[] = [];
  const seen = new Set<string>();

  rows.forEach((row, rowIndex) => {
    const rowLabel = `row ${rowIndex + 2}`;
    const okrId = value(row.okr_id);
    if (!okrId) {
      errors.push(`${rowLabel}: okr_id is required`);
      return;
    }
    if (seen.has(okrId)) errors.push(`${rowLabel}: duplicate okr_id "${okrId}"`);
    seen.add(okrId);

    const level = value(row.level);
    const type = value(row.type);
    const confidence = value(row.confidence);
    const scoreText = value(row.score);
    const score = scoreText ? Number(scoreText) : null;

    if (!okrLevels.includes(level as OkrRecord["level"])) {
      errors.push(`${rowLabel}: invalid level "${level}"`);
    }
    if (!okrTypes.includes(type as OkrType)) {
      errors.push(`${rowLabel}: invalid type "${type}"`);
    }
    if (!confidenceLevels.includes(confidence as ConfidenceLevel)) {
      errors.push(`${rowLabel}: invalid confidence "${confidence}"`);
    }
    if (score !== null && (!Number.isFinite(score) || score < 0 || score > 1)) {
      errors.push(`${rowLabel}: score must be empty or a number between 0 and 1`);
    }

    const objective = value(row.objective);
    const owner = value(row.owner);
    const team = value(row.team);
    const source = value(row.source_doc_url);
    const lastUpdate = value(row.last_update);

    if (!team) errors.push(`${rowLabel}: team is required`);
    if (!objective) errors.push(`${rowLabel}: objective is required`);
    if (!owner) errors.push(`${rowLabel}: owner is required`);
    if (!source) errors.push(`${rowLabel}: source_doc_url is required`);
    if (!lastUpdate) errors.push(`${rowLabel}: last_update is required`);

    const parentId = value(row.parent_id);
    const kr = value(row.kr);
    if (level === "Team" && !parentId) {
      errors.push(`${rowLabel}: Team records must have parent_id`);
    }
    if (level === "Team" && !kr) {
      warnings.push(`${rowLabel}: Team record has no KR text`);
    }
    if (confidence !== "Green" && !value(row.risks) && !value(row.decisions_needed)) {
      warnings.push(`${rowLabel}: Yellow/Red records should include risks or decisions_needed`);
    }

    records.push({
      okr_id: okrId,
      parent_id: parentId,
      level: level as OkrRecord["level"],
      team,
      objective,
      kr,
      type: type as OkrType,
      owner,
      baseline: value(row.baseline),
      target: value(row.target),
      actual: value(row.actual),
      score,
      confidence: confidence as ConfidenceLevel,
      dependencies: value(row.dependencies),
      risks: value(row.risks),
      decisions_needed: value(row.decisions_needed),
      source_doc_url: source,
      last_update: lastUpdate
    });
  });

  const ids = new Set(records.map((record) => record.okr_id));
  records.forEach((record) => {
    if (record.parent_id && !ids.has(record.parent_id)) {
      errors.push(`${record.okr_id}: parent_id "${record.parent_id}" does not exist`);
    }
    if (record.level === "Engineering" && record.parent_id) {
      const parent = records.find((item) => item.okr_id === record.parent_id);
      if (parent?.level !== "Engineering") {
        errors.push(`${record.okr_id}: Engineering records can only align to Engineering parents`);
      }
    }
  });

  return { records, errors, warnings };
}

function value(input: unknown): string {
  return String(input ?? "").trim();
}

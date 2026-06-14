import type { ConfidenceLevel, OkrRecord, OkrType } from "./types";

export type OkrSearchParams = {
  q?: string;
  team?: string;
  confidence?: ConfidenceLevel | "";
  type?: OkrType | "";
};

export function searchOkrs(records: OkrRecord[], params: OkrSearchParams) {
  const query = params.q?.trim().toLowerCase();

  return records.filter((record) => {
    if (params.team && record.team !== params.team) return false;
    if (params.confidence && record.confidence !== params.confidence) return false;
    if (params.type && record.type !== params.type) return false;
    if (!query) return true;

    return [
      record.okr_id,
      record.team,
      record.objective,
      record.kr,
      record.owner,
      record.dependencies,
      record.risks,
      record.decisions_needed
    ].some((value) => value.toLowerCase().includes(query));
  });
}

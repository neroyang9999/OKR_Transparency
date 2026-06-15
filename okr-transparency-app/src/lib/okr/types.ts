export const okrLevels = ["Engineering", "Team"] as const;
export const okrTypes = ["Committed", "Aspirational", "Learning"] as const;
export const confidenceLevels = ["Green", "Yellow", "Red"] as const;

export type OkrLevel = (typeof okrLevels)[number];
export type OkrType = (typeof okrTypes)[number];
export type ConfidenceLevel = (typeof confidenceLevels)[number];

export type OkrRecord = {
  okr_id: string;
  parent_id: string;
  level: OkrLevel;
  team: string;
  objective: string;
  kr: string;
  type: OkrType;
  owner: string;
  baseline: string;
  target: string;
  actual: string;
  score: number | null;
  confidence: ConfidenceLevel;
  dependencies: string;
  risks: string;
  decisions_needed: string;
  source_doc_url: string;
  last_update: string;
  aligned_to_id?: string;
};

export type OkrNode = OkrRecord & {
  children: OkrNode[];
};

export type SyncStatus = {
  status: "ok" | "error" | "empty";
  source: "sample" | "csv" | "csv-url" | "google-doc" | "snapshot";
  lastSyncedAt: string;
  message: string;
  rowCount: number;
};

export type OkrSnapshot = {
  version: 1;
  meta: SyncStatus;
  records: OkrRecord[];
};

export type OkrTreeResponse = {
  meta: SyncStatus;
  records: OkrRecord[];
  tree: OkrNode[];
  stats: OkrStats;
};

export type OkrStats = {
  totalRecords: number;
  engineeringRecords: number;
  teamRecords: number;
  teams: string[];
  redCount: number;
  yellowCount: number;
  greenCount: number;
  riskyCount: number;
  decisionsNeededCount: number;
  averageScore: number | null;
};

export type ValidationResult = {
  records: OkrRecord[];
  errors: string[];
  warnings: string[];
};

export const requiredHeaders = [
  "okr_id",
  "parent_id",
  "level",
  "team",
  "objective",
  "kr",
  "type",
  "owner",
  "baseline",
  "target",
  "actual",
  "score",
  "confidence",
  "dependencies",
  "risks",
  "decisions_needed",
  "source_doc_url",
  "last_update"
] as const;

export type OkrHeader = (typeof requiredHeaders)[number];

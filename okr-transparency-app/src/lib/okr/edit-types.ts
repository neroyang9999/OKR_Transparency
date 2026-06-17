import type { ConfidenceLevel, OkrRecord, OkrType } from "./types";

export type EditableKr = {
  id: string;
  title: string;
  owner: string;
  baseline: string;
  target: string;
  actual: string;
  progress: number | null;
  confidence: ConfidenceLevel;
  weight: number;
  risks: string;
  decisionsNeeded: string;
};

export type EditableObjective = {
  id: string;
  periodId: string;
  team: string;
  title: string;
  owner: string;
  type: OkrType;
  confidence: ConfidenceLevel;
  weight: number;
  progress: number | null;
  alignedToId?: string;
  status: "draft" | "published" | "locked";
  keyResults: EditableKr[];
};

export type OkrDraft = {
  version: 1;
  team: string;
  periodId: string;
  updatedAt: string;
  objectives: EditableObjective[];
};

export type DraftValidation = {
  errors: string[];
  warnings: string[];
};

export function normalizeDraft(draft: OkrDraft, teamOwner = draft.team, forceOwner = true): OkrDraft {
  const owner = teamOwner.trim() || draft.team;
  return {
    ...draft,
    objectives: draft.objectives.map((objective) => ({
      ...objective,
      team: draft.team,
      owner: forceOwner ? owner : objective.owner.trim() || owner,
      progress: normalizeNullablePercent(objective.progress),
      weight: normalizePercent(objective.weight, 100),
      keyResults: objective.keyResults.map((kr) => ({
        ...kr,
        owner: forceOwner ? owner : kr.owner.trim() || objective.owner.trim() || owner,
        progress: normalizeNullablePercent(kr.progress),
        weight: normalizePercent(kr.weight, 0)
      }))
    }))
  };
}

export function recordsToDraft(records: OkrRecord[], team: string, periodId: string, initializeFromRecords = true): OkrDraft {
  const teamRecords = records.filter((record) => record.team === team);
  const recordById = new Map(records.map((record) => [record.okr_id, record]));
  const rootObjectives = teamRecords.filter((record) => {
    const parent = record.parent_id ? recordById.get(record.parent_id) : null;
    return !parent || parent.team !== team;
  });

  return {
    version: 1,
    team,
    periodId,
    updatedAt: new Date().toISOString(),
    objectives: initializeFromRecords ? rootObjectives.map((objective, index) => {
      const children = teamRecords.filter((record) => record.parent_id === objective.okr_id && record.kr);
      return {
        id: objective.okr_id || makeObjectiveId(team, index),
        periodId,
        team,
        title: objective.objective,
        owner: objective.owner,
        type: objective.type,
        confidence: objective.confidence,
        weight: 100,
        progress: objective.score === null ? calculateProgress(children) : toPercent(objective.score),
        alignedToId: objective.parent_id || undefined,
        status: "published",
        keyResults: children.map((kr, krIndex) => ({
          id: kr.okr_id || `${objective.okr_id}-KR${krIndex + 1}`,
          title: kr.kr,
          owner: kr.owner,
          baseline: kr.baseline,
          target: kr.target,
          actual: kr.actual,
          progress: kr.score === null ? null : toPercent(kr.score),
          confidence: kr.confidence,
          weight: distributeWeight(children.length, krIndex),
          risks: kr.risks,
          decisionsNeeded: kr.decisions_needed
        }))
      };
    }) : []
  };
}

export function draftToRecords(draft: OkrDraft, teamOwner = draft.team, forceOwner = true): OkrRecord[] {
  const today = new Date().toISOString().slice(0, 10);
  const records: OkrRecord[] = [];
  const normalizedDraft = normalizeDraft(draft, teamOwner, forceOwner);

  normalizedDraft.objectives.forEach((objective) => {
    const objectiveProgress = calculateObjectiveProgress(objective.keyResults);
    records.push({
      okr_id: objective.id,
      parent_id: objective.alignedToId ?? "",
      level: "Team",
      team: normalizedDraft.team,
      objective: objective.title,
      kr: "",
      type: objective.type,
      owner: objective.owner,
      baseline: "",
      target: "",
      actual: "",
      score: objectiveProgress === null ? null : objectiveProgress / 100,
      confidence: objective.confidence,
      dependencies: "",
      risks: collectText(objective.keyResults.map((kr) => kr.risks)),
      decisions_needed: collectText(objective.keyResults.map((kr) => kr.decisionsNeeded)),
      source_doc_url: "page-edit",
      last_update: today
    });

    objective.keyResults.forEach((kr) => {
      records.push({
        okr_id: kr.id,
        parent_id: objective.id,
        level: "Team",
        team: normalizedDraft.team,
        objective: objective.title,
        kr: kr.title,
        type: objective.type,
        owner: kr.owner,
        baseline: kr.baseline,
        target: kr.target,
        actual: kr.actual,
        score: kr.progress === null ? null : kr.progress / 100,
        confidence: kr.confidence,
        dependencies: "",
        risks: kr.risks,
        decisions_needed: kr.decisionsNeeded,
        source_doc_url: "page-edit",
        last_update: today
      });
    });
  });

  return records;
}

export function validateDraft(draft: OkrDraft): DraftValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  draft.objectives.forEach((objective, objectiveIndex) => {
    const label = `O${objectiveIndex + 1}`;
    if (!objective.title.trim()) errors.push(`${label}: Objective is required`);
    if (!objective.owner.trim()) errors.push(`${label}: Owner is required`);
    if (objective.keyResults.length === 0) errors.push(`${label}: at least one KR is required`);
    if (!isPercent(objective.weight)) errors.push(`${label}: weight must be between 0 and 100`);
    if (objective.progress !== null && !isPercent(objective.progress)) {
      errors.push(`${label}: progress must be between 0 and 100`);
    }

    const weightTotal = objective.keyResults.reduce((sum, kr) => sum + (Number.isFinite(kr.weight) ? kr.weight : 0), 0);
    if (objective.keyResults.length > 0 && Math.abs(weightTotal - 100) > 0.2) {
      errors.push(`${label}: KR weights must add up to 100%`);
    }

    if (draft.team !== "Software" && !objective.alignedToId) {
      warnings.push(`${label}: no upper-level alignment selected`);
    }

    objective.keyResults.forEach((kr, krIndex) => {
      const krLabel = `${label}-KR${krIndex + 1}`;
      if (!kr.title.trim()) errors.push(`${krLabel}: KR title is required`);
      if (kr.progress !== null && !isPercent(kr.progress)) {
        errors.push(`${krLabel}: progress must be between 0 and 100`);
      }
      if (!isPercent(kr.weight)) errors.push(`${krLabel}: weight must be between 0 and 100`);
    });
  });

  return { errors, warnings };
}

export function createEmptyObjective(team: string, periodId: string, owner = ""): EditableObjective {
  const objectiveId = `${slug(team)}-O${Date.now().toString(36).toUpperCase()}`;
  return {
    id: objectiveId,
    periodId,
    team,
    title: "",
    owner,
    type: "Committed",
    confidence: "Yellow",
    weight: 100,
    progress: null,
    status: "draft",
    keyResults: [0, 1, 2].map((_, index) => createEmptyKr(objectiveId, index, owner, 3))
  };
}

export function createEmptyKr(objectiveId: string, index: number, owner = "", total = 1): EditableKr {
  return {
    id: `${objectiveId}-KR${Date.now().toString(36).toUpperCase()}-${index + 1}`,
    title: "",
    owner,
    baseline: "",
    target: "",
    actual: "",
    progress: null,
    confidence: "Yellow",
    weight: distributeWeight(total, index),
    risks: "",
    decisionsNeeded: ""
  };
}

function calculateProgress(records: OkrRecord[]) {
  const scores = records.map((record) => record.score).filter((score): score is number => score !== null);
  if (scores.length === 0) return null;
  return Math.round((scores.reduce((sum, score) => sum + score, 0) / scores.length) * 100);
}

export function calculateObjectiveProgress(keyResults: EditableKr[]) {
  const scored = keyResults.filter((kr) => kr.progress !== null);
  if (scored.length === 0) return null;
  return normalizePercent(Math.round(scored.reduce((sum, kr) => sum + ((kr.progress ?? 0) * kr.weight) / 100, 0)), 0);
}

function toPercent(score: number) {
  return normalizePercent(Math.round(score * 100), 0);
}

function distributeWeight(total: number, index: number) {
  if (total <= 0) return 100;
  const base = Math.floor((100 / total) * 10) / 10;
  if (index === total - 1) return Math.round((100 - base * (total - 1)) * 10) / 10;
  return base;
}

function makeObjectiveId(team: string, index: number) {
  return `${slug(team)}-O${index + 1}`;
}

function slug(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "") || "OKR";
}

function collectText(items: string[]) {
  return items.map((item) => item.trim()).filter(Boolean).join("; ");
}

function normalizeNullablePercent(value: number | null) {
  if (value === null) return null;
  if (!Number.isFinite(value)) return null;
  return normalizePercent(value, 0);
}

function normalizePercent(value: number, fallback: number) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(100, Math.max(0, value));
}

function isPercent(value: number) {
  return Number.isFinite(value) && value >= 0 && value <= 100;
}

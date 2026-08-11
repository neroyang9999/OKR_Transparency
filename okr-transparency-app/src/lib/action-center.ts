import type { AdminConfig } from "./admin/config";
import { getTeamEditPolicy, type UserAccess } from "./admin/permissions";
import type { OkrDraft } from "./okr/edit-types";
import type { ProgressNote } from "./okr/progress-notes";
import type { OkrRecord } from "./okr/types";

const staleAfterMs = 7 * 24 * 60 * 60 * 1000;

export type ActionCenterKr = {
  record: OkrRecord;
  lastActivityAt: string;
  isStale: boolean;
};

export type PendingReview = {
  team: string;
  updatedAt: string;
  draftObjectiveCount: number;
};

export type AlignmentUpdate = {
  source: OkrRecord;
  target: OkrRecord;
  lastActivityAt: string;
};

export type ActionCenterData = {
  ownedKrs: ActionCenterKr[];
  staleKrs: ActionCenterKr[];
  updateDueKrs: ActionCenterKr[];
  attentionKrs: ActionCenterKr[];
  alignmentUpdates: AlignmentUpdate[];
  pendingReviews: PendingReview[];
};

export function buildActionCenter(input: {
  config: AdminConfig;
  access: UserAccess;
  periodId: string;
  records: OkrRecord[];
  progressNotes: ProgressNote[];
  drafts: OkrDraft[];
  now?: Date;
}): ActionCenterData {
  const now = input.now ?? new Date();
  const aliases = input.access.ownerAliases.map(normalizeToken).filter(Boolean);
  const periodNotes = input.progressNotes.filter((note) => note.periodId === input.periodId);
  const recordById = new Map(input.records.map((record) => [record.okr_id, record]));
  const ownedKrs = input.records
    .filter((record) => Boolean(record.kr) && aliases.includes(normalizeToken(record.owner)))
    .map((record) => buildKrItem(record, periodNotes, now))
    .sort(compareKrs);
  const relevantTeams = new Set(input.access.teams);
  const staleKrs = input.config.settings.allowProgressNotes
    ? ownedKrs.filter((item) => item.isStale).sort(compareOldestActivity)
    : [];
  const cycleStart = parsePeriodStart(input.periodId);
  const cycleMissingKrs = cycleStart === null ? [] : ownedKrs
    .filter((item) => {
      const lastUpdate = parseTimestamp(item.record.last_update);
      return lastUpdate === null || lastUpdate < cycleStart;
    })
    .sort(compareOldestActivity);

  return {
    ownedKrs,
    staleKrs,
    updateDueKrs: input.config.settings.allowProgressNotes ? staleKrs : cycleMissingKrs,
    attentionKrs: ownedKrs
      .filter(({ record }) => record.confidence !== "Green" || Boolean(record.risks.trim()) || Boolean(record.decisions_needed.trim()))
      .sort(compareAttention),
    alignmentUpdates: input.records
      .filter((record) => !record.kr && Boolean(record.aligned_to_id))
      .map((source) => ({ source, target: recordById.get(source.aligned_to_id ?? "") }))
      .filter((item): item is { source: OkrRecord; target: OkrRecord } => Boolean(item.target))
      .filter(({ source, target }) =>
        source.team !== target.team && (
          aliases.includes(normalizeToken(target.owner)) || relevantTeams.has(target.team)
        )
      )
      .map(({ source, target }) => ({ source, target, lastActivityAt: normalizeDate(source.last_update) }))
      .sort((left, right) => right.lastActivityAt.localeCompare(left.lastActivityAt) || left.source.team.localeCompare(right.source.team)),
    pendingReviews: input.drafts
      .filter((draft) => getTeamEditPolicy(input.config, draft.team, input.access).canPublish)
      .map((draft) => ({
        team: draft.team,
        updatedAt: draft.updatedAt,
        draftObjectiveCount: draft.objectives.filter((objective) => objective.status === "draft").length
      }))
      .filter((item) => item.draftObjectiveCount > 0)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
  };
}

function buildKrItem(record: OkrRecord, notes: ProgressNote[], now: Date): ActionCenterKr {
  const relevantNotes = notes.filter((note) =>
    note.team === record.team && (note.objectiveId === record.okr_id || note.objectiveId === record.parent_id)
  );
  const timestamps = [record.last_update, ...relevantNotes.map((note) => note.updatedAt)]
    .map(parseTimestamp)
    .filter((value): value is number => value !== null);
  const latestTimestamp = timestamps.length > 0 ? Math.max(...timestamps) : null;

  return {
    record,
    lastActivityAt: latestTimestamp === null ? "" : new Date(latestTimestamp).toISOString(),
    isStale: latestTimestamp === null || now.getTime() - latestTimestamp > staleAfterMs
  };
}

function compareKrs(left: ActionCenterKr, right: ActionCenterKr) {
  return left.record.team.localeCompare(right.record.team) || left.record.okr_id.localeCompare(right.record.okr_id);
}

function compareOldestActivity(left: ActionCenterKr, right: ActionCenterKr) {
  if (!left.lastActivityAt) return -1;
  if (!right.lastActivityAt) return 1;
  return left.lastActivityAt.localeCompare(right.lastActivityAt);
}

function compareAttention(left: ActionCenterKr, right: ActionCenterKr) {
  return confidencePriority(right.record.confidence) - confidencePriority(left.record.confidence) || compareKrs(left, right);
}

function confidencePriority(confidence: OkrRecord["confidence"]) {
  return confidence === "Red" ? 2 : confidence === "Yellow" ? 1 : 0;
}

function parseTimestamp(value: string) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function normalizeToken(value: string) {
  return value.trim().toLowerCase();
}

function normalizeDate(value: string) {
  const timestamp = parseTimestamp(value);
  return timestamp === null ? "" : new Date(timestamp).toISOString();
}

function parsePeriodStart(periodId: string) {
  const match = /^(\d{4})-q([1-4])$/i.exec(periodId.trim());
  if (!match) return null;
  return Date.UTC(Number(match[1]), (Number(match[2]) - 1) * 3, 1);
}

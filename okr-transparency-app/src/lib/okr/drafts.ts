import { promises as fs } from "fs";
import path from "path";
import { draftToRecords, filterDraftByOwner, normalizeDraft, recordsToDraft, validateDraft, type OkrDraft } from "./edit-types";
import { readOkrSnapshot, readOkrSnapshotState, writeOkrSnapshot } from "./store";
import type { OkrSnapshot } from "./types";
import { documentIdFromParts } from "../storage/document-ids";
import { readFirestoreDocument, writeFirestoreDocument } from "../storage/firestore";
import { isFirestoreStorageEnabled } from "../storage/mode";
import { readAdminConfig } from "../admin/config";
import { validateOkrGraph, validateOkrRecordQuality } from "./graph-validation";
import { readSnapshotVersion, writeSnapshotVersion } from "./snapshot-versions";

const dataDir = path.join(process.cwd(), "data");
const draftPath = path.join(dataDir, "okr-drafts.json");
const periodSnapshotPath = path.join(dataDir, "okr-period-snapshots.json");

type DraftFile = {
  version: 1;
  drafts: OkrDraft[];
};

type PeriodSnapshotFile = {
  version: 1;
  periods: Array<{
    periodId: string;
    updatedAt: string;
    records: OkrSnapshot["records"];
  }>;
};

export async function readDraft(team: string, periodId: string): Promise<OkrDraft> {
  if (isFirestoreStorageEnabled()) {
    const existing = await readFirestoreDocument<OkrDraft>(draftDocumentPath(team, periodId));
    if (existing) return existing;

    const periodRecords = await readPeriodRecords(periodId);
    if (periodRecords) return recordsToDraft(periodRecords, team, periodId);

    const snapshot = await readOkrSnapshot();
    return recordsToDraft(snapshot.records, team, periodId, periodId === await getDefaultPeriodId());
  }

  const file = await readDraftFile();
  const existing = file.drafts.find((draft) => draft.team === team && draft.periodId === periodId);
  if (existing) return existing;

  const periodRecords = await readPeriodRecords(periodId);
  if (periodRecords) return recordsToDraft(periodRecords, team, periodId);

  const snapshot = await readOkrSnapshot();
  return recordsToDraft(snapshot.records, team, periodId, periodId === await getDefaultPeriodId());
}

export async function writeDraft(draft: OkrDraft, teamOwner = draft.team, forceOwner = true) {
  const normalizedDraft = normalizeDraft(draft, teamOwner, forceOwner);
  const nextDraft: OkrDraft = {
    ...normalizedDraft,
    updatedAt: new Date().toISOString(),
    objectives: normalizedDraft.objectives.map((objective) => ({ ...objective, status: "draft" }))
  };

  if (isFirestoreStorageEnabled()) {
    await writeFirestoreDocument(draftDocumentPath(draft.team, draft.periodId), nextDraft);
    return nextDraft;
  }

  const file = await readDraftFile();
  const index = file.drafts.findIndex((item) => item.team === draft.team && item.periodId === draft.periodId);
  const drafts = index >= 0
    ? file.drafts.map((item, itemIndex) => itemIndex === index ? nextDraft : item)
    : [...file.drafts, nextDraft];

  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(draftPath, JSON.stringify({ version: 1, drafts }, null, 2), "utf8");
  return nextDraft;
}

export async function writeOwnerScopedDraft(draft: OkrDraft, owner: string, ownerAliases: string[]) {
  const current = await readDraft(draft.team, draft.periodId);
  const normalizedScope = normalizeDraft(draft, owner, true);
  const nextDraft: OkrDraft = {
    ...current,
    updatedAt: new Date().toISOString(),
    objectives: [
      ...current.objectives.filter((objective) => !draftObjectiveMatchesOwner(objective, ownerAliases)),
      ...normalizedScope.objectives.map((objective) => ({ ...objective, status: "draft" as const }))
    ]
  };

  return writeDraft(nextDraft, owner, false);
}

export async function publishDraft(team: string, periodId: string, teamOwner = team, ownerScope?: { owner: string; aliases: string[] }, actor = teamOwner): Promise<{ snapshot: OkrSnapshot; errors: string[]; warnings: string[] }> {
  const draft = await readDraft(team, periodId);
  const publishableDraft = ownerScope ? filterDraftByOwner(draft, ownerScope.aliases, ownerScope.owner) : draft;
  const validation = validateDraft(publishableDraft);
  if (validation.errors.length > 0) {
    return { snapshot: await readOkrSnapshot(), ...validation };
  }

  const normalizedDraft = normalizeDraft(publishableDraft, ownerScope?.owner ?? teamOwner, true);
  const defaultPeriodId = await getDefaultPeriodId();
  const currentState = await readOkrSnapshotState();
  const current = currentState.snapshot;
  const publishedRecords = draftToRecords({
    ...normalizedDraft,
    objectives: normalizedDraft.objectives.map((objective) => ({ ...objective, status: "published" }))
  }, ownerScope?.owner ?? teamOwner, true);
  const removePublishedRecord = ownerScope
    ? (record: OkrSnapshot["records"][number]) => record.team === team && ownerMatches(record.owner, ownerScope.aliases) && draft.periodId === defaultPeriodId
    : (record: OkrSnapshot["records"][number]) => record.team === team && draft.periodId === defaultPeriodId;
  const nextRecords = [
    ...current.records.filter((record) => !removePublishedRecord(record)),
    ...publishedRecords
  ];
  const snapshot: OkrSnapshot = {
    version: 1,
    meta: {
      status: "ok",
      source: "snapshot",
      lastSyncedAt: new Date().toISOString(),
      message: `Published ${team} OKR from page editor`,
      rowCount: nextRecords.length
    },
    records: nextRecords
  };
  const currentPeriodRecords = await readPeriodRecords(periodId) ?? [];
  const nextPeriodRecords = [
    ...currentPeriodRecords.filter((record) =>
      ownerScope
        ? !(record.team === team && ownerMatches(record.owner, ownerScope.aliases))
        : record.team !== team
    ),
    ...publishedRecords
  ];
  const graphValidation = validateOkrGraph(periodId === defaultPeriodId ? nextRecords : nextPeriodRecords);
  const qualityValidation = validateOkrRecordQuality(publishedRecords);
  if (graphValidation.errors.length > 0 || qualityValidation.errors.length > 0) {
    return {
      snapshot: current,
      errors: [...graphValidation.errors, ...qualityValidation.errors],
      warnings: [...validation.warnings, ...graphValidation.warnings, ...qualityValidation.warnings]
    };
  }

  await writeSnapshotVersion({
    periodId,
    team,
    actor,
    records: currentPeriodRecords.filter((record) => record.team === team)
  });
  if (periodId === defaultPeriodId) {
    await writeOkrSnapshot(snapshot, currentState.revision);
  }
  await writePeriodRecords(periodId, nextPeriodRecords);
  await writeDraft({
    ...draft,
    objectives: [
      ...(ownerScope ? draft.objectives.filter((objective) => !draftObjectiveMatchesOwner(objective, ownerScope.aliases)) : []),
      ...normalizedDraft.objectives.map((objective) => ({ ...objective, status: "published" as const }))
    ]
  }, ownerScope?.owner ?? teamOwner, false);

  return { snapshot, ...validation };
}

export async function rollbackTeamVersion(versionId: string) {
  const version = await readSnapshotVersion(versionId);
  if (!version) throw new Error("Snapshot version not found");

  const config = await readAdminConfig();
  const currentPeriodRecords = await readPeriodRecords(version.periodId) ?? [];
  const nextPeriodRecords = [
    ...currentPeriodRecords.filter((record) => record.team !== version.team),
    ...version.records
  ];
  const validation = validateOkrGraph(nextPeriodRecords);
  if (validation.errors.length > 0) throw new Error(validation.errors[0]);

  if (version.periodId === config.defaultPeriodId) {
    const currentState = await readOkrSnapshotState();
    const nextRecords = [
      ...currentState.snapshot.records.filter((record) => record.team !== version.team),
      ...version.records
    ];
    const currentValidation = validateOkrGraph(nextRecords);
    if (currentValidation.errors.length > 0) throw new Error(currentValidation.errors[0]);
    await writeOkrSnapshot({
      version: 1,
      meta: {
        status: "ok",
        source: "snapshot",
        lastSyncedAt: new Date().toISOString(),
        message: `Rolled back ${version.team} ${version.periodId}`,
        rowCount: nextRecords.length
      },
      records: nextRecords
    }, currentState.revision);
  }

  await writePeriodRecords(version.periodId, nextPeriodRecords);
  return version;
}

export async function updatePublishedRecordProgress(input: {
  periodId: string;
  team: string;
  recordId: string;
  actual?: string;
  progress?: number | null;
  confidence?: OkrSnapshot["records"][number]["confidence"];
  risks?: string;
  actor: string;
}) {
  const config = await readAdminConfig();
  const currentPeriodRecords = await readPeriodRecords(input.periodId) ?? [];
  const currentRecord = currentPeriodRecords.find((record) => record.okr_id === input.recordId && record.team === input.team);
  if (!currentRecord) throw new Error("Published OKR record not found");
  if (!currentRecord.kr) throw new Error("Progress values must be updated on a KR");
  if (input.progress !== undefined && input.progress !== null && (!Number.isFinite(input.progress) || input.progress < 0 || input.progress > 100)) {
    throw new Error("Progress must be between 0 and 100");
  }

  const today = new Date().toISOString().slice(0, 10);
  const updateRecord = (record: OkrSnapshot["records"][number]) => record.okr_id === input.recordId ? {
    ...record,
    actual: input.actual !== undefined ? input.actual.trim() : record.actual,
    score: input.progress !== undefined ? (input.progress === null ? null : input.progress / 100) : record.score,
    confidence: input.confidence ?? record.confidence,
    risks: input.risks !== undefined ? input.risks.trim() : record.risks,
    last_update: today
  } : record;
  const nextPeriodRecords = currentPeriodRecords.map(updateRecord);
  const validation = validateOkrGraph(nextPeriodRecords);
  if (validation.errors.length > 0) throw new Error(validation.errors[0]);

  await writeSnapshotVersion({
    periodId: input.periodId,
    team: input.team,
    actor: input.actor,
    records: currentPeriodRecords.filter((record) => record.team === input.team)
  });

  if (input.periodId === config.defaultPeriodId) {
    const currentState = await readOkrSnapshotState();
    const nextRecords = currentState.snapshot.records.map(updateRecord);
    await writeOkrSnapshot({
      version: 1,
      meta: {
        status: "ok",
        source: "snapshot",
        lastSyncedAt: new Date().toISOString(),
        message: `Updated ${input.recordId} progress`,
        rowCount: nextRecords.length
      },
      records: nextRecords
    }, currentState.revision);
  }
  await writePeriodRecords(input.periodId, nextPeriodRecords);
}

async function getDefaultPeriodId() {
  return (await readAdminConfig()).defaultPeriodId;
}

export async function readPeriodRecords(periodId: string) {
  if (isFirestoreStorageEnabled()) {
    const period = await readFirestoreDocument<PeriodSnapshotFile["periods"][number]>(periodDocumentPath(periodId));
    return period?.records ?? null;
  }

  const file = await readPeriodSnapshotFile();
  return file.periods.find((period) => period.periodId === periodId)?.records ?? null;
}

async function readDraftFile(): Promise<DraftFile> {
  try {
    const text = await fs.readFile(draftPath, "utf8");
    const parsed = JSON.parse(text) as DraftFile;
    return Array.isArray(parsed.drafts) ? parsed : { version: 1, drafts: [] };
  } catch {
    return { version: 1, drafts: [] };
  }
}

async function readPeriodSnapshotFile(): Promise<PeriodSnapshotFile> {
  try {
    const text = await fs.readFile(periodSnapshotPath, "utf8");
    const parsed = JSON.parse(text) as PeriodSnapshotFile;
    return Array.isArray(parsed.periods) ? parsed : { version: 1, periods: [] };
  } catch {
    return { version: 1, periods: [] };
  }
}

export async function writePeriodRecords(periodId: string, records: OkrSnapshot["records"]) {
  if (isFirestoreStorageEnabled()) {
    await writeFirestoreDocument(periodDocumentPath(periodId), {
      periodId,
      updatedAt: new Date().toISOString(),
      records
    });
    return;
  }

  const file = await readPeriodSnapshotFile();
  const nextPeriod = { periodId, updatedAt: new Date().toISOString(), records };
  const index = file.periods.findIndex((period) => period.periodId === periodId);
  const periods = index >= 0
    ? file.periods.map((period, periodIndex) => periodIndex === index ? nextPeriod : period)
    : [...file.periods, nextPeriod];

  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(periodSnapshotPath, JSON.stringify({ version: 1, periods }, null, 2), "utf8");
}

function draftDocumentPath(team: string, periodId: string) {
  return `okrDrafts/${documentIdFromParts([periodId, team])}`;
}

function periodDocumentPath(periodId: string) {
  return `okrPeriodSnapshots/${documentIdFromParts([periodId])}`;
}

function draftObjectiveMatchesOwner(objective: OkrDraft["objectives"][number], ownerAliases: string[]) {
  return ownerMatches(objective.owner, ownerAliases) || objective.keyResults.some((kr) => ownerMatches(kr.owner, ownerAliases));
}

function ownerMatches(owner: string, aliases: string[]) {
  const normalizedOwner = normalizeToken(owner);
  return Boolean(normalizedOwner) && aliases.some((alias) => normalizeToken(alias) === normalizedOwner);
}

function normalizeToken(value: string) {
  return value.trim().toLowerCase();
}

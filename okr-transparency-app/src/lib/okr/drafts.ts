import { promises as fs } from "fs";
import path from "path";
import { draftToRecords, filterDraftByOwner, normalizeDraft, recordsToDraft, validateDraft, type OkrDraft } from "./edit-types";
import { readOkrSnapshot, writeOkrSnapshot } from "./store";
import type { OkrSnapshot } from "./types";
import { documentIdFromParts } from "../storage/document-ids";
import { readFirestoreDocument, writeFirestoreDocument } from "../storage/firestore";
import { isFirestoreStorageEnabled } from "../storage/mode";

const dataDir = path.join(process.cwd(), "data");
const draftPath = path.join(dataDir, "okr-drafts.json");
const periodSnapshotPath = path.join(dataDir, "okr-period-snapshots.json");
const defaultEditablePeriod = "2026-q3";

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
    return recordsToDraft(snapshot.records, team, periodId, periodId === defaultEditablePeriod);
  }

  const file = await readDraftFile();
  const existing = file.drafts.find((draft) => draft.team === team && draft.periodId === periodId);
  if (existing) return existing;

  const periodRecords = await readPeriodRecords(periodId);
  if (periodRecords) return recordsToDraft(periodRecords, team, periodId);

  const snapshot = await readOkrSnapshot();
  return recordsToDraft(snapshot.records, team, periodId, periodId === defaultEditablePeriod);
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

export async function publishDraft(team: string, periodId: string, teamOwner = team, ownerScope?: { owner: string; aliases: string[] }): Promise<{ snapshot: OkrSnapshot; errors: string[]; warnings: string[] }> {
  const draft = await readDraft(team, periodId);
  const publishableDraft = ownerScope ? filterDraftByOwner(draft, ownerScope.aliases, ownerScope.owner) : draft;
  const validation = validateDraft(publishableDraft);
  if (validation.errors.length > 0) {
    return { snapshot: await readOkrSnapshot(), ...validation };
  }

  const normalizedDraft = normalizeDraft(publishableDraft, ownerScope?.owner ?? teamOwner, true);
  const current = await readOkrSnapshot();
  const publishedRecords = draftToRecords({
    ...normalizedDraft,
    objectives: normalizedDraft.objectives.map((objective) => ({ ...objective, status: "published" }))
  }, ownerScope?.owner ?? teamOwner, true);
  const removePublishedRecord = ownerScope
    ? (record: OkrSnapshot["records"][number]) => record.team === team && ownerMatches(record.owner, ownerScope.aliases) && draft.periodId === defaultEditablePeriod
    : (record: OkrSnapshot["records"][number]) => record.team === team && draft.periodId === defaultEditablePeriod;
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

  await writePeriodRecords(periodId, [
    ...(await readPeriodRecords(periodId) ?? []).filter((record) =>
      ownerScope
        ? !(record.team === team && ownerMatches(record.owner, ownerScope.aliases))
        : record.team !== team
    ),
    ...publishedRecords
  ]);
  if (periodId === defaultEditablePeriod) {
    await writeOkrSnapshot(snapshot);
  }
  await writeDraft({
    ...draft,
    objectives: [
      ...(ownerScope ? draft.objectives.filter((objective) => !draftObjectiveMatchesOwner(objective, ownerScope.aliases)) : []),
      ...normalizedDraft.objectives.map((objective) => ({ ...objective, status: "published" as const }))
    ]
  }, ownerScope?.owner ?? teamOwner, false);

  return { snapshot, ...validation };
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

async function writePeriodRecords(periodId: string, records: OkrSnapshot["records"]) {
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

import { promises as fs } from "fs";
import path from "path";
import { draftToRecords, normalizeDraft, recordsToDraft, validateDraft, type OkrDraft } from "./edit-types";
import { readOkrSnapshot, writeOkrSnapshot } from "./store";
import type { OkrSnapshot } from "./types";

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
  const file = await readDraftFile();
  const existing = file.drafts.find((draft) => draft.team === team && draft.periodId === periodId);
  if (existing) return existing;

  const periodRecords = await readPeriodRecords(periodId);
  if (periodRecords) return recordsToDraft(periodRecords, team, periodId);

  const snapshot = await readOkrSnapshot();
  return recordsToDraft(snapshot.records, team, periodId, periodId === defaultEditablePeriod);
}

export async function writeDraft(draft: OkrDraft, teamOwner = draft.team, forceOwner = true) {
  const file = await readDraftFile();
  const normalizedDraft = normalizeDraft(draft, teamOwner, forceOwner);
  const nextDraft: OkrDraft = {
    ...normalizedDraft,
    updatedAt: new Date().toISOString(),
    objectives: normalizedDraft.objectives.map((objective) => ({ ...objective, status: "draft" }))
  };
  const index = file.drafts.findIndex((item) => item.team === draft.team && item.periodId === draft.periodId);
  const drafts = index >= 0
    ? file.drafts.map((item, itemIndex) => itemIndex === index ? nextDraft : item)
    : [...file.drafts, nextDraft];

  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(draftPath, JSON.stringify({ version: 1, drafts }, null, 2), "utf8");
  return nextDraft;
}

export async function publishDraft(team: string, periodId: string, teamOwner = team): Promise<{ snapshot: OkrSnapshot; errors: string[]; warnings: string[] }> {
  const draft = await readDraft(team, periodId);
  const validation = validateDraft(draft);
  if (validation.errors.length > 0) {
    return { snapshot: await readOkrSnapshot(), ...validation };
  }

  const normalizedDraft = normalizeDraft(draft, teamOwner, false);
  const current = await readOkrSnapshot();
  const publishedRecords = draftToRecords({
    ...normalizedDraft,
    objectives: normalizedDraft.objectives.map((objective) => ({ ...objective, status: "published" }))
  }, teamOwner, false);
  const nextRecords = [
    ...current.records.filter((record) => record.team !== team || draft.periodId !== defaultEditablePeriod),
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
    ...(await readPeriodRecords(periodId) ?? []).filter((record) => record.team !== team),
    ...publishedRecords
  ]);
  if (periodId === defaultEditablePeriod) {
    await writeOkrSnapshot(snapshot);
  }
  await writeDraft({
    ...normalizedDraft,
    objectives: normalizedDraft.objectives.map((objective) => ({ ...objective, status: "published" }))
  }, teamOwner, false);

  return { snapshot, ...validation };
}

export async function readPeriodRecords(periodId: string) {
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
  const file = await readPeriodSnapshotFile();
  const nextPeriod = { periodId, updatedAt: new Date().toISOString(), records };
  const index = file.periods.findIndex((period) => period.periodId === periodId);
  const periods = index >= 0
    ? file.periods.map((period, periodIndex) => periodIndex === index ? nextPeriod : period)
    : [...file.periods, nextPeriod];

  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(periodSnapshotPath, JSON.stringify({ version: 1, periods }, null, 2), "utf8");
}

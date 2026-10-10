import { createHash } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { draftToRecords, filterDraftByOwner, mergeDraftByOwner, normalizeDraft, recordsToDraft, validateDraft, type OkrDraft } from "./edit-types";
import { readOkrSnapshotState, SnapshotConflictError, writeOkrSnapshot } from "./store";
import type { OkrRecord, OkrSnapshot } from "./types";
import { documentIdFromParts } from "../storage/document-ids";
import { FirestorePreconditionError, listFirestoreCollection, readFirestoreDocument, readFirestoreDocumentWithMetadata, writeFirestoreDocument } from "../storage/firestore";
import { isFirestoreStorageEnabled } from "../storage/mode";
import { readAdminConfig, type AdminConfig } from "../admin/config";
import { adminTeamNameCandidates, resolveAdminTeamName } from "../admin/team-rename";
import { validateOkrGraph, validateOkrRecordQuality } from "./graph-validation";
import { buildPublicationCandidate } from "./publication-candidate";
import { readSnapshotVersion, writeSnapshotVersion } from "./snapshot-versions";
import { canonicalOwnerName } from "../team-names";
import type { OkrOwnerScope } from "./owner-scope";
import { writeAppLog } from "../app-log";

const dataDir = path.join(process.cwd(), "data");
const draftPath = path.join(dataDir, "okr-drafts.json");
const periodSnapshotPath = path.join(dataDir, "okr-period-snapshots.json");
const snapshotWriteAttempts = 6;

// Writers that lose a race together would retry together and collide again —
// a quarter's kickoff has many teams publishing at once. A short random pause,
// growing with each attempt, lets them land one after another.
function pauseBeforeRetry(attempt: number) {
  return new Promise((resolve) => setTimeout(resolve, Math.random() * 60 * attempt));
}

type DraftFile = {
  version: 1;
  drafts: OkrDraft[];
};

type StoredPeriodSnapshot = {
  periodId: string;
  updatedAt: string;
  records: OkrRecord[];
  /** Written by a build that treats this document as the period's source of truth. */
  authoritative?: true;
};

type PeriodSnapshotFile = {
  version: 1;
  periods: StoredPeriodSnapshot[];
};

type PeriodSnapshotState = {
  records: OkrRecord[] | null;
  updatedAt: string | null;
  /** Lock token for `writePeriodRecords`; "missing" means nothing has been stored yet. */
  revision: string;
};

export async function readDraft(team: string, periodId: string): Promise<OkrDraft> {
  const config = await readAdminConfig();
  const resolvedTeam = resolveAdminTeamName(config, team);
  const teamCandidates = adminTeamNameCandidates(config, resolvedTeam);
  if (isFirestoreStorageEnabled()) {
    for (const candidate of teamCandidates) {
      const existing = await readFirestoreDocument<OkrDraft>(draftDocumentPath(candidate, periodId));
      if (existing) return canonicalizeDraft(existing, resolvedTeam);
    }
  } else {
    const file = await readDraftFile();
    const acceptedTeams = new Set(teamCandidates);
    const existing = file.drafts.find((draft) => acceptedTeams.has(draft.team) && draft.periodId === periodId);
    if (existing) return canonicalizeDraft(existing, resolvedTeam);
  }

  // A period nobody has published into starts blank. Seeding it from another
  // period's records would carry last quarter's objectives, ids included, into
  // this quarter's draft.
  return recordsToDraft(await readPeriodRecords(periodId) ?? [], resolvedTeam, periodId);
}

export async function writeDraft(draft: OkrDraft, teamOwner = draft.team, forceOwner = true, preserveStatus = false) {
  const normalizedDraft = normalizeDraft(draft, teamOwner, forceOwner);
  const nextDraft: OkrDraft = {
    ...normalizedDraft,
    updatedAt: new Date().toISOString(),
    objectives: preserveStatus
      ? normalizedDraft.objectives
      : normalizedDraft.objectives.map((objective) => ({ ...objective, status: "draft" }))
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

export async function writeOwnerScopedDraft(draft: OkrDraft, ownerScope: OkrOwnerScope) {
  const current = await readDraft(draft.team, draft.periodId);
  const nextDraft: OkrDraft = {
    ...mergeDraftByOwner(current, draft, ownerScope.owner, ownerScope.aliases, "draft", ownerScope),
    updatedAt: new Date().toISOString(),
  };

  return writeDraft(nextDraft, ownerScope.owner, false, true);
}

export async function publishDraft(team: string, periodId: string, teamOwner = team, ownerScope?: OkrOwnerScope, actor = teamOwner): Promise<{ snapshot: OkrSnapshot; errors: string[]; warnings: string[] }> {
  const draft = await readDraft(team, periodId);
  const publishableDraft = ownerScope ? filterDraftByOwner(draft, ownerScope.aliases, ownerScope.owner, ownerScope) : draft;
  const validation = validateDraft(publishableDraft);
  if (validation.errors.length > 0) {
    return { snapshot: await readPeriodSnapshot(periodId), ...validation };
  }

  const normalizedDraft = normalizeDraft(publishableDraft, ownerScope?.owner ?? teamOwner, true);
  const publishedRecords = draftToRecords({
    ...normalizedDraft,
    objectives: normalizedDraft.objectives.map((objective) => ({ ...objective, status: "published" }))
  }, ownerScope?.owner ?? teamOwner, true);

  // Every team publishes into the period's one shared snapshot document, so
  // simultaneous publishes from unrelated teams collide on its optimistic lock.
  // Rebuilding the candidate against freshly read records and retrying keeps
  // that collision invisible instead of asking the user to republish.
  for (let attempt = 1; ; attempt += 1) {
    const currentState = await readPeriodSnapshotState(periodId);
    const currentRecords = currentState.records ?? [];
    const candidate = buildPublicationCandidate(currentRecords, publishedRecords, {
      team,
      ownerAliases: ownerScope?.aliases,
      objectiveScope: ownerScope?.objectiveScope,
      ownerEmail: ownerScope?.ownerEmail
    });
    const nextPeriodRecords = candidate.records;
    const message = `Published ${team} OKR from page editor`;
    const graphValidation = validateOkrGraph(nextPeriodRecords);
    const qualityValidation = validateOkrRecordQuality(publishedRecords);
    if (graphValidation.errors.length > 0 || qualityValidation.errors.length > 0) {
      return {
        snapshot: buildPeriodSnapshot(periodId, currentRecords, currentState.updatedAt ?? new Date().toISOString(), "Publish rejected"),
        errors: [...graphValidation.errors, ...qualityValidation.errors],
        warnings: [...validation.warnings, ...candidate.warnings, ...graphValidation.warnings, ...qualityValidation.warnings]
      };
    }

    try {
      await writePeriodRecords(periodId, nextPeriodRecords, currentState.revision);
    } catch (error) {
      if (error instanceof SnapshotConflictError && attempt < snapshotWriteAttempts) {
        await pauseBeforeRetry(attempt);
        continue;
      }
      throw error;
    }

    // Recorded only once the snapshot write has landed, so a lost race cannot
    // leave a restore point for a publish that never happened.
    await writeSnapshotVersion({
      periodId,
      team,
      actor,
      records: currentRecords.filter((record) => record.team === team)
    });
    await mirrorDefaultPeriodSnapshot(periodId, nextPeriodRecords, message);
    await writeDraft({
      ...(ownerScope
        ? mergeDraftByOwner(draft, normalizedDraft, ownerScope.owner, ownerScope.aliases, "published", ownerScope)
        : {
            ...draft,
            objectives: normalizedDraft.objectives.map((objective) => ({ ...objective, status: "published" as const }))
          })
    }, ownerScope?.owner ?? teamOwner, false, true);

    return {
      snapshot: buildPeriodSnapshot(periodId, nextPeriodRecords, new Date().toISOString(), message),
      errors: [],
      warnings: [...validation.warnings, ...candidate.warnings, ...graphValidation.warnings, ...qualityValidation.warnings]
    };
  }
}

export async function rollbackTeamVersion(versionId: string) {
  const version = await readSnapshotVersion(versionId);
  if (!version) throw new Error("Snapshot version not found");

  for (let attempt = 1; ; attempt += 1) {
    const currentState = await readPeriodSnapshotState(version.periodId);
    const nextPeriodRecords = [
      ...(currentState.records ?? []).filter((record) => record.team !== version.team),
      ...version.records
    ];
    const validation = validateOkrGraph(nextPeriodRecords);
    if (validation.errors.length > 0) throw new Error(validation.errors[0]);

    try {
      await writePeriodRecords(version.periodId, nextPeriodRecords, currentState.revision);
    } catch (error) {
      if (error instanceof SnapshotConflictError && attempt < snapshotWriteAttempts) {
        await pauseBeforeRetry(attempt);
        continue;
      }
      throw error;
    }

    await mirrorDefaultPeriodSnapshot(version.periodId, nextPeriodRecords, `Rolled back ${version.team} ${version.periodId}`);
    return version;
  }
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

  // Weekly check-ins land in bursts around review meetings and contend for the
  // same snapshot lock as publishing, so re-read and retry rather than making
  // the reviewer re-enter their numbers.
  for (let attempt = 1; ; attempt += 1) {
    const currentState = await readPeriodSnapshotState(input.periodId);
    const currentPeriodRecords = currentState.records ?? [];
    const currentRecord = currentPeriodRecords.find((record) => record.okr_id === input.recordId && record.team === input.team);
    if (!currentRecord) throw new Error("Published OKR record not found");
    if (!currentRecord.kr) throw new Error("Progress values must be updated on a KR");

    const nextPeriodRecords = currentPeriodRecords.map(updateRecord);
    const validation = validateOkrGraph(nextPeriodRecords);
    if (validation.errors.length > 0) throw new Error(validation.errors[0]);

    try {
      await writePeriodRecords(input.periodId, nextPeriodRecords, currentState.revision);
    } catch (error) {
      if (error instanceof SnapshotConflictError && attempt < snapshotWriteAttempts) {
        await pauseBeforeRetry(attempt);
        continue;
      }
      throw error;
    }

    await writeSnapshotVersion({
      periodId: input.periodId,
      team: input.team,
      actor: input.actor,
      records: currentPeriodRecords.filter((record) => record.team === input.team)
    });
    await mirrorDefaultPeriodSnapshot(input.periodId, nextPeriodRecords, `Updated ${input.recordId} progress`);
    return;
  }
}

/**
 * Period snapshots are the only source of a period's records, the default
 * period included. `okrSnapshots/current` carries no period of its own, so
 * reading it as "the default period" serves the wrong quarter the moment the
 * default moves on.
 */
export async function readPeriodRecords(periodId: string) {
  return (await readPeriodSnapshotState(periodId)).records;
}

export async function readPeriodSnapshot(periodId: string): Promise<OkrSnapshot> {
  const state = await readPeriodSnapshotState(periodId);
  return buildPeriodSnapshot(periodId, state.records ?? [], state.updatedAt ?? new Date().toISOString(), `Period ${periodId}`);
}

async function readPeriodSnapshotState(periodId: string): Promise<PeriodSnapshotState> {
  const config = await readAdminConfig();
  const { stored, revision } = isFirestoreStorageEnabled()
    ? await readFirestorePeriodSnapshot(periodId)
    : await readFilePeriodSnapshot(periodId);

  if (stored) {
    const records = stored.authoritative
      ? stored.records
      : await readOldBuildCurrentRecords(periodId, config) ?? stored.records;
    return {
      records: records.map((record) => canonicalizeRecord(record, config)),
      updatedAt: stored.updatedAt,
      revision
    };
  }

  // Deployments older than period snapshots kept the default period only in
  // `current`. Once any period snapshot exists that cannot be the case, and a
  // period without one is simply empty.
  const legacyRecords = await anyPeriodSnapshotStored() ? null : await readOldBuildCurrentRecords(periodId, config);
  return {
    records: legacyRecords?.map((record) => canonicalizeRecord(record, config)) ?? null,
    updatedAt: null,
    revision
  };
}

async function readFirestorePeriodSnapshot(periodId: string) {
  const result = await readFirestoreDocumentWithMetadata<StoredPeriodSnapshot>(periodDocumentPath(periodId));
  return { stored: result?.value ?? null, revision: result?.updateTime ?? "missing" };
}

async function readFilePeriodSnapshot(periodId: string) {
  const { file, revision } = await readPeriodSnapshotFileState();
  return { stored: file.periods.find((period) => period.periodId === periodId) ?? null, revision };
}

/**
 * Earlier builds treated `okrSnapshots/current` as the default period's source
 * of truth and rewrote its period snapshot afterwards without a lock, so under
 * concurrent check-ins the period snapshot can have lost an update that
 * `current` kept. Until this build first writes the period (marking it
 * authoritative), the old build's `current` is the better copy. It is
 * recognisable by carrying no period stamp, and it can only describe the
 * default period: the old build wrote it for nothing else.
 */
async function readOldBuildCurrentRecords(periodId: string, config: AdminConfig) {
  if (periodId !== config.defaultPeriodId) return null;
  const { snapshot, revision } = await readOkrSnapshotState();
  if (revision === "missing" || snapshot.meta.periodId) return null;
  return snapshot.records;
}

async function anyPeriodSnapshotStored() {
  if (isFirestoreStorageEnabled()) return (await listFirestoreCollection("okrPeriodSnapshots", 1)).length > 0;
  return (await readPeriodSnapshotFileState()).file.periods.length > 0;
}

/**
 * This build reads `okrSnapshots/current` only to take over from an older build
 * (see `readOldBuildCurrentRecords`); it is kept in step with the default
 * period so that rolling back to a build that still reads it shows today's
 * data. The period stamp marks it as a mirror. A failed write must not fail a
 * change that has already landed in the period snapshot.
 */
async function mirrorDefaultPeriodSnapshot(periodId: string, records: OkrRecord[], message: string) {
  if (periodId !== (await readAdminConfig()).defaultPeriodId) return;
  try {
    await writeOkrSnapshot(buildPeriodSnapshot(periodId, records, new Date().toISOString(), message));
  } catch (error) {
    await writeAppLog({
      level: "warn",
      scope: "okr",
      event: "current_snapshot_mirror_failed",
      message: "Could not mirror the default period into okrSnapshots/current",
      details: { periodId, error: error instanceof Error ? error.message : String(error) }
    });
  }
}

function buildPeriodSnapshot(periodId: string, records: OkrRecord[], lastSyncedAt: string, message: string): OkrSnapshot {
  return {
    version: 1,
    meta: {
      status: records.length > 0 ? "ok" : "empty",
      source: "snapshot",
      lastSyncedAt,
      message,
      rowCount: records.length,
      periodId
    },
    records
  };
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

/**
 * Every period shares one local file, so its lock token covers the whole file:
 * a write to any period invalidates readers of all of them. That only costs a
 * retry, and it is what keeps the read-modify-write of the file from losing
 * another period's update. The token is the content itself — a check-in can
 * change a digit without changing the size, inside one timestamp tick.
 */
async function readPeriodSnapshotFileState(): Promise<{ file: PeriodSnapshotFile; revision: string }> {
  try {
    const text = await fs.readFile(periodSnapshotPath, "utf8");
    const parsed = JSON.parse(text) as PeriodSnapshotFile;
    return {
      file: Array.isArray(parsed.periods) ? parsed : { version: 1, periods: [] },
      revision: createHash("sha1").update(text).digest("hex")
    };
  } catch {
    return { file: { version: 1, periods: [] }, revision: "missing" };
  }
}

// Requests overlap inside one server process. Without a queue, two writers can
// both pass the revision check and then interleave their writes, leaving the
// file with one write's tail after the other's end.
let periodFileWrites: Promise<unknown> = Promise.resolve();

function serializePeriodFileWrite(write: () => Promise<void>) {
  const next = periodFileWrites.then(write, write);
  periodFileWrites = next.catch(() => undefined);
  return next;
}

/**
 * Pass the `revision` read alongside the records being replaced; the write is
 * refused with `SnapshotConflictError` if anyone else wrote the period since.
 */
export async function writePeriodRecords(periodId: string, records: OkrRecord[], expectedRevision?: string) {
  const nextPeriod: StoredPeriodSnapshot = { periodId, updatedAt: new Date().toISOString(), records, authoritative: true };
  if (isFirestoreStorageEnabled()) {
    try {
      await writeFirestoreDocument(periodDocumentPath(periodId), nextPeriod, expectedRevision === "missing"
        ? { exists: false }
        : expectedRevision ? { updateTime: expectedRevision } : {});
    } catch (error) {
      if (error instanceof FirestorePreconditionError) throw new SnapshotConflictError();
      throw error;
    }
    return;
  }

  await serializePeriodFileWrite(async () => {
    const { file, revision } = await readPeriodSnapshotFileState();
    if (expectedRevision && revision !== expectedRevision) throw new SnapshotConflictError();
    const index = file.periods.findIndex((period) => period.periodId === periodId);
    const periods = index >= 0
      ? file.periods.map((period, periodIndex) => periodIndex === index ? nextPeriod : period)
      : [...file.periods, nextPeriod];

    // Readers do not queue, and a file rewritten in place is empty for a moment.
    // Replacing it whole means a reader sees either the old version or the new.
    const temporaryPath = `${periodSnapshotPath}.${process.pid}-${Date.now().toString(36)}.tmp`;
    await fs.mkdir(dataDir, { recursive: true });
    await fs.writeFile(temporaryPath, JSON.stringify({ version: 1, periods }, null, 2), "utf8");
    await replaceFile(temporaryPath, periodSnapshotPath);
  });
}

/**
 * Windows refuses to replace a file for a moment while another request is
 * reading it or a virus scanner holds it, so those refusals are waited out
 * rather than failing the write.
 */
async function replaceFile(from: string, to: string) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      await fs.rename(from, to);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code ?? "";
      if (attempt < 20 && ["EPERM", "EACCES", "EBUSY"].includes(code)) {
        await new Promise((resolve) => setTimeout(resolve, 10 * attempt));
        continue;
      }
      await fs.rm(from, { force: true });
      throw error;
    }
  }
}

function draftDocumentPath(team: string, periodId: string) {
  return `okrDrafts/${documentIdFromParts([periodId, team])}`;
}

function periodDocumentPath(periodId: string) {
  return `okrPeriodSnapshots/${documentIdFromParts([periodId])}`;
}

function canonicalizeRecord(record: OkrRecord, config: AdminConfig) {
  return {
    ...record,
    team: resolveAdminTeamName(config, record.team),
    owner: canonicalOwnerName(record.owner),
    objective_scope: record.objective_scope ?? "team",
    owner_email: record.owner_email?.trim().toLowerCase() || undefined
  };
}

function canonicalizeDraft(draft: OkrDraft, team: string): OkrDraft {
  return {
    ...draft,
    team,
    objectives: draft.objectives.map((objective) => ({
      ...objective,
      team,
      owner: canonicalOwnerName(objective.owner),
      objectiveScope: objective.objectiveScope ?? "team",
      ownerEmail: objective.ownerEmail?.trim().toLowerCase() || undefined,
      keyResults: objective.keyResults.map((kr) => ({ ...kr, owner: canonicalOwnerName(kr.owner) }))
    }))
  };
}

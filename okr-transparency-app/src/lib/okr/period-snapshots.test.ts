import { beforeEach, describe, expect, it, vi } from "vitest";
import { readAdminConfig } from "../admin/config";
import { writeAppLog } from "../app-log";
import { documentIdFromParts } from "../storage/document-ids";
import { readFirestoreDocument, readFirestoreDocumentWithMetadata, writeFirestoreDocument } from "../storage/firestore";
import { publishDraft, readDraft, readPeriodRecords, updatePublishedRecordProgress } from "./drafts";
import { recordsToDraft } from "./edit-types";
import { writeSnapshotVersion } from "./snapshot-versions";
import { readOkrSnapshotState, SnapshotConflictError, writeOkrSnapshot } from "./store";
import type { OkrRecord } from "./types";

// An in-memory Firestore that honours the two preconditions the period store
// relies on, so lock behaviour is exercised rather than stubbed.
const firestore = vi.hoisted(() => {
  class PreconditionError extends Error {}
  const docs = new Map<string, { value: unknown; updateTime: string }>();
  let clock = 0;
  return {
    docs,
    PreconditionError,
    put(path: string, value: unknown) {
      docs.set(path, { value, updateTime: `t${++clock}` });
    }
  };
});

vi.mock("../storage/mode", () => ({ isFirestoreStorageEnabled: () => true }));
vi.mock("../storage/firestore", () => ({
  FirestorePreconditionError: firestore.PreconditionError,
  readFirestoreDocument: vi.fn(),
  readFirestoreDocumentWithMetadata: vi.fn(),
  writeFirestoreDocument: vi.fn(),
  listFirestoreCollection: vi.fn(async (collection: string, limit?: number) =>
    [...firestore.docs].filter(([path]) => path.startsWith(`${collection}/`)).slice(0, limit).map(([, doc]) => doc.value))
}));
vi.mock("../admin/config", () => ({ readAdminConfig: vi.fn() }));
vi.mock("../app-log", () => ({ writeAppLog: vi.fn() }));
vi.mock("./snapshot-versions", () => ({ writeSnapshotVersion: vi.fn(), readSnapshotVersion: vi.fn() }));
vi.mock("./store", () => ({
  readOkrSnapshotState: vi.fn(),
  writeOkrSnapshot: vi.fn(),
  SnapshotConflictError: class SnapshotConflictError extends Error {}
}));

function configWithDefault(defaultPeriodId: string) {
  return {
    version: 2,
    revision: 1,
    defaultPeriodId,
    periods: ["2026-q4", "2026-q3", "2026-q2"].map((id) => ({
      id,
      label: id,
      labelEn: id,
      shortLabel: id,
      status: id === defaultPeriodId ? "active" : "planned"
    })),
    defaultTeam: "Software",
    teams: [
      { id: "software", name: "Software", aliases: [], owner: "Owner", parentTeam: "", color: "blue", enabled: true },
      { id: "hardware", name: "Hardware", aliases: [], owner: "Owner", parentTeam: "", color: "emerald", enabled: true }
    ],
    users: [],
    settings: { defaultLanguage: "zh", showEditLinks: true, allowProgressNotes: true, backupExportEnabled: true }
  };
}

function record(okr_id: string, parent_id: string, kr = "", team = "Software"): OkrRecord {
  return {
    okr_id,
    parent_id,
    level: "Team",
    team,
    objective: "Objective",
    kr,
    type: "Committed",
    owner: "Owner",
    baseline: "Baseline",
    target: "Target",
    actual: "",
    score: 0.4,
    confidence: "Green",
    dependencies: "",
    risks: "",
    decisions_needed: "",
    source_doc_url: "page-edit",
    last_update: new Date().toISOString().slice(0, 10)
  };
}

const periodPath = (periodId: string) => `okrPeriodSnapshots/${documentIdFromParts([periodId])}`;
const draftPath = (periodId: string, team: string) => `okrDrafts/${documentIdFromParts([periodId, team])}`;
const storedPeriod = (periodId: string) => firestore.docs.get(periodPath(periodId))?.value as { records: OkrRecord[] } | undefined;

const q3Records = [
  record("SW-O1", ""),
  record("SW-KR1", "SW-O1", "Ship the thing"),
  record("HW-O1", "", "", "Hardware"),
  record("HW-KR1", "HW-O1", "Build the board", "Hardware")
];

beforeEach(() => {
  vi.clearAllMocks();
  firestore.docs.clear();
  vi.mocked(readAdminConfig).mockResolvedValue(configWithDefault("2026-q3") as never);
  vi.mocked(readFirestoreDocumentWithMetadata).mockImplementation(async (path: string) => firestore.docs.get(path) as never ?? null);
  vi.mocked(readFirestoreDocument).mockImplementation(async (path: string) => firestore.docs.get(path)?.value as never ?? null);
  vi.mocked(writeFirestoreDocument).mockImplementation(async (path: string, value: Record<string, unknown>, options: { exists?: boolean; updateTime?: string } = {}) => {
    const existing = firestore.docs.get(path);
    if (options.exists === false && existing) throw new firestore.PreconditionError();
    if (options.updateTime && existing?.updateTime !== options.updateTime) throw new firestore.PreconditionError();
    firestore.put(path, value);
    return "" as never;
  });
  // `current` still holds Q3: nothing rewrites it when the default period moves.
  vi.mocked(readOkrSnapshotState).mockResolvedValue({
    snapshot: { version: 1, meta: {} as never, records: q3Records },
    revision: "rev-current"
  } as never);
  vi.mocked(writeOkrSnapshot).mockResolvedValue(undefined as never);
  vi.mocked(writeSnapshotVersion).mockResolvedValue({} as never);
  firestore.put(periodPath("2026-q3"), { periodId: "2026-q3", updatedAt: "2026-09-30T00:00:00.000Z", records: q3Records });
});

describe("periods are isolated from each other", () => {
  it("starts a new period's draft blank even once it is the default", async () => {
    vi.mocked(readAdminConfig).mockResolvedValue(configWithDefault("2026-q4") as never);

    const draft = await readDraft("Software", "2026-q4");

    expect(draft.objectives).toEqual([]);
    expect(await readPeriodRecords("2026-q4")).toBeNull();
  });

  it("publishes into a new period without carrying other teams' records from another period", async () => {
    vi.mocked(readAdminConfig).mockResolvedValue(configWithDefault("2026-q4") as never);
    const q4Records = [record("SW-Q4-O1", ""), record("SW-Q4-KR1", "SW-Q4-O1", "Ship the next thing")];
    firestore.put(draftPath("2026-q4", "Software"), recordsToDraft(q4Records, "Software", "2026-q4"));

    const result = await publishDraft("Software", "2026-q4");

    expect(result.errors).toEqual([]);
    expect(storedPeriod("2026-q4")?.records.map((item) => item.okr_id).sort()).toEqual(["SW-Q4-KR1", "SW-Q4-O1"]);
    expect(storedPeriod("2026-q3")?.records).toHaveLength(q3Records.length);
    expect(vi.mocked(writeFirestoreDocument).mock.calls.find(([path]) => path === periodPath("2026-q4"))?.[2]).toEqual({ exists: false });
  });

  it("keeps updating a period's progress after another period becomes the default", async () => {
    vi.mocked(readAdminConfig).mockResolvedValue(configWithDefault("2026-q4") as never);

    await updatePublishedRecordProgress({ periodId: "2026-q3", team: "Software", recordId: "SW-KR1", progress: 80, actor: "Reviewer" });

    expect(storedPeriod("2026-q3")?.records.find((item) => item.okr_id === "SW-KR1")?.score).toBe(0.8);
    expect(writeOkrSnapshot).not.toHaveBeenCalled();
  });

  it("reads a legacy deployment's default period from current only while no period snapshot exists", async () => {
    firestore.docs.clear();

    expect(await readPeriodRecords("2026-q3")).toHaveLength(q3Records.length);
    expect(await readPeriodRecords("2026-q2")).toBeNull();

    firestore.put(periodPath("2026-q2"), { periodId: "2026-q2", updatedAt: "2026-06-30T00:00:00.000Z", records: [] });

    expect(await readPeriodRecords("2026-q3")).toBeNull();
  });
});

describe("taking over from a build that kept current as the default period's source of truth", () => {
  const scoreOf = (records: OkrRecord[] | null | undefined, okrId: string) => records?.find((item) => item.okr_id === okrId)?.score;
  // The old build rewrote the period snapshot after `current` without a lock,
  // so a concurrent check-in could survive only in `current`.
  const currentWithLostCheckIn = (meta: object = {}) => ({
    snapshot: { version: 1, meta, records: q3Records.map((item) => item.okr_id === "SW-KR1" ? { ...item, score: 0.9 } : item) },
    revision: "rev-current"
  });

  it("reads the default period from the old build's current until this build writes the period", async () => {
    vi.mocked(readOkrSnapshotState).mockResolvedValue(currentWithLostCheckIn() as never);

    expect(scoreOf(await readPeriodRecords("2026-q3"), "SW-KR1")).toBe(0.9);

    await updatePublishedRecordProgress({ periodId: "2026-q3", team: "Hardware", recordId: "HW-KR1", progress: 70, actor: "Reviewer" });

    expect(scoreOf(storedPeriod("2026-q3")?.records, "SW-KR1")).toBe(0.9);
    expect(scoreOf(storedPeriod("2026-q3")?.records, "HW-KR1")).toBe(0.7);
    // From here the period snapshot is the source; a stale unstamped `current` no longer wins.
    vi.mocked(readOkrSnapshotState).mockResolvedValue({ snapshot: { version: 1, meta: {}, records: q3Records }, revision: "rev-old" } as never);
    expect(scoreOf(await readPeriodRecords("2026-q3"), "SW-KR1")).toBe(0.9);
  });

  it("ignores a current that this build stamped as its mirror", async () => {
    vi.mocked(readOkrSnapshotState).mockResolvedValue(currentWithLostCheckIn({ periodId: "2026-q3" }) as never);

    expect(scoreOf(await readPeriodRecords("2026-q3"), "SW-KR1")).toBe(0.4);
  });

  it("never applies current to a period that is not the default", async () => {
    vi.mocked(readAdminConfig).mockResolvedValue(configWithDefault("2026-q4") as never);
    vi.mocked(readOkrSnapshotState).mockResolvedValue(currentWithLostCheckIn() as never);

    expect(scoreOf(await readPeriodRecords("2026-q3"), "SW-KR1")).toBe(0.4);
    expect(await readPeriodRecords("2026-q4")).toBeNull();
  });
});

describe("the current snapshot mirror", () => {
  const input = { periodId: "2026-q3", team: "Software", recordId: "SW-KR1", progress: 60, actor: "Reviewer" };

  it("follows the default period without taking a lock, stamped with its period", async () => {
    await updatePublishedRecordProgress(input);

    expect(writeOkrSnapshot).toHaveBeenCalledTimes(1);
    const [mirror, expectedRevision] = vi.mocked(writeOkrSnapshot).mock.calls[0];
    expect(expectedRevision).toBeUndefined();
    expect(mirror.meta.periodId).toBe("2026-q3");
    expect(mirror.records).toEqual(storedPeriod("2026-q3")?.records);
  });

  it("does not fail a change that already landed when the mirror write fails", async () => {
    vi.mocked(writeOkrSnapshot).mockRejectedValue(new Error("Firestore write failed: 503"));

    await expect(updatePublishedRecordProgress(input)).resolves.toBeUndefined();

    expect(storedPeriod("2026-q3")?.records.find((item) => item.okr_id === "SW-KR1")?.score).toBe(0.6);
    expect(writeAppLog).toHaveBeenCalledWith(expect.objectContaining({ event: "current_snapshot_mirror_failed" }));
  });
});

describe("progress updates under period snapshot contention", () => {
  const input = { periodId: "2026-q3", team: "Software", recordId: "SW-KR1", progress: 60, actor: "Reviewer" };
  const periodWrites = () => vi.mocked(writeFirestoreDocument).mock.calls.filter(([path]) => path === periodPath("2026-q3"));

  function loseRaces(count: number) {
    let lost = 0;
    vi.mocked(writeFirestoreDocument).mockImplementation(async (path: string, value: Record<string, unknown>) => {
      if (path === periodPath("2026-q3") && lost < count) {
        lost += 1;
        // Another writer lands first, moving the document's update time on.
        firestore.put(path, firestore.docs.get(path)?.value);
        throw new firestore.PreconditionError();
      }
      firestore.put(path, value);
      return "" as never;
    });
  }

  it("re-reads and retries when another writer wins the race", async () => {
    loseRaces(1);

    await expect(updatePublishedRecordProgress(input)).resolves.toBeUndefined();

    const [lost, landed] = periodWrites().map(([, , options]) => options);
    expect(periodWrites()).toHaveLength(2);
    expect(landed).toEqual({ updateTime: expect.any(String) });
    expect(landed).not.toEqual(lost);
    expect(writeSnapshotVersion).toHaveBeenCalledTimes(1);
  });

  it("gives up after the retry budget so a permanently contended period still surfaces", async () => {
    loseRaces(Infinity);

    await expect(updatePublishedRecordProgress(input)).rejects.toBeInstanceOf(SnapshotConflictError);

    expect(periodWrites()).toHaveLength(6);
    expect(writeSnapshotVersion).not.toHaveBeenCalled();
  });

  it("records the restore point only after the period write lands", async () => {
    loseRaces(1);

    await updatePublishedRecordProgress(input);

    const versionCall = vi.mocked(writeSnapshotVersion).mock.invocationCallOrder[0];
    const landedWrite = vi.mocked(writeFirestoreDocument).mock.invocationCallOrder[1];
    expect(versionCall).toBeGreaterThan(landedWrite);
  });

  it("does not retry errors that are not write conflicts", async () => {
    vi.mocked(writeFirestoreDocument).mockRejectedValue(new Error("Firestore write failed: 503"));

    await expect(updatePublishedRecordProgress(input)).rejects.toThrow("503");

    expect(periodWrites()).toHaveLength(1);
  });
});

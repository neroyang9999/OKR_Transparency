import { beforeEach, describe, expect, it, vi } from "vitest";
import { readAdminConfig } from "../admin/config";
import { readFirestoreDocument, writeFirestoreDocument } from "../storage/firestore";
import { updatePublishedRecordProgress } from "./drafts";
import { writeSnapshotVersion } from "./snapshot-versions";
import { readOkrSnapshotState, SnapshotConflictError, writeOkrSnapshot } from "./store";
import type { OkrRecord } from "./types";

vi.mock("../storage/mode", () => ({ isFirestoreStorageEnabled: () => true }));
vi.mock("../storage/firestore", () => ({
  readFirestoreDocument: vi.fn(),
  writeFirestoreDocument: vi.fn()
}));
vi.mock("../admin/config", () => ({ readAdminConfig: vi.fn() }));
vi.mock("./snapshot-versions", () => ({ writeSnapshotVersion: vi.fn(), readSnapshotVersion: vi.fn() }));
vi.mock("./store", () => ({
  readOkrSnapshot: vi.fn(),
  readOkrSnapshotState: vi.fn(),
  writeOkrSnapshot: vi.fn(),
  SnapshotConflictError: class SnapshotConflictError extends Error {}
}));

const config = {
  version: 2,
  revision: 1,
  defaultPeriodId: "2026-q3",
  periods: [{ id: "2026-q3", label: "2026 Q3", labelEn: "2026 Q3", shortLabel: "Q3", status: "active" }],
  defaultTeam: "Software",
  teams: [{ id: "software", name: "Software", aliases: [], owner: "Owner", parentTeam: "", color: "blue", enabled: true }],
  users: [],
  settings: { defaultLanguage: "zh", showEditLinks: true, allowProgressNotes: true, backupExportEnabled: true }
};

function record(okr_id: string, parent_id: string, kr = ""): OkrRecord {
  return {
    okr_id,
    parent_id,
    level: "Team",
    team: "Software",
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
    last_update: "2026-08-01"
  };
}

const periodRecords = [record("SW-O1", ""), record("SW-KR1", "SW-O1", "Ship the thing")];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(readAdminConfig).mockResolvedValue(config as never);
  vi.mocked(readFirestoreDocument).mockResolvedValue({
    periodId: "2026-q3",
    updatedAt: "2026-08-01T00:00:00.000Z",
    records: periodRecords
  } as never);
  vi.mocked(readOkrSnapshotState).mockResolvedValue({
    snapshot: { version: 1, meta: {} as never, records: periodRecords },
    revision: "rev-1"
  } as never);
  vi.mocked(writeFirestoreDocument).mockResolvedValue("" as never);
  vi.mocked(writeSnapshotVersion).mockResolvedValue({} as never);
});

describe("progress updates under snapshot contention", () => {
  const input = { periodId: "2026-q3", team: "Software", recordId: "SW-KR1", progress: 60, actor: "Reviewer" };

  it("re-reads and retries when another writer wins the race", async () => {
    vi.mocked(writeOkrSnapshot)
      .mockRejectedValueOnce(new SnapshotConflictError())
      .mockResolvedValueOnce(undefined as never);

    await expect(updatePublishedRecordProgress(input)).resolves.toBeUndefined();

    expect(writeOkrSnapshot).toHaveBeenCalledTimes(2);
    expect(readOkrSnapshotState).toHaveBeenCalledTimes(2);
    expect(writeSnapshotVersion).toHaveBeenCalledTimes(1);
  });

  it("gives up after the retry budget so a permanently contended snapshot still surfaces", async () => {
    vi.mocked(writeOkrSnapshot).mockRejectedValue(new SnapshotConflictError());

    await expect(updatePublishedRecordProgress(input)).rejects.toBeInstanceOf(SnapshotConflictError);

    expect(writeOkrSnapshot).toHaveBeenCalledTimes(4);
    expect(writeSnapshotVersion).not.toHaveBeenCalled();
  });

  it("records the restore point only after the snapshot write lands", async () => {
    vi.mocked(writeOkrSnapshot).mockRejectedValueOnce(new SnapshotConflictError()).mockResolvedValueOnce(undefined as never);

    await updatePublishedRecordProgress(input);

    const versionCall = vi.mocked(writeSnapshotVersion).mock.invocationCallOrder[0];
    const snapshotCall = vi.mocked(writeOkrSnapshot).mock.invocationCallOrder[1];
    expect(versionCall).toBeGreaterThan(snapshotCall);
  });

  it("does not retry errors that are not snapshot conflicts", async () => {
    vi.mocked(writeOkrSnapshot).mockRejectedValue(new Error("Firestore write failed: 503"));

    await expect(updatePublishedRecordProgress(input)).rejects.toThrow("503");

    expect(writeOkrSnapshot).toHaveBeenCalledTimes(1);
  });
});

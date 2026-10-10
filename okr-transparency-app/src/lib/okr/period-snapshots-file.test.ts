import { promises as fs } from "fs";
import path from "path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readAdminConfig } from "../admin/config";
import { updatePublishedRecordProgress } from "./drafts";
import { readOkrSnapshotState } from "./store";
import type { OkrRecord } from "./types";

// A disk whose writes, like real ones, empty the file before filling it, with
// room for another request to run in between.
const disk = vi.hoisted(() => ({ files: new Map<string, string>() }));

vi.mock("fs", () => ({
  promises: {
    readFile: vi.fn(async (file: string) => {
      const text = disk.files.get(String(file));
      if (text === undefined) throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
      return text;
    }),
    writeFile: vi.fn(async (file: string, text: string) => {
      disk.files.set(String(file), "");
      await new Promise((resolve) => setTimeout(resolve, 1));
      disk.files.set(String(file), String(text));
    }),
    rename: vi.fn(async (from: string, to: string) => {
      disk.files.set(String(to), disk.files.get(String(from)) ?? "");
      disk.files.delete(String(from));
    }),
    rm: vi.fn(async (file: string) => { disk.files.delete(String(file)); }),
    mkdir: vi.fn(async () => undefined)
  }
}));
vi.mock("../storage/mode", () => ({ isFirestoreStorageEnabled: () => false }));
vi.mock("../admin/config", () => ({ readAdminConfig: vi.fn() }));
vi.mock("../app-log", () => ({ writeAppLog: vi.fn() }));
vi.mock("./snapshot-versions", () => ({ writeSnapshotVersion: vi.fn(), readSnapshotVersion: vi.fn() }));
vi.mock("./store", () => ({
  readOkrSnapshotState: vi.fn(),
  writeOkrSnapshot: vi.fn(),
  SnapshotConflictError: class SnapshotConflictError extends Error {}
}));

const periodFile = path.join(process.cwd(), "data", "okr-period-snapshots.json");

function kr(okr_id: string): OkrRecord {
  return {
    okr_id,
    parent_id: "SW-O1",
    level: "Team",
    team: "Software",
    objective: "Objective",
    kr: okr_id,
    type: "Committed",
    owner: "Owner",
    baseline: "",
    target: "",
    actual: "",
    score: 0.1,
    confidence: "Green",
    dependencies: "",
    risks: "",
    decisions_needed: "",
    source_doc_url: "page-edit",
    last_update: "2026-10-01"
  };
}

const records = [{ ...kr("SW-O1"), parent_id: "", kr: "" }, kr("SW-KR1"), kr("SW-KR2"), kr("SW-KR3")];

beforeEach(() => {
  disk.files.clear();
  disk.files.set(periodFile, JSON.stringify({ version: 1, periods: [{ periodId: "2026-q4", updatedAt: "2026-10-01T00:00:00.000Z", records, authoritative: true }] }));
  vi.mocked(readAdminConfig).mockResolvedValue({
    defaultPeriodId: "2026-q4",
    periods: [{ id: "2026-q4", label: "Q4", labelEn: "Q4", shortLabel: "Q4", status: "active" }],
    teams: [{ id: "software", name: "Software", aliases: [], owner: "Owner", parentTeam: "", color: "blue", enabled: true }],
    users: []
  } as never);
  vi.mocked(readOkrSnapshotState).mockResolvedValue({ snapshot: { version: 1, meta: {}, records: [] }, revision: "missing" } as never);
});

describe("the local period snapshot file under concurrent requests", () => {
  it("keeps every check-in and stays valid JSON", async () => {
    await Promise.all(["SW-KR1", "SW-KR2", "SW-KR3"].map((recordId) =>
      updatePublishedRecordProgress({ periodId: "2026-q4", team: "Software", recordId, progress: 90, actor: "Reviewer" })));

    const stored = JSON.parse(disk.files.get(periodFile) ?? "") as { periods: Array<{ records: OkrRecord[] }> };
    const scores = Object.fromEntries(stored.periods[0].records.map((record) => [record.okr_id, record.score]));
    expect(scores).toMatchObject({ "SW-KR1": 0.9, "SW-KR2": 0.9, "SW-KR3": 0.9 });
    expect([...disk.files.keys()].filter((file) => file.endsWith(".tmp"))).toEqual([]);
  });

  it("waits out Windows refusing to replace a file that is open elsewhere", async () => {
    const busy = Object.assign(new Error("EPERM: operation not permitted, rename"), { code: "EPERM" });
    vi.mocked(fs.rename).mockRejectedValueOnce(busy).mockRejectedValueOnce(busy);

    await updatePublishedRecordProgress({ periodId: "2026-q4", team: "Software", recordId: "SW-KR1", progress: 70, actor: "Reviewer" });

    const stored = JSON.parse(disk.files.get(periodFile) ?? "") as { periods: Array<{ records: OkrRecord[] }> };
    expect(stored.periods[0].records.find((record) => record.okr_id === "SW-KR1")?.score).toBe(0.7);
    expect([...disk.files.keys()].filter((file) => file.endsWith(".tmp"))).toEqual([]);
  });

  it("removes its temporary file when the replace fails for good", async () => {
    vi.mocked(fs.rename).mockRejectedValueOnce(Object.assign(new Error("ENOSPC: no space left on device"), { code: "ENOSPC" }));

    await expect(updatePublishedRecordProgress({ periodId: "2026-q4", team: "Software", recordId: "SW-KR1", progress: 70, actor: "Reviewer" }))
      .rejects.toThrow("ENOSPC");

    expect([...disk.files.keys()].filter((file) => file.endsWith(".tmp"))).toEqual([]);
  });
});

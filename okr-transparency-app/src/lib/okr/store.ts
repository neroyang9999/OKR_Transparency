import { promises as fs } from "fs";
import path from "path";
import type { OkrSnapshot, OkrTreeResponse } from "./types";
import { buildOkrTree, getOkrStats } from "./tree";
import { FirestorePreconditionError, readFirestoreDocumentWithMetadata, writeFirestoreDocument } from "../storage/firestore";
import { isFirestoreStorageEnabled } from "../storage/mode";

const dataDir = path.join(process.cwd(), "data");
const snapshotPath = path.join(dataDir, "okr-snapshot.json");
const snapshotDocumentPath = "okrSnapshots/current";

export async function readOkrSnapshot(): Promise<OkrSnapshot> {
  return (await readOkrSnapshotState()).snapshot;
}

export async function readOkrSnapshotState(): Promise<{ snapshot: OkrSnapshot; revision: string }> {
  if (isFirestoreStorageEnabled()) {
    const result = await readFirestoreDocumentWithMetadata<OkrSnapshot>(snapshotDocumentPath);
    if (result) return { snapshot: result.value, revision: result.updateTime };
    return { snapshot: emptySnapshot(), revision: "missing" };
  }

  try {
    const [snapshotText, stat] = await Promise.all([fs.readFile(snapshotPath, "utf8"), fs.stat(snapshotPath)]);
    return {
      snapshot: JSON.parse(snapshotText) as OkrSnapshot,
      revision: `${stat.mtimeMs}:${stat.size}`
    };
  } catch {
    return { snapshot: emptySnapshot(), revision: "missing" };
  }
}

export async function writeOkrSnapshot(snapshot: OkrSnapshot, expectedRevision?: string) {
  if (isFirestoreStorageEnabled()) {
    try {
      await writeFirestoreDocument(snapshotDocumentPath, snapshot, expectedRevision === "missing"
        ? { exists: false }
        : expectedRevision ? { updateTime: expectedRevision } : {});
    } catch (error) {
      if (error instanceof FirestorePreconditionError) throw new SnapshotConflictError();
      throw error;
    }
    return;
  }

  if (expectedRevision) {
    const current = await readOkrSnapshotState();
    if (current.revision !== expectedRevision) throw new SnapshotConflictError();
  }
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(snapshotPath, JSON.stringify(snapshot, null, 2), "utf8");
}

export class SnapshotConflictError extends Error {
  constructor() {
    super("OKR data changed while publishing. Refresh and try again.");
    this.name = "SnapshotConflictError";
  }
}

export async function getOkrTreeResponse(): Promise<OkrTreeResponse> {
  const snapshot = await readOkrSnapshot();
  return {
    meta: snapshot.meta,
    records: snapshot.records,
    tree: buildOkrTree(snapshot.records),
    stats: getOkrStats(snapshot.records)
  };
}

function emptySnapshot(): OkrSnapshot {
  return {
    version: 1,
    meta: {
      status: "empty",
      source: "snapshot",
      lastSyncedAt: new Date().toISOString(),
      message: "No OKR snapshot found. Create OKRs in the page editor and publish them.",
      rowCount: 0
    },
    records: []
  };
}

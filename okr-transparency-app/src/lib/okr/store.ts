import { promises as fs } from "fs";
import path from "path";
import type { OkrSnapshot, OkrTreeResponse } from "./types";
import { buildOkrTree, getOkrStats } from "./tree";
import { readFirestoreDocument, writeFirestoreDocument } from "../storage/firestore";
import { isFirestoreStorageEnabled } from "../storage/mode";

const dataDir = path.join(process.cwd(), "data");
const snapshotPath = path.join(dataDir, "okr-snapshot.json");
const snapshotDocumentPath = "okrSnapshots/current";

export async function readOkrSnapshot(): Promise<OkrSnapshot> {
  if (isFirestoreStorageEnabled()) {
    const snapshot = await readFirestoreDocument<OkrSnapshot>(snapshotDocumentPath);
    if (snapshot) return snapshot;
    return emptySnapshot();
  }

  try {
    const snapshotText = await fs.readFile(snapshotPath, "utf8");
    return JSON.parse(snapshotText) as OkrSnapshot;
  } catch {
    return emptySnapshot();
  }
}

export async function writeOkrSnapshot(snapshot: OkrSnapshot) {
  if (isFirestoreStorageEnabled()) {
    await writeFirestoreDocument(snapshotDocumentPath, snapshot);
    return;
  }

  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(snapshotPath, JSON.stringify(snapshot, null, 2), "utf8");
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

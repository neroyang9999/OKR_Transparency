import { promises as fs } from "fs";
import path from "path";
import type { OkrSnapshot, OkrTreeResponse } from "./types";
import { buildOkrTree, getOkrStats } from "./tree";
import { FirestorePreconditionError, readFirestoreDocumentWithMetadata, writeFirestoreDocument } from "../storage/firestore";
import { isFirestoreStorageEnabled } from "../storage/mode";
import { canonicalOwnerName, canonicalTeamName } from "../team-names";
import { readAdminConfig, type AdminConfig } from "../admin/config";
import { resolveAdminTeamName } from "../admin/team-rename";

const dataDir = path.join(process.cwd(), "data");
const snapshotPath = path.join(dataDir, "okr-snapshot.json");
const snapshotDocumentPath = "okrSnapshots/current";

export async function readOkrSnapshot(): Promise<OkrSnapshot> {
  return (await readOkrSnapshotState()).snapshot;
}

export async function readOkrSnapshotState(): Promise<{ snapshot: OkrSnapshot; revision: string }> {
  if (isFirestoreStorageEnabled()) {
    const [result, config] = await Promise.all([
      readFirestoreDocumentWithMetadata<OkrSnapshot>(snapshotDocumentPath),
      readAdminConfig()
    ]);
    if (result) return { snapshot: canonicalizeSnapshot(result.value, config), revision: result.updateTime };
    return { snapshot: emptySnapshot(), revision: "missing" };
  }

  try {
    const [snapshotText, stat, config] = await Promise.all([fs.readFile(snapshotPath, "utf8"), fs.stat(snapshotPath), readAdminConfig()]);
    return {
      snapshot: canonicalizeSnapshot(JSON.parse(snapshotText) as OkrSnapshot, config),
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

function canonicalizeSnapshot(snapshot: OkrSnapshot, config: AdminConfig): OkrSnapshot {
  return {
    ...snapshot,
    records: snapshot.records.map((record) => ({
      ...record,
      team: resolveAdminTeamName(config, canonicalTeamName(record.team)),
      owner: canonicalOwnerName(record.owner),
      objective_scope: record.objective_scope ?? "team",
      owner_email: record.owner_email?.trim().toLowerCase() || undefined
    }))
  };
}

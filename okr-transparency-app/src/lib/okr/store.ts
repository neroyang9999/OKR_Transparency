import { promises as fs } from "fs";
import path from "path";
import type { OkrSnapshot, OkrTreeResponse } from "./types";
import { parseCsv } from "./csv";
import { normalizeAndValidate } from "./normalize";
import { buildOkrTree, getOkrStats } from "./tree";
import { readFirestoreDocument, writeFirestoreDocument } from "../storage/firestore";
import { isFirestoreStorageEnabled } from "../storage/mode";

const dataDir = path.join(process.cwd(), "data");
const snapshotPath = path.join(dataDir, "okr-snapshot.json");
const samplePath = path.join(dataDir, "sample-okrs.csv");
const snapshotDocumentPath = "okrSnapshots/current";

export async function readOkrSnapshot(): Promise<OkrSnapshot> {
  if (isFirestoreStorageEnabled()) {
    const snapshot = await readFirestoreDocument<OkrSnapshot>(snapshotDocumentPath);
    if (snapshot) return snapshot;
    if (!hasConfiguredSource()) return readSampleSnapshot();
    return emptyConfiguredSnapshot();
  }

  try {
    const snapshotText = await fs.readFile(snapshotPath, "utf8");
    const snapshot = JSON.parse(snapshotText) as OkrSnapshot;
    if (snapshot.meta.source !== "sample") return snapshot;
  } catch {
    if (!hasConfiguredSource()) return readSampleSnapshot();
  }

  return readSampleSnapshot();
}

function hasConfiguredSource() {
  return Boolean(
    process.env.GOOGLE_DOC_ID ||
    process.env.OKR_SOURCE_CSV_URL ||
    process.env.OKR_SOURCE_CSV_FILE
  );
}

async function readSampleSnapshot(): Promise<OkrSnapshot> {
    const sampleText = await fs.readFile(samplePath, "utf8");
    const result = normalizeAndValidate(parseCsv(sampleText));
    return {
      version: 1,
      meta: {
        status: result.errors.length ? "error" : "ok",
        source: "sample",
        lastSyncedAt: new Date().toISOString(),
        message: result.errors.length
          ? `Sample data has validation errors: ${result.errors.join("; ")}`
          : "Loaded bundled sample OKR data. Configure a source and run sync for live data.",
        rowCount: result.records.length
      },
      records: result.records
    };
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

function emptyConfiguredSnapshot(): OkrSnapshot {
  return {
    version: 1,
    meta: {
      status: "empty",
      source: "snapshot",
      lastSyncedAt: new Date().toISOString(),
      message: "No Firestore OKR snapshot found. Run sync or migrate local JSON data.",
      rowCount: 0
    },
    records: []
  };
}

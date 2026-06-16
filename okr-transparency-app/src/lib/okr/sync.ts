import { promises as fs } from "fs";
import path from "path";
import { parseCsv } from "./csv";
import { readGoogleDocRows } from "./google-docs";
import { normalizeAndValidate } from "./normalize";
import { writeOkrSnapshot } from "./store";
import type { OkrSnapshot, SyncStatus } from "./types";

export async function syncFromConfiguredSource(): Promise<OkrSnapshot> {
  const source = await readConfiguredRows();
  const result = normalizeAndValidate(source.rows);
  const now = new Date().toISOString();

  if (result.errors.length > 0) {
    throw new Error(result.errors.join("; "));
  }

  const meta: SyncStatus = {
    status: "ok",
    source: source.name,
    lastSyncedAt: now,
    message: result.warnings.length
      ? `Synced with warnings: ${result.warnings.join("; ")}`
      : "Synced successfully",
    rowCount: result.records.length
  };

  const snapshot: OkrSnapshot = {
    version: 1,
    meta,
    records: result.records
  };

  await writeOkrSnapshot(snapshot);
  return snapshot;
}

async function readConfiguredRows() {
  const googleDocId = process.env.GOOGLE_DOC_ID;
  const csvUrl = process.env.OKR_SOURCE_CSV_URL;
  const csvFile = process.env.OKR_SOURCE_CSV_FILE || "sample-okrs.csv";

  if (googleDocId) {
    return {
      name: "google-doc" as const,
      rows: await readGoogleDocRows(googleDocId)
    };
  }

  if (csvUrl) {
    const response = await fetch(csvUrl, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`CSV URL returned ${response.status}`);
    }
    return {
      name: "csv-url" as const,
      rows: parseCsv(await response.text())
    };
  }

  const csvPath = path.join(process.cwd(), "data", path.basename(csvFile));
  return {
    name: "csv" as const,
    rows: parseCsv(await fs.readFile(csvPath, "utf8"))
  };
}

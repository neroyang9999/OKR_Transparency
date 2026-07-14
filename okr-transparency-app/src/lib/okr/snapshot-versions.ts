import { promises as fs } from "fs";
import path from "path";
import { documentIdFromParts } from "../storage/document-ids";
import { listFirestoreCollection, readFirestoreDocument, writeFirestoreDocument } from "../storage/firestore";
import { isFirestoreStorageEnabled } from "../storage/mode";
import type { OkrRecord } from "./types";

const dataDir = path.join(process.cwd(), "data");
const versionsPath = path.join(dataDir, "okr-snapshot-versions.json");

export type SnapshotVersion = {
  id: string;
  periodId: string;
  team: string;
  actor: string;
  createdAt: string;
  records: OkrRecord[];
};

type SnapshotVersionFile = {
  version: 1;
  versions: SnapshotVersion[];
};

export async function writeSnapshotVersion(input: Omit<SnapshotVersion, "id" | "createdAt">) {
  const createdAt = new Date().toISOString();
  const version: SnapshotVersion = {
    ...input,
    id: documentIdFromParts([input.periodId, input.team, createdAt]),
    createdAt
  };

  if (isFirestoreStorageEnabled()) {
    await writeFirestoreDocument(`okrSnapshotVersions/${version.id}`, version);
    return version;
  }

  const file = await readVersionFile();
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(versionsPath, JSON.stringify({ version: 1, versions: [version, ...file.versions].slice(0, 200) }, null, 2), "utf8");
  return version;
}

export async function listSnapshotVersions(limit = 50) {
  if (isFirestoreStorageEnabled()) {
    return listFirestoreCollection<SnapshotVersion>("okrSnapshotVersions", limit, "createdAt desc");
  }
  return (await readVersionFile()).versions.slice(0, limit);
}

export async function readSnapshotVersion(id: string) {
  if (isFirestoreStorageEnabled()) {
    return readFirestoreDocument<SnapshotVersion>(`okrSnapshotVersions/${id}`);
  }
  return (await readVersionFile()).versions.find((version) => version.id === id) ?? null;
}

async function readVersionFile(): Promise<SnapshotVersionFile> {
  try {
    const parsed = JSON.parse(await fs.readFile(versionsPath, "utf8")) as SnapshotVersionFile;
    return Array.isArray(parsed.versions) ? parsed : { version: 1, versions: [] };
  } catch {
    return { version: 1, versions: [] };
  }
}

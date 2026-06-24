import { promises as fs } from "fs";
import path from "path";
import type { ConfidenceLevel } from "./types";
import { documentIdFromParts } from "../storage/document-ids";
import { listFirestoreCollection, writeFirestoreDocument } from "../storage/firestore";
import { isFirestoreStorageEnabled } from "../storage/mode";

const dataDir = path.join(/* turbopackIgnore: true */ process.cwd(), "data");
const progressNotesPath = path.join(dataDir, "okr-progress-notes.json");

export type ProgressNote = {
  team: string;
  periodId: string;
  objectiveId: string;
  weekStart: string;
  summary: string;
  status: ConfidenceLevel;
  risks: string;
  nextSteps: string;
  updatedBy: string;
  updatedAt: string;
};

type ProgressNoteFileV2 = {
  version: 2;
  notes: ProgressNote[];
};

type LegacyProgressNote = {
  team: string;
  periodId: string;
  objectiveId: string;
  note: string;
  updatedBy: string;
  updatedAt: string;
};

type ProgressNoteFileV1 = {
  version: 1;
  notes: LegacyProgressNote[];
};

type ProgressNoteStoreOptions = {
  filePath?: string;
  now?: Date;
};

export async function readProgressNotes(options: ProgressNoteStoreOptions = {}) {
  if (shouldUseFirestore(options)) {
    return sortProgressNotes(await listFirestoreCollection<ProgressNote>("okrProgressNotes"));
  }

  return sortProgressNotes((await readProgressNoteFile(options)).notes);
}

export async function readProgressNotesForObjective(
  team: string,
  periodId: string,
  objectiveId: string,
  options: ProgressNoteStoreOptions = {}
) {
  if (shouldUseFirestore(options)) {
    const notes = await listFirestoreCollection<ProgressNote>("okrProgressNotes");
    return sortProgressNotes(notes.filter((note) =>
      note.team === team &&
      note.periodId === periodId &&
      note.objectiveId === objectiveId
    ));
  }

  const file = await readProgressNoteFile(options);
  return sortProgressNotes(file.notes.filter((note) =>
    note.team === team &&
    note.periodId === periodId &&
    note.objectiveId === objectiveId
  ));
}

export async function writeProgressNote(input: {
  team: string;
  periodId: string;
  objectiveId: string;
  weekStart?: string;
  summary: string;
  status?: ConfidenceLevel;
  risks?: string;
  nextSteps?: string;
  updatedBy?: string;
}, options: ProgressNoteStoreOptions = {}) {
  const summary = input.summary.trim();
  if (!summary) {
    throw new Error("summary is required");
  }

  const now = options.now ?? new Date();
  const nextNote: ProgressNote = {
    team: input.team,
    periodId: input.periodId,
    objectiveId: input.objectiveId,
    weekStart: input.weekStart ?? getWeekStart(now),
    summary,
    status: input.status ?? "Yellow",
    risks: input.risks?.trim() ?? "",
    nextSteps: input.nextSteps?.trim() ?? "",
    updatedBy: input.updatedBy?.trim() || "Lead",
    updatedAt: now.toISOString()
  };

  if (shouldUseFirestore(options)) {
    await writeFirestoreDocument(progressNoteDocumentPath(nextNote), nextNote);
    return nextNote;
  }

  const file = await readProgressNoteFile(options);
  const index = file.notes.findIndex((note) =>
    note.team === input.team &&
    note.periodId === input.periodId &&
    note.objectiveId === input.objectiveId &&
    note.weekStart === nextNote.weekStart
  );
  const notes = index >= 0
    ? file.notes.map((note, noteIndex) => noteIndex === index ? nextNote : note)
    : [...file.notes, nextNote];

  const filePath = resolveProgressNotesPath(options);
  await fs.mkdir(resolveProgressNotesDir(options), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify({ version: 2, notes: sortProgressNotes(notes) }, null, 2), "utf8");
  return nextNote;
}

export function getWeekStart(input: Date | string) {
  const date = typeof input === "string" ? new Date(input) : new Date(input);
  if (Number.isNaN(date.getTime())) {
    return formatDate(new Date());
  }

  const localDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = localDate.getDay();
  const daysSinceMonday = day === 0 ? 6 : day - 1;
  localDate.setDate(localDate.getDate() - daysSinceMonday);
  return formatDate(localDate);
}

async function readProgressNoteFile(options: ProgressNoteStoreOptions): Promise<ProgressNoteFileV2> {
  try {
    const text = await fs.readFile(resolveProgressNotesPath(options), "utf8");
    const parsed = JSON.parse(text) as Partial<ProgressNoteFileV1 | ProgressNoteFileV2>;
    if (!Array.isArray(parsed.notes)) return { version: 2, notes: [] };
    if (parsed.version === 1) return migrateLegacyNotes(parsed as ProgressNoteFileV1);
    return { version: 2, notes: normalizeProgressNotes(parsed.notes as Partial<ProgressNote>[]) };
  } catch {
    return { version: 2, notes: [] };
  }
}

function migrateLegacyNotes(file: ProgressNoteFileV1): ProgressNoteFileV2 {
  return {
    version: 2,
    notes: file.notes.map((note): ProgressNote => ({
      team: note.team,
      periodId: note.periodId,
      objectiveId: note.objectiveId,
      weekStart: getWeekStart(note.updatedAt),
      summary: note.note.trim(),
      status: "Yellow",
      risks: "",
      nextSteps: "",
      updatedBy: note.updatedBy || "Lead",
      updatedAt: note.updatedAt || new Date().toISOString()
    })).filter((note) => note.summary)
  };
}

function normalizeProgressNotes(notes: Partial<ProgressNote>[]) {
  return notes.map((note) => ({
    team: note.team ?? "",
    periodId: note.periodId ?? "",
    objectiveId: note.objectiveId ?? "",
    weekStart: note.weekStart ?? getWeekStart(note.updatedAt ?? new Date()),
    summary: note.summary?.trim() ?? "",
    status: normalizeStatus(note.status),
    risks: note.risks?.trim() ?? "",
    nextSteps: note.nextSteps?.trim() ?? "",
    updatedBy: note.updatedBy?.trim() || "Lead",
    updatedAt: note.updatedAt ?? new Date().toISOString()
  })).filter((note) => note.team && note.periodId && note.objectiveId && note.summary);
}

function normalizeStatus(status: unknown): ConfidenceLevel {
  return status === "Green" || status === "Red" || status === "Yellow" ? status : "Yellow";
}

function sortProgressNotes(notes: ProgressNote[]) {
  return [...notes].sort((left, right) =>
    right.weekStart.localeCompare(left.weekStart) || right.updatedAt.localeCompare(left.updatedAt)
  );
}

function formatDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function resolveProgressNotesPath(options: ProgressNoteStoreOptions) {
  return options.filePath ?? progressNotesPath;
}

function resolveProgressNotesDir(options: ProgressNoteStoreOptions) {
  return options.filePath ? path.dirname(/* turbopackIgnore: true */ options.filePath) : dataDir;
}

function shouldUseFirestore(options: ProgressNoteStoreOptions) {
  return !options.filePath && isFirestoreStorageEnabled();
}

function progressNoteDocumentPath(note: Pick<ProgressNote, "team" | "periodId" | "objectiveId" | "weekStart">) {
  return `okrProgressNotes/${documentIdFromParts([note.periodId, note.team, note.objectiveId, note.weekStart])}`;
}

import { promises as fs } from "fs";
import path from "path";

const dataDir = path.join(process.cwd(), "data");
const progressNotesPath = path.join(dataDir, "okr-progress-notes.json");

export type ProgressNote = {
  team: string;
  periodId: string;
  objectiveId: string;
  note: string;
  updatedBy: string;
  updatedAt: string;
};

type ProgressNoteFile = {
  version: 1;
  notes: ProgressNote[];
};

export async function readProgressNotes() {
  return (await readProgressNoteFile()).notes;
}

export async function readProgressNote(team: string, periodId: string, objectiveId: string) {
  const file = await readProgressNoteFile();
  return file.notes.find((note) =>
    note.team === team &&
    note.periodId === periodId &&
    note.objectiveId === objectiveId
  ) ?? null;
}

export async function writeProgressNote(input: {
  team: string;
  periodId: string;
  objectiveId: string;
  note: string;
  updatedBy?: string;
}) {
  const file = await readProgressNoteFile();
  const nextNote: ProgressNote = {
    team: input.team,
    periodId: input.periodId,
    objectiveId: input.objectiveId,
    note: input.note.trim(),
    updatedBy: input.updatedBy?.trim() || "Lead",
    updatedAt: new Date().toISOString()
  };
  const index = file.notes.findIndex((note) =>
    note.team === input.team &&
    note.periodId === input.periodId &&
    note.objectiveId === input.objectiveId
  );
  const notes = index >= 0
    ? file.notes.map((note, noteIndex) => noteIndex === index ? nextNote : note)
    : [...file.notes, nextNote];

  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(progressNotesPath, JSON.stringify({ version: 1, notes }, null, 2), "utf8");
  return nextNote;
}

async function readProgressNoteFile(): Promise<ProgressNoteFile> {
  try {
    const text = await fs.readFile(progressNotesPath, "utf8");
    const parsed = JSON.parse(text) as ProgressNoteFile;
    return Array.isArray(parsed.notes) ? parsed : { version: 1, notes: [] };
  } catch {
    return { version: 1, notes: [] };
  }
}

import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import { readProgressNotes, readProgressNotesForObjective, writeProgressNote } from "./progress-notes";

const tempDirs: string[] = [];

describe("progress note helpers", () => {
  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
  });

  it("returns an empty list when no file exists", async () => {
    const filePath = await tempProgressNotePath();
    await expect(readProgressNotes({ filePath })).resolves.toEqual([]);
  });

  it("reads version 1 notes as weekly progress records", async () => {
    const filePath = await tempProgressNotePath();
    await fs.writeFile(filePath, JSON.stringify({
      version: 1,
      notes: [
        {
          team: "Software",
          periodId: "2026-q3",
          objectiveId: "SW-O1",
          note: "Legacy progress",
          updatedBy: "Lead",
          updatedAt: "2026-06-17T02:10:28.144Z"
        }
      ]
    }), "utf8");

    await expect(readProgressNotes({ filePath })).resolves.toEqual([
      expect.objectContaining({
        objectiveId: "SW-O1",
        weekStart: "2026-06-15",
        summary: "Legacy progress",
        status: "Yellow",
        risks: "",
        nextSteps: ""
      })
    ]);
  });

  it("overwrites the same objective in the same week", async () => {
    const filePath = await tempProgressNotePath();
    await writeProgressNote({
      team: "Software",
      periodId: "2026-q3",
      objectiveId: "SW-O1",
      summary: "First update"
    }, { filePath, now: new Date("2026-06-17T08:00:00") });
    await writeProgressNote({
      team: "Software",
      periodId: "2026-q3",
      objectiveId: "SW-O1",
      summary: "Final update",
      status: "Green"
    }, { filePath, now: new Date("2026-06-19T08:00:00") });

    const notes = await readProgressNotes({ filePath });
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({
      weekStart: "2026-06-15",
      summary: "Final update",
      status: "Green"
    });
  });

  it("appends records for different weeks", async () => {
    const filePath = await tempProgressNotePath();
    await writeProgressNote({
      team: "Software",
      periodId: "2026-q3",
      objectiveId: "SW-O1",
      summary: "This week"
    }, { filePath, now: new Date("2026-06-17T08:00:00") });
    await writeProgressNote({
      team: "Software",
      periodId: "2026-q3",
      objectiveId: "SW-O1",
      summary: "Next week"
    }, { filePath, now: new Date("2026-06-24T08:00:00") });

    const notes = await readProgressNotesForObjective("Software", "2026-q3", "SW-O1", { filePath });
    expect(notes.map((note) => note.weekStart)).toEqual(["2026-06-22", "2026-06-15"]);
  });

  it("keeps different objectives separate in the same week", async () => {
    const filePath = await tempProgressNotePath();
    await writeProgressNote({
      team: "Software",
      periodId: "2026-q3",
      objectiveId: "SW-O1",
      summary: "Objective one"
    }, { filePath, now: new Date("2026-06-17T08:00:00") });
    await writeProgressNote({
      team: "Software",
      periodId: "2026-q3",
      objectiveId: "SW-O2",
      summary: "Objective two"
    }, { filePath, now: new Date("2026-06-17T08:00:00") });

    await expect(readProgressNotes({ filePath })).resolves.toHaveLength(2);
    await expect(readProgressNotesForObjective("Software", "2026-q3", "SW-O1", { filePath }))
      .resolves.toEqual([expect.objectContaining({ objectiveId: "SW-O1", summary: "Objective one" })]);
  });
});

async function tempProgressNotePath() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "okr-progress-notes-"));
  tempDirs.push(dir);
  return path.join(dir, "okr-progress-notes.json");
}

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readProgressNotesForObjective, writeProgressNote } from "../../../lib/okr/progress-notes";
import { GET, PUT } from "./route";

vi.mock("../../../lib/okr/progress-notes", () => ({
  readProgressNotesForObjective: vi.fn(async () => []),
  writeProgressNote: vi.fn(async (input) => ({
    team: input.team,
    periodId: input.periodId,
    objectiveId: input.objectiveId,
    weekStart: input.weekStart ?? "2026-06-15",
    summary: input.summary,
    status: input.status ?? "Yellow",
    risks: input.risks ?? "",
    nextSteps: input.nextSteps ?? "",
    updatedBy: input.updatedBy ?? "Lead",
    updatedAt: "2026-06-17T08:00:00.000Z"
  }))
}));

describe("/api/progress-notes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects GET requests without required identifiers", async () => {
    const response = await GET(new NextRequest("http://localhost/api/progress-notes"));
    await expect(response.json()).resolves.toEqual({ error: "team, period, and objective are required" });
    expect(response.status).toBe(400);
  });

  it("returns objective weekly notes", async () => {
    vi.mocked(readProgressNotesForObjective).mockResolvedValueOnce([
      {
        team: "Software",
        periodId: "2026-q3",
        objectiveId: "SW-O1",
        weekStart: "2026-06-15",
        summary: "Weekly update",
        status: "Yellow",
        risks: "",
        nextSteps: "",
        updatedBy: "Lead",
        updatedAt: "2026-06-17T08:00:00.000Z"
      }
    ]);

    const response = await GET(new NextRequest("http://localhost/api/progress-notes?team=Software&period=2026-q3&objective=SW-O1"));
    await expect(response.json()).resolves.toEqual({
      notes: [expect.objectContaining({ objectiveId: "SW-O1", summary: "Weekly update" })]
    });
    expect(response.status).toBe(200);
  });

  it("rejects unauthorized PUT requests", async () => {
    const response = await PUT(new NextRequest("http://localhost/api/progress-notes", {
      method: "PUT",
      body: JSON.stringify({ team: "Software", periodId: "2026-q3", objectiveId: "SW-O1", summary: "Update" })
    }));

    await expect(response.json()).resolves.toEqual({ error: "Admin token required" });
    expect(response.status).toBe(401);
  });

  it("writes weekly progress for authorized PUT requests", async () => {
    const response = await PUT(new NextRequest("http://localhost/api/progress-notes", {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        "x-admin-token": "dev-admin-token"
      },
      body: JSON.stringify({
        team: "Software",
        periodId: "2026-q3",
        objectiveId: "SW-O1",
        weekStart: "2026-06-15",
        summary: "Final weekly update",
        status: "Green",
        risks: "None",
        nextSteps: "Continue"
      })
    }));

    await expect(response.json()).resolves.toEqual({
      note: expect.objectContaining({
        objectiveId: "SW-O1",
        weekStart: "2026-06-15",
        summary: "Final weekly update",
        status: "Green"
      })
    });
    expect(response.status).toBe(200);
    expect(writeProgressNote).toHaveBeenCalledWith(expect.objectContaining({
      objectiveId: "SW-O1",
      summary: "Final weekly update",
      status: "Green"
    }));
  });
});

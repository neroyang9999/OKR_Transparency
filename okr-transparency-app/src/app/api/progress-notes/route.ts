import { NextResponse, type NextRequest } from "next/server";
import { isAuthorized } from "../../../lib/admin-auth";
import { readProgressNotesForObjective, writeProgressNote } from "../../../lib/okr/progress-notes";
import type { ConfidenceLevel } from "../../../lib/okr/types";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const team = searchParams.get("team") ?? "";
  const periodId = searchParams.get("period") ?? "";
  const objectiveId = searchParams.get("objective") ?? "";

  if (!team || !periodId || !objectiveId) {
    return NextResponse.json({ error: "team, period, and objective are required" }, { status: 400 });
  }

  const notes = await readProgressNotesForObjective(team, periodId, objectiveId);
  return NextResponse.json({ notes });
}

export async function PUT(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Admin token required" }, { status: 401 });
  }

  try {
    const body = await request.json() as {
      team?: string;
      periodId?: string;
      objectiveId?: string;
      weekStart?: string;
      summary?: string;
      note?: string;
      status?: string;
      risks?: string;
      nextSteps?: string;
      updatedBy?: string;
    };

    if (!body.team || !body.periodId || !body.objectiveId) {
      return NextResponse.json({ error: "team, periodId, and objectiveId are required" }, { status: 400 });
    }

    const note = await writeProgressNote({
      team: body.team,
      periodId: body.periodId,
      objectiveId: body.objectiveId,
      weekStart: body.weekStart,
      summary: body.summary ?? body.note ?? "",
      status: normalizeStatus(body.status),
      risks: body.risks,
      nextSteps: body.nextSteps,
      updatedBy: body.updatedBy
    });
    return NextResponse.json({ note });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown progress note save error" },
      { status: 422 }
    );
  }
}

function normalizeStatus(status: string | undefined): ConfidenceLevel | undefined {
  return status === "Green" || status === "Yellow" || status === "Red" ? status : undefined;
}

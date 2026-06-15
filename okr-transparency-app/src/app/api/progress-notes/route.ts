import { NextResponse, type NextRequest } from "next/server";
import { isAuthorized } from "@/lib/admin-auth";
import { readProgressNote, writeProgressNote } from "@/lib/okr/progress-notes";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const team = searchParams.get("team") ?? "";
  const periodId = searchParams.get("period") ?? "";
  const objectiveId = searchParams.get("objective") ?? "";

  if (!team || !periodId || !objectiveId) {
    return NextResponse.json({ error: "team, period, and objective are required" }, { status: 400 });
  }

  const note = await readProgressNote(team, periodId, objectiveId);
  return NextResponse.json({ note });
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
      note?: string;
      updatedBy?: string;
    };

    if (!body.team || !body.periodId || !body.objectiveId) {
      return NextResponse.json({ error: "team, periodId, and objectiveId are required" }, { status: 400 });
    }

    const note = await writeProgressNote({
      team: body.team,
      periodId: body.periodId,
      objectiveId: body.objectiveId,
      note: body.note ?? "",
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

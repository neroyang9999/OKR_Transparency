import { NextResponse, type NextRequest } from "next/server";
import { requireApiAccess } from "../../../lib/admin/api-access";
import { readAdminConfig } from "../../../lib/admin/config";
import { canEditOwner, canManageTeam, resolveRequestAccess, validateEditablePeriod } from "../../../lib/admin/permissions";
import { readPeriodRecords } from "../../../lib/okr/drafts";
import { readProgressNotesForObjective, writeProgressNote } from "../../../lib/okr/progress-notes";
import { readOkrSnapshot } from "../../../lib/okr/store";
import type { ConfidenceLevel } from "../../../lib/okr/types";

export async function GET(request: NextRequest) {
  const authorization = await requireApiAccess(request);
  if (!authorization.ok) return authorization.response;

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
  try {
    const config = await readAdminConfig();
    const access = await resolveRequestAccess(request, config);
    if (!access) return NextResponse.json({ error: "Login required" }, { status: 401 });

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
    const period = validateEditablePeriod(config, body.periodId);
    if (!period.ok) return NextResponse.json({ error: period.error }, { status: 403 });
    const periodRecords = await readPeriodRecords(body.periodId) ?? (await readOkrSnapshot()).records;
    const objective = periodRecords.find((record) => record.team === body.team && record.okr_id === body.objectiveId);
    if (!canManageTeam(config, body.team, access) && !canEditOwner(access, objective?.owner ?? "")) {
      return NextResponse.json({ error: "No progress note permission for this team" }, { status: 403 });
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
      updatedBy: access.displayName
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

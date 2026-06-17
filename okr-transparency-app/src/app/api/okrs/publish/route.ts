import { NextResponse, type NextRequest } from "next/server";
import { isAuthorized } from "@/lib/admin-auth";
import { appendAdminEvent, backupCurrentSnapshot, readAdminConfig } from "@/lib/admin/config";
import { publishDraft } from "@/lib/okr/drafts";

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Admin token required" }, { status: 401 });
  }

  try {
    const body = await request.json() as { team?: string; periodId?: string };
    const team = body.team ?? "Software";
    const periodId = body.periodId ?? "2026-Q3";
    await backupCurrentSnapshot();
    const result = await publishDraft(team, periodId, await getTeamOwner(team));
    if (result.errors.length > 0) {
      await appendAdminEvent({
        type: "publish",
        actor: "Admin",
        status: "error",
        message: result.errors[0] ?? "Publish validation failed"
      });
      return NextResponse.json(result, { status: 422 });
    }
    await appendAdminEvent({
      type: "publish",
      actor: "Admin",
      status: "ok",
      message: `Published ${team} ${periodId}`
    });
    return NextResponse.json(result);
  } catch (error) {
    await appendAdminEvent({
      type: "publish",
      actor: "Admin",
      status: "error",
      message: error instanceof Error ? error.message : "Unknown publish error"
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown publish error" },
      { status: 422 }
    );
  }
}

async function getTeamOwner(team: string) {
  const config = await readAdminConfig();
  return config.teams.find((item) => item.name === team && item.enabled)?.owner ?? team;
}

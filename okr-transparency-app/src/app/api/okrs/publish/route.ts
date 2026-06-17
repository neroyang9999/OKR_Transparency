import { NextResponse, type NextRequest } from "next/server";
import { appendAdminEvent, backupCurrentSnapshot, readAdminConfig } from "@/lib/admin/config";
import { publishDraft } from "@/lib/okr/drafts";
import { authorizePublish, resolveRequestAccess } from "@/lib/admin/permissions";

export async function POST(request: NextRequest) {
  try {
    const config = await readAdminConfig();
    const access = await resolveRequestAccess(request, config);
    if (!access) return NextResponse.json({ error: "Login required" }, { status: 401 });

    const body = await request.json() as { team?: string; periodId?: string };
    const team = body.team ?? "Software";
    const periodId = body.periodId ?? "2026-Q3";
    const authorization = authorizePublish(config, access, team, periodId);
    if (!authorization.ok) return NextResponse.json({ error: authorization.error }, { status: 403 });

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
      actor: access.displayName,
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

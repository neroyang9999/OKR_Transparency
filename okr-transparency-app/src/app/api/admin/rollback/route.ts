import { NextResponse, type NextRequest } from "next/server";
import { appendAdminEvent, readAdminConfig } from "@/lib/admin/config";
import { canManageAdmin, resolveRequestAccess } from "@/lib/admin/permissions";
import { rollbackTeamVersion } from "@/lib/okr/drafts";

export async function POST(request: NextRequest) {
  const config = await readAdminConfig();
  const access = await resolveRequestAccess(request, config);
  if (!canManageAdmin(access)) {
    return NextResponse.json({ error: "Admin session required" }, { status: 401 });
  }

  try {
    const body = await request.json() as { versionId?: string };
    if (!body.versionId) return NextResponse.json({ error: "versionId is required" }, { status: 400 });
    const version = await rollbackTeamVersion(body.versionId);
    await appendAdminEvent({
      type: "rollback",
      actor: access?.displayName ?? "Admin",
      status: "ok",
      message: `Rolled back ${version.team} ${version.periodId} to ${version.createdAt}`
    });
    return NextResponse.json({ version });
  } catch (error) {
    await appendAdminEvent({
      type: "rollback",
      actor: access?.displayName ?? "Admin",
      status: "error",
      message: error instanceof Error ? error.message : "Rollback failed"
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Rollback failed" },
      { status: 422 }
    );
  }
}

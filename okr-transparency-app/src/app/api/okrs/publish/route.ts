import { NextResponse, type NextRequest } from "next/server";
import { appendAdminEvent, backupCurrentSnapshot, readAdminConfig, type AdminConfig } from "@/lib/admin/config";
import { publishDraft } from "@/lib/okr/drafts";
import { authorizePublish, getTeamEditPolicy, resolveRequestAccess, validateEditablePeriod, type UserAccess } from "@/lib/admin/permissions";

export async function POST(request: NextRequest) {
  try {
    const config = await readAdminConfig();
    const access = await resolveRequestAccess(request, config);
    if (!access) return NextResponse.json({ error: "Login required" }, { status: 401 });

    const body = await request.json() as { team?: string; periodId?: string; ownerEmail?: string };
    const team = body.team ?? "Software";
    const periodId = body.periodId ?? "2026-Q3";
    const ownerScope = resolveOwnerScope(config, team, body.ownerEmail);
    if (body.ownerEmail && !ownerScope) {
      return NextResponse.json({ error: "Member is not configured for this team" }, { status: 403 });
    }
    const authorization = body.ownerEmail
      ? authorizeOwnerScopedPublish(config, access, team, periodId, body.ownerEmail)
      : authorizePublish(config, access, team, periodId);
    if (!authorization.ok) return NextResponse.json({ error: authorization.error }, { status: 403 });

    await backupCurrentSnapshot();
    const result = await publishDraft(team, periodId, await getTeamOwner(team), ownerScope ?? undefined);
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

function authorizeOwnerScopedPublish(config: AdminConfig, access: UserAccess | null, team: string, periodId: string, ownerEmail: string) {
  const period = validateEditablePeriod(config, periodId);
  if (!period.ok) return period;

  const policy = getTeamEditPolicy(config, team, access);
  if (!policy.canEdit) return { ok: false, error: "No edit permission for this team" };

  if (access?.role === "super_admin" || access?.role === "team_leader") return { ok: true, error: "" };

  return access?.role === "user" && access.email === ownerEmail.trim().toLowerCase()
    ? { ok: true, error: "" }
    : { ok: false, error: "Users can only publish their own OKRs" };
}

async function getTeamOwner(team: string) {
  const config = await readAdminConfig();
  return config.teams.find((item) => item.name === team && item.enabled)?.owner ?? team;
}

function resolveOwnerScope(config: AdminConfig, team: string, ownerEmail: string | undefined) {
  const email = ownerEmail?.trim().toLowerCase();
  if (!email) return null;

  const user = config.users.find((item) => item.enabled && item.email.toLowerCase() === email && item.teams.includes(team));
  if (!user) return null;

  return {
    owner: user.displayName || user.email,
    aliases: Array.from(new Set([...user.ownerAliases, user.displayName, user.email].map((value) => value.trim()).filter(Boolean)))
  };
}

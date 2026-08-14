import { NextResponse, type NextRequest } from "next/server";
import { requireApiAccess } from "@/lib/admin/api-access";
import { readAdminConfig, type AdminConfig } from "@/lib/admin/config";
import { readDraft, writeOwnerScopedDraft } from "@/lib/okr/drafts";
import { applyDraftObjectiveScope, filterDraftByOwner, normalizeDraft, validateDraft, withExistingLocalizedContent, type OkrDraft } from "@/lib/okr/edit-types";
import { translateDraftContent } from "@/lib/okr/translation";
import { ownerScopeForMember, ownerScopeForTeam } from "@/lib/okr/owner-scope";
import { authorizeDraftChange, canEditTeamOwner, getTeamEditPolicy, resolveRequestAccess } from "@/lib/admin/permissions";

export async function GET(request: NextRequest) {
  const authorization = await requireApiAccess(request);
  if (!authorization.ok) return authorization.response;

  const searchParams = request.nextUrl.searchParams;
  const team = searchParams.get("team") ?? "Software";
  const periodId = searchParams.get("period") ?? (await readAdminConfig()).defaultPeriodId;
  // Transparency covers published OKRs. A draft is unreviewed work in progress,
  // so it is readable only by the people who could edit it.
  if (!getTeamEditPolicy(authorization.config, team, authorization.access).canEdit) {
    return NextResponse.json({ error: "No edit permission for this team" }, { status: 403 });
  }
  const draft = await readDraft(team, periodId);
  return NextResponse.json({ draft, validation: validateDraft(draft) });
}

export async function PUT(request: NextRequest) {
  try {
    const config = await readAdminConfig();
    const access = await resolveRequestAccess(request, config);
    if (!access) return NextResponse.json({ error: "Login required" }, { status: 401 });

    const body = await request.json() as OkrDraft & { ownerEmail?: string };
    const draft = body as OkrDraft;
    const ownerScope = body.ownerEmail
      ? ownerScopeForMember(config, draft.team, body.ownerEmail)
      : ownerScopeForTeam(config, draft.team);
    if (!ownerScope) {
      return NextResponse.json({ error: body.ownerEmail ? "Member is not configured for this team" : "Team is not configured" }, { status: 403 });
    }
    const previous = await readDraft(draft.team, draft.periodId);
    const previousForAuthorization = filterDraftByOwner(previous, ownerScope.aliases, ownerScope.owner, ownerScope);
    const nextForAuthorization = normalizeDraft(applyDraftObjectiveScope(draft, ownerScope), ownerScope.owner, true);
    const authorization = authorizeOwnerScopedDraftChange(config, access, previousForAuthorization, nextForAuthorization, ownerScope.aliases);
    if (!authorization.ok) return NextResponse.json({ error: authorization.error }, { status: 403 });

    const translation = await translateDraftContent(withExistingLocalizedContent(nextForAuthorization, previous));
    const saved = await writeOwnerScopedDraft(translation.draft, ownerScope);
    const responseDraft = filterDraftByOwner(saved, ownerScope.aliases, ownerScope.owner, ownerScope);
    return NextResponse.json({ draft: responseDraft, validation: validateDraft(responseDraft), translationWarnings: translation.warnings });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown draft save error" },
      { status: 422 }
    );
  }
}

function authorizeOwnerScopedDraftChange(
  config: AdminConfig,
  access: Awaited<ReturnType<typeof resolveRequestAccess>>,
  previous: OkrDraft,
  next: OkrDraft,
  ownerAliases: string[]
) {
  const authorization = authorizeDraftChange(config, access, previous, next);
  if (authorization.ok) return authorization;
  if (!ownerAliases.some((owner) => canEditTeamOwner(config, next.team, access, owner))) return authorization;
  if (!next.objectives.every((objective) => draftObjectiveMatchesOwner(objective, ownerAliases))) return authorization;
  return { ok: true, error: "" };
}

function draftObjectiveMatchesOwner(objective: OkrDraft["objectives"][number], aliases: string[]) {
  return ownerMatches(objective.owner, aliases) && objective.keyResults.every((kr) => ownerMatches(kr.owner, aliases));
}

function ownerMatches(owner: string, aliases: string[]) {
  const normalizedOwner = owner.trim().toLowerCase();
  return Boolean(normalizedOwner) && aliases.some((alias) => alias.trim().toLowerCase() === normalizedOwner);
}

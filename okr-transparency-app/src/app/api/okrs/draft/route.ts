import { NextResponse, type NextRequest } from "next/server";
import { requireApiAccess } from "@/lib/admin/api-access";
import { readAdminConfig, type AdminConfig } from "@/lib/admin/config";
import { readDraft, writeDraft, writeOwnerScopedDraft } from "@/lib/okr/drafts";
import { filterDraftByOwner, normalizeDraft, validateDraft, type OkrDraft } from "@/lib/okr/edit-types";
import { authorizeDraftChange, canEditOwner, resolveRequestAccess } from "@/lib/admin/permissions";

export async function GET(request: NextRequest) {
  const authorization = await requireApiAccess(request);
  if (!authorization.ok) return authorization.response;

  const searchParams = request.nextUrl.searchParams;
  const team = searchParams.get("team") ?? "Software";
  const periodId = searchParams.get("period") ?? "2026-Q3";
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
    const ownerScope = resolveOwnerScope(config, draft.team, body.ownerEmail);
    if (body.ownerEmail && !ownerScope) {
      return NextResponse.json({ error: "Member is not configured for this team" }, { status: 403 });
    }
    const previous = await readDraft(draft.team, draft.periodId);
    const previousForAuthorization = ownerScope
      ? filterDraftByOwner(previous, ownerScope.aliases, ownerScope.owner)
      : previous;
    const nextForAuthorization = ownerScope
      ? normalizeDraft(draft, ownerScope.owner, true)
      : draft;
    const authorization = ownerScope
      ? authorizeOwnerScopedDraftChange(config, access, previousForAuthorization, nextForAuthorization, ownerScope.aliases)
      : authorizeDraftChange(config, access, previousForAuthorization, nextForAuthorization);
    if (!authorization.ok) return NextResponse.json({ error: authorization.error }, { status: 403 });

    const saved = ownerScope
      ? await writeOwnerScopedDraft(draft, ownerScope.owner, ownerScope.aliases)
      : await writeDraft(draft, await getTeamOwner(draft.team), true);
    const responseDraft = ownerScope ? filterDraftByOwner(saved, ownerScope.aliases, ownerScope.owner) : saved;
    return NextResponse.json({ draft: responseDraft, validation: validateDraft(responseDraft) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown draft save error" },
      { status: 422 }
    );
  }
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

  const owner = user.displayName || user.email;
  return {
    owner,
    aliases: Array.from(new Set([...user.ownerAliases, user.displayName, user.email].map((value) => value.trim()).filter(Boolean)))
  };
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
  if (!ownerAliases.some((owner) => canEditOwner(access, owner))) return authorization;
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

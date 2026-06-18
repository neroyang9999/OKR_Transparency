import { NextResponse, type NextRequest } from "next/server";
import { requireApiAccess } from "@/lib/admin/api-access";
import { readAdminConfig } from "@/lib/admin/config";
import { readDraft, writeDraft } from "@/lib/okr/drafts";
import { validateDraft, type OkrDraft } from "@/lib/okr/edit-types";
import { authorizeDraftChange, resolveRequestAccess } from "@/lib/admin/permissions";

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

    const draft = await request.json() as OkrDraft;
    const previous = await readDraft(draft.team, draft.periodId);
    const authorization = authorizeDraftChange(config, access, previous, draft);
    if (!authorization.ok) return NextResponse.json({ error: authorization.error }, { status: 403 });

    const saved = await writeDraft(draft, await getTeamOwner(draft.team), false);
    return NextResponse.json({ draft: saved, validation: validateDraft(saved) });
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

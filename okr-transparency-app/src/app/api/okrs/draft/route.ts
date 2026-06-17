import { NextResponse, type NextRequest } from "next/server";
import { isAuthorized } from "@/lib/admin-auth";
import { readAdminConfig } from "@/lib/admin/config";
import { readDraft, writeDraft } from "@/lib/okr/drafts";
import { validateDraft, type OkrDraft } from "@/lib/okr/edit-types";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const team = searchParams.get("team") ?? "Software";
  const periodId = searchParams.get("period") ?? "2026-Q3";
  const draft = await readDraft(team, periodId);
  return NextResponse.json({ draft, validation: validateDraft(draft) });
}

export async function PUT(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Admin token required" }, { status: 401 });
  }

  try {
    const draft = await request.json() as OkrDraft;
    const saved = await writeDraft(draft, await getTeamOwner(draft.team));
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

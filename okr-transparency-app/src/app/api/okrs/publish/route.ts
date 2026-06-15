import { NextResponse, type NextRequest } from "next/server";
import { isAuthorized } from "@/lib/admin-auth";
import { publishDraft } from "@/lib/okr/drafts";

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Admin token required" }, { status: 401 });
  }

  try {
    const body = await request.json() as { team?: string; periodId?: string };
    const result = await publishDraft(body.team ?? "Software", body.periodId ?? "2026-Q3");
    if (result.errors.length > 0) {
      return NextResponse.json(result, { status: 422 });
    }
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown publish error" },
      { status: 422 }
    );
  }
}

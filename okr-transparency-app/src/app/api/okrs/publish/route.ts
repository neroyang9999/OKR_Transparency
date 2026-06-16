import { NextResponse, type NextRequest } from "next/server";
import { isAuthorized } from "@/lib/admin-auth";
import { appendAdminEvent, backupCurrentSnapshot } from "@/lib/admin/config";
import { publishDraft } from "@/lib/okr/drafts";

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Admin token required" }, { status: 401 });
  }

  try {
    const body = await request.json() as { team?: string; periodId?: string };
    await backupCurrentSnapshot();
    const result = await publishDraft(body.team ?? "Software", body.periodId ?? "2026-Q3");
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
      message: `Published ${body.team ?? "Software"} ${body.periodId ?? "2026-Q3"}`
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

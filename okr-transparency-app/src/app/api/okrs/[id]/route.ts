import { NextResponse, type NextRequest } from "next/server";
import { requireApiAccess } from "@/lib/admin/api-access";
import { readPeriodSnapshot } from "@/lib/okr/drafts";
import { findOkrLineage } from "@/lib/okr/tree";
import { resolveViewerPeriod } from "@/lib/period-stages";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const authorization = await requireApiAccess(request);
  if (!authorization.ok) return authorization.response;

  const { id } = await context.params;
  const { config } = authorization;
  const period = resolveViewerPeriod(request.nextUrl.searchParams.get("period"), config, authorization.access.role);
  const snapshot = await readPeriodSnapshot(period);
  const result = findOkrLineage(snapshot.records, decodeURIComponent(id));

  if (!result) {
    return NextResponse.json({ error: "OKR not found" }, { status: 404 });
  }

  return NextResponse.json({ meta: snapshot.meta, ...result });
}

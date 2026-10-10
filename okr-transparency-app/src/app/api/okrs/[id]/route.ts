import { NextResponse, type NextRequest } from "next/server";
import { requireApiAccess } from "@/lib/admin/api-access";
import { readPeriodSnapshot } from "@/lib/okr/drafts";
import { findOkrLineage } from "@/lib/okr/tree";
import { normalizePeriod } from "@/lib/periods";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const authorization = await requireApiAccess(request);
  if (!authorization.ok) return authorization.response;

  const { id } = await context.params;
  const { config } = authorization;
  const period = normalizePeriod(request.nextUrl.searchParams.get("period") ?? undefined, config.periods, config.defaultPeriodId);
  const snapshot = await readPeriodSnapshot(period);
  const result = findOkrLineage(snapshot.records, decodeURIComponent(id));

  if (!result) {
    return NextResponse.json({ error: "OKR not found" }, { status: 404 });
  }

  return NextResponse.json({ meta: snapshot.meta, ...result });
}

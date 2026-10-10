import { NextResponse, type NextRequest } from "next/server";
import { requireApiAccess } from "@/lib/admin/api-access";
import { readPeriodSnapshot } from "@/lib/okr/drafts";
import { toOkrTreeResponse } from "@/lib/okr/store";
import { resolveViewerPeriod } from "@/lib/period-stages";

export async function GET(request: NextRequest) {
  const authorization = await requireApiAccess(request);
  if (!authorization.ok) return authorization.response;

  const { config } = authorization;
  const period = resolveViewerPeriod(request.nextUrl.searchParams.get("period"), config, authorization.access.role);
  return NextResponse.json(toOkrTreeResponse(await readPeriodSnapshot(period)));
}

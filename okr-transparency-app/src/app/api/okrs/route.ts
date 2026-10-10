import { NextResponse, type NextRequest } from "next/server";
import { requireApiAccess } from "@/lib/admin/api-access";
import { readPeriodSnapshot } from "@/lib/okr/drafts";
import { toOkrTreeResponse } from "@/lib/okr/store";
import { normalizePeriod } from "@/lib/periods";

export async function GET(request: NextRequest) {
  const authorization = await requireApiAccess(request);
  if (!authorization.ok) return authorization.response;

  const { config } = authorization;
  const period = normalizePeriod(request.nextUrl.searchParams.get("period") ?? undefined, config.periods, config.defaultPeriodId);
  return NextResponse.json(toOkrTreeResponse(await readPeriodSnapshot(period)));
}

import { NextResponse, type NextRequest } from "next/server";
import { requireApiAccess } from "@/lib/admin/api-access";
import { searchOkrs } from "@/lib/okr/search";
import { readOkrSnapshot } from "@/lib/okr/store";
import { confidenceLevels, okrTypes, type ConfidenceLevel, type OkrType } from "@/lib/okr/types";

export async function GET(request: NextRequest) {
  const authorization = await requireApiAccess(request);
  if (!authorization.ok) return authorization.response;

  const params = request.nextUrl.searchParams;
  const confidence = params.get("confidence") ?? "";
  const type = params.get("type") ?? "";

  if (confidence && !confidenceLevels.includes(confidence as ConfidenceLevel)) {
    return NextResponse.json({ error: "Invalid confidence filter" }, { status: 400 });
  }
  if (type && !okrTypes.includes(type as OkrType)) {
    return NextResponse.json({ error: "Invalid type filter" }, { status: 400 });
  }

  const snapshot = await readOkrSnapshot();
  const results = searchOkrs(snapshot.records, {
    q: params.get("q") ?? "",
    team: params.get("team") ?? "",
    confidence: confidence as ConfidenceLevel | "",
    type: type as OkrType | ""
  });

  return NextResponse.json({ meta: snapshot.meta, count: results.length, results });
}

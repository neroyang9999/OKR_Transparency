import { NextResponse, type NextRequest } from "next/server";
import { requireApiAccess } from "@/lib/admin/api-access";
import { getOkrTreeResponse } from "@/lib/okr/store";

export async function GET(request: NextRequest) {
  const authorization = await requireApiAccess(request);
  if (!authorization.ok) return authorization.response;

  return NextResponse.json(await getOkrTreeResponse());
}

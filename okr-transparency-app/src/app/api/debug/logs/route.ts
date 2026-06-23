import { NextResponse, type NextRequest } from "next/server";
import { isAuthorized } from "@/lib/admin-auth";
import { readRecentAppLogs } from "@/lib/app-log";

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Admin token required" }, { status: 401 });
  }

  const limit = Number(request.nextUrl.searchParams.get("limit") ?? 200);
  const logs = await readRecentAppLogs(Number.isFinite(limit) ? limit : 200);
  return NextResponse.json({ logs });
}

import { NextResponse, type NextRequest } from "next/server";
import { isAuthorized } from "@/lib/admin-auth";
import { readAdminEvents } from "@/lib/admin/config";

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Admin session required" }, { status: 401 });
  }
  return NextResponse.json({ events: await readAdminEvents() });
}

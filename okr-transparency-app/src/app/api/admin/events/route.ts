import { NextResponse, type NextRequest } from "next/server";
import { readAdminConfig, readAdminEvents } from "@/lib/admin/config";
import { canManageAdmin, resolveRequestAccess } from "@/lib/admin/permissions";

export async function GET(request: NextRequest) {
  const config = await readAdminConfig();
  const access = await resolveRequestAccess(request, config);
  if (!canManageAdmin(access)) {
    return NextResponse.json({ error: "Admin session required" }, { status: 401 });
  }
  return NextResponse.json({ events: await readAdminEvents() });
}

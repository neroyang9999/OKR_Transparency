import { NextResponse, type NextRequest } from "next/server";
import { readAdminConfig } from "@/lib/admin/config";
import { canManageAdmin, resolveRequestAccess } from "@/lib/admin/permissions";

export async function GET(request: NextRequest) {
  const config = await readAdminConfig();
  const access = await resolveRequestAccess(request, config);
  return NextResponse.json({
    authenticated: canManageAdmin(access),
    user: access ? {
      email: access.email,
      displayName: access.displayName,
      role: access.role,
      source: access.source
    } : null
  });
}

import { NextResponse, type NextRequest } from "next/server";
import { readAdminConfig, writeAdminConfig, type AdminConfig } from "@/lib/admin/config";
import { canManageAdmin, resolveRequestAccess } from "@/lib/admin/permissions";

export async function GET(request: NextRequest) {
  const currentConfig = await readAdminConfig();
  const access = await resolveRequestAccess(request, currentConfig);
  if (!canManageAdmin(access)) {
    return NextResponse.json({ error: "Admin session required" }, { status: 401 });
  }
  return NextResponse.json({ config: currentConfig });
}

export async function PUT(request: NextRequest) {
  const currentConfig = await readAdminConfig();
  const access = await resolveRequestAccess(request, currentConfig);
  if (!canManageAdmin(access)) {
    return NextResponse.json({ error: "Admin session required" }, { status: 401 });
  }
  const body = await request.json() as AdminConfig;
  const config = await writeAdminConfig(body, access?.displayName ?? "Admin");
  return NextResponse.json({ config });
}

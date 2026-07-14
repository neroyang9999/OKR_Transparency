import { NextResponse, type NextRequest } from "next/server";
import { readAdminConfig, validateAdminConfig, writeAdminConfig, type AdminConfig } from "@/lib/admin/config";
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
  const errors = validateAdminConfig(body);
  if (errors.length > 0) return NextResponse.json({ error: errors[0], errors }, { status: 422 });
  const config = await writeAdminConfig(body, access?.displayName ?? "Admin");
  return NextResponse.json({ config });
}

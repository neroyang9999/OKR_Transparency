import { NextResponse, type NextRequest } from "next/server";
import { readAdminConfig, validateAdminConfigUpdate, writeAdminConfig, type AdminConfig } from "@/lib/admin/config";
import { canManageAdmin, resolveRequestAccess } from "@/lib/admin/permissions";
import { APP_VERSION } from "@/lib/app-version";
import { getStorageMode } from "@/lib/storage/mode";

export async function GET(request: NextRequest) {
  const currentConfig = await readAdminConfig();
  const access = await resolveRequestAccess(request, currentConfig);
  if (!canManageAdmin(access)) {
    return NextResponse.json({ error: "Admin session required" }, { status: 401 });
  }
  return NextResponse.json({
    config: currentConfig,
    system: { appVersion: APP_VERSION, storageMode: getStorageMode() }
  });
}

export async function PUT(request: NextRequest) {
  const currentConfig = await readAdminConfig();
  const access = await resolveRequestAccess(request, currentConfig);
  if (!canManageAdmin(access)) {
    return NextResponse.json({ error: "Admin session required" }, { status: 401 });
  }
  const body = await request.json() as AdminConfig | { config: AdminConfig; expectedRevision?: number };
  const config = "config" in body ? body.config : body;
  const expectedRevision = "config" in body ? body.expectedRevision : config.revision;
  if (expectedRevision !== currentConfig.revision) {
    return NextResponse.json({
      error: "配置已被其他管理员更新，请刷新后重试",
      code: "CONFIG_CONFLICT",
      currentRevision: currentConfig.revision
    }, { status: 409 });
  }
  const errors = validateAdminConfigUpdate(config, access?.email ?? "");
  if (errors.length > 0) return NextResponse.json({ error: errors[0], errors }, { status: 422 });
  const savedConfig = await writeAdminConfig(config, access?.displayName ?? "Admin");
  return NextResponse.json({ config: savedConfig });
}

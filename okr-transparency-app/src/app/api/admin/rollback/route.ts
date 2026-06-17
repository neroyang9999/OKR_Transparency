import { NextResponse, type NextRequest } from "next/server";
import { readAdminConfig, rollbackSnapshot } from "@/lib/admin/config";
import { canManageAdmin, resolveRequestAccess } from "@/lib/admin/permissions";

export async function POST(request: NextRequest) {
  const config = await readAdminConfig();
  const access = await resolveRequestAccess(request, config);
  if (!canManageAdmin(access)) {
    return NextResponse.json({ error: "Admin session required" }, { status: 401 });
  }

  try {
    const snapshot = await rollbackSnapshot(access?.displayName ?? "Admin");
    return NextResponse.json({ snapshot });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No rollback snapshot is available" },
      { status: 422 }
    );
  }
}

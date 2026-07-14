import { NextResponse, type NextRequest } from "next/server";
import { readAdminConfig } from "@/lib/admin/config";
import { diffVersionRecords } from "@/lib/admin/dashboard";
import { canManageAdmin, resolveRequestAccess } from "@/lib/admin/permissions";
import { readPeriodRecords } from "@/lib/okr/drafts";
import { readSnapshotVersion } from "@/lib/okr/snapshot-versions";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const config = await readAdminConfig();
  const access = await resolveRequestAccess(request, config);
  if (!canManageAdmin(access)) return NextResponse.json({ error: "Admin session required" }, { status: 401 });

  const { id } = await context.params;
  const version = await readSnapshotVersion(decodeURIComponent(id));
  if (!version) return NextResponse.json({ error: "Version not found" }, { status: 404 });
  const currentRecords = (await readPeriodRecords(version.periodId) ?? []).filter((record) => record.team === version.team);
  return NextResponse.json({ version, diff: diffVersionRecords(currentRecords, version.records) });
}

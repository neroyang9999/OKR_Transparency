import { NextResponse, type NextRequest } from "next/server";
import { readAdminConfig, readAdminEvents } from "@/lib/admin/config";
import { canManageAdmin, resolveRequestAccess } from "@/lib/admin/permissions";
import { readDraft, readPeriodRecords } from "@/lib/okr/drafts";
import { readProgressNotes } from "@/lib/okr/progress-notes";
import { listSnapshotVersions } from "@/lib/okr/snapshot-versions";
import { readOkrSnapshot } from "@/lib/okr/store";

export async function GET(request: NextRequest) {
  const config = await readAdminConfig();
  const access = await resolveRequestAccess(request, config);
  if (!canManageAdmin(access)) return NextResponse.json({ error: "Admin session required" }, { status: 401 });
  if (!config.settings.backupExportEnabled) return NextResponse.json({ error: "Backup export is disabled" }, { status: 403 });

  const enabledTeams = config.teams.filter((team) => team.enabled);
  const [snapshot, notes, events, versions, periods, drafts] = await Promise.all([
    readOkrSnapshot(),
    readProgressNotes(),
    readAdminEvents(),
    listSnapshotVersions(200),
    Promise.all(config.periods.map(async (period) => ({ periodId: period.id, records: await readPeriodRecords(period.id) ?? [] }))),
    Promise.all(config.periods.flatMap((period) => enabledTeams.map(async (team) => readDraft(team.name, period.id))))
  ]);
  const exportedAt = new Date().toISOString();

  return new NextResponse(JSON.stringify({ version: 1, exportedAt, config, snapshot, periods, drafts, notes, events, versions }, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="okr-backup-${exportedAt.slice(0, 10)}.json"`
    }
  });
}

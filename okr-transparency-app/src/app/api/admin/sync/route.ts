import { NextResponse, type NextRequest } from "next/server";
import { isAuthorized } from "@/lib/admin-auth";
import { appendAdminEvent, backupCurrentSnapshot } from "@/lib/admin/config";
import { syncFromConfiguredSource } from "@/lib/okr/sync";
import { readOkrSnapshot } from "@/lib/okr/store";

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Admin session required" }, { status: 401 });
  }

  try {
    await backupCurrentSnapshot();
    const snapshot = await syncFromConfiguredSource();
    await appendAdminEvent({
      type: "sync",
      actor: "Admin",
      status: "ok",
      message: `Synced ${snapshot.records.length} OKR records`
    });
    return NextResponse.json(snapshot);
  } catch (error) {
    const snapshot = await readOkrSnapshot();
    await appendAdminEvent({
      type: "sync",
      actor: "Admin",
      status: "error",
      message: error instanceof Error ? error.message : "Unknown sync error"
    });
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown sync error",
        fallback: {
          meta: snapshot.meta,
          rowCount: snapshot.records.length
        }
      },
      { status: 422 }
    );
  }
}

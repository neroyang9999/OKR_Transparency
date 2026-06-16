import { NextResponse, type NextRequest } from "next/server";
import { isAuthorized } from "@/lib/admin-auth";
import { rollbackSnapshot } from "@/lib/admin/config";

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Admin session required" }, { status: 401 });
  }

  try {
    const snapshot = await rollbackSnapshot();
    return NextResponse.json({ snapshot });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No rollback snapshot is available" },
      { status: 422 }
    );
  }
}

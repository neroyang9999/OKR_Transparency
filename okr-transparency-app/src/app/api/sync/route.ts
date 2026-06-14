import { NextResponse, type NextRequest } from "next/server";
import { syncFromConfiguredSource } from "@/lib/okr/sync";
import { readOkrSnapshot } from "@/lib/okr/store";

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Admin token required" }, { status: 401 });
  }

  try {
    const snapshot = await syncFromConfiguredSource();
    return NextResponse.json(snapshot);
  } catch (error) {
    const snapshot = await readOkrSnapshot();
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

function isAuthorized(request: NextRequest) {
  const expectedToken =
    process.env.OKR_ADMIN_TOKEN ??
    (process.env.NODE_ENV === "production" ? "" : "dev-admin-token");

  const headerToken = request.headers.get("x-admin-token");
  const authHeader = request.headers.get("authorization") ?? "";
  const bearerToken = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : "";

  return Boolean(expectedToken) && (headerToken === expectedToken || bearerToken === expectedToken);
}

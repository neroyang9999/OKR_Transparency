import { NextResponse, type NextRequest } from "next/server";
import { readOkrSnapshot } from "@/lib/okr/store";
import { findOkrLineage } from "@/lib/okr/tree";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const snapshot = await readOkrSnapshot();
  const result = findOkrLineage(snapshot.records, decodeURIComponent(id));

  if (!result) {
    return NextResponse.json({ error: "OKR not found" }, { status: 404 });
  }

  return NextResponse.json({ meta: snapshot.meta, ...result });
}

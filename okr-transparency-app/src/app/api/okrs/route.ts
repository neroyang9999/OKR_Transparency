import { NextResponse } from "next/server";
import { getOkrTreeResponse } from "@/lib/okr/store";

export async function GET() {
  return NextResponse.json(await getOkrTreeResponse());
}

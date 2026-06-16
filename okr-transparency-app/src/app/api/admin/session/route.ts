import { NextResponse, type NextRequest } from "next/server";
import { isAuthorized } from "@/lib/admin-auth";

export async function GET(request: NextRequest) {
  return NextResponse.json({ authenticated: isAuthorized(request) });
}

import { NextResponse, type NextRequest } from "next/server";
import { isAuthorized } from "@/lib/admin-auth";
import { readAdminConfig, writeAdminConfig, type AdminConfig } from "@/lib/admin/config";

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Admin session required" }, { status: 401 });
  }
  const config = await readAdminConfig();
  return NextResponse.json({ config });
}

export async function PUT(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Admin session required" }, { status: 401 });
  }
  const body = await request.json() as AdminConfig;
  const config = await writeAdminConfig(body);
  return NextResponse.json({ config });
}

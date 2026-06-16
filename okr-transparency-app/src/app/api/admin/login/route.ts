import { NextResponse, type NextRequest } from "next/server";
import { adminSessionCookieName, createAdminSessionValue, verifyAdminToken } from "@/lib/admin-auth";
import { appendAdminEvent } from "@/lib/admin/config";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({})) as { token?: string };
  if (!verifyAdminToken(body.token ?? "")) {
    await appendAdminEvent({
      type: "login",
      actor: "Admin",
      status: "error",
      message: "Invalid admin token"
    });
    return NextResponse.json({ error: "Invalid admin token" }, { status: 401 });
  }

  await appendAdminEvent({
    type: "login",
    actor: "Admin",
    status: "ok",
    message: "Admin login"
  });

  const response = NextResponse.json({ ok: true });
  response.cookies.set(adminSessionCookieName, createAdminSessionValue(body.token), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 8
  });
  return response;
}

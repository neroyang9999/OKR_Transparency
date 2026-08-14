import { NextResponse, type NextRequest } from "next/server";
import { adminSessionCookieName, createAdminSessionValue, verifyAdminToken } from "@/lib/admin-auth";
import { appendAdminEvent } from "@/lib/admin/config";
import { checkLoginRateLimit, clearLoginAttempts, loginRateLimitClient, recordFailedLogin } from "@/lib/admin/login-rate-limit";

export async function POST(request: NextRequest) {
  const client = loginRateLimitClient(request.headers);
  const rateLimit = checkLoginRateLimit(client);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many failed attempts. Try again later." },
      { status: 429, headers: { "retry-after": String(rateLimit.retryAfterSeconds) } }
    );
  }

  const body = await request.json().catch(() => ({})) as { token?: string };
  if (!verifyAdminToken(body.token ?? "")) {
    recordFailedLogin(client);
    await appendAdminEvent({
      type: "login",
      actor: "Admin",
      status: "error",
      message: "Invalid admin token"
    });
    return NextResponse.json({ error: "Invalid admin token" }, { status: 401 });
  }

  clearLoginAttempts(client);
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

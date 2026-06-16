import type { NextRequest } from "next/server";
import { createHash } from "crypto";

export const adminSessionCookieName = "okr_admin_session";

export function isAuthorized(request: NextRequest) {
  const expectedToken = getExpectedAdminToken();

  const headerToken = request.headers.get("x-admin-token");
  const authHeader = request.headers.get("authorization") ?? "";
  const bearerToken = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : "";
  const sessionToken = request.cookies.get(adminSessionCookieName)?.value ?? "";

  return Boolean(expectedToken) && (
    headerToken === expectedToken ||
    bearerToken === expectedToken ||
    sessionToken === createAdminSessionValue(expectedToken)
  );
}

export function verifyAdminToken(token: string) {
  const expectedToken = getExpectedAdminToken();
  return Boolean(expectedToken) && token === expectedToken;
}

export function createAdminSessionValue(token = getExpectedAdminToken()) {
  return createHash("sha256").update(`okr-admin:${token}`).digest("hex");
}

export function getExpectedAdminToken() {
  return process.env.OKR_ADMIN_TOKEN ?? (process.env.NODE_ENV === "production" ? "" : "dev-admin-token");
}

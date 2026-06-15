import type { NextRequest } from "next/server";

export function isAuthorized(request: NextRequest) {
  const expectedToken =
    process.env.OKR_ADMIN_TOKEN ??
    (process.env.NODE_ENV === "production" ? "" : "dev-admin-token");

  const headerToken = request.headers.get("x-admin-token");
  const authHeader = request.headers.get("authorization") ?? "";
  const bearerToken = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : "";

  return Boolean(expectedToken) && (headerToken === expectedToken || bearerToken === expectedToken);
}

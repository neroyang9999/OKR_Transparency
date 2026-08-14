import type { NextRequest } from "next/server";
import { createHash, timingSafeEqual } from "crypto";

export const adminSessionCookieName = "okr_admin_session";

export function isAuthorized(request: NextRequest) {
  const expectedToken = getExpectedAdminToken();
  if (!expectedToken) return false;

  const headerToken = request.headers.get("x-admin-token") ?? "";
  const authHeader = request.headers.get("authorization") ?? "";
  const bearerToken = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : "";
  const sessionToken = request.cookies.get(adminSessionCookieName)?.value ?? "";

  return secretsMatch(headerToken, expectedToken) ||
    secretsMatch(bearerToken, expectedToken) ||
    secretsMatch(sessionToken, createAdminSessionValue(expectedToken));
}

export function verifyAdminToken(token: string) {
  const expectedToken = getExpectedAdminToken();
  return Boolean(expectedToken) && secretsMatch(token, expectedToken);
}

export function createAdminSessionValue(token = getExpectedAdminToken()) {
  return createHash("sha256").update(`okr-admin:${token}`).digest("hex");
}

export function getExpectedAdminToken() {
  return process.env.OKR_ADMIN_TOKEN ?? (process.env.NODE_ENV === "production" ? "" : "dev-admin-token");
}

/**
 * Compares in time independent of how many leading characters match, so the
 * duration of a rejected request says nothing about how close the guess was.
 * Hashing both sides first keeps the comparison constant-length, which
 * timingSafeEqual requires and which also hides the length of the secret.
 */
function secretsMatch(candidate: string, expected: string) {
  const candidateDigest = createHash("sha256").update(candidate).digest();
  const expectedDigest = createHash("sha256").update(expected).digest();
  return timingSafeEqual(candidateDigest, expectedDigest);
}

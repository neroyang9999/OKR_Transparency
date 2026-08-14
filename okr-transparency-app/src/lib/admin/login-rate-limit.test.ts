import { beforeEach, describe, expect, it } from "vitest";
import {
  checkLoginRateLimit,
  clearLoginAttempts,
  loginRateLimitClient,
  recordFailedLogin,
  resetLoginRateLimit
} from "./login-rate-limit";

const start = Date.parse("2026-08-14T09:00:00.000Z");

beforeEach(() => {
  resetLoginRateLimit();
});

describe("login rate limiting", () => {
  it("allows attempts until the failure budget for the window runs out", () => {
    for (let attempt = 0; attempt < 9; attempt += 1) {
      expect(checkLoginRateLimit("10.0.0.1", start).allowed).toBe(true);
      recordFailedLogin("10.0.0.1", start);
    }

    expect(checkLoginRateLimit("10.0.0.1", start).allowed).toBe(true);
    recordFailedLogin("10.0.0.1", start);

    const verdict = checkLoginRateLimit("10.0.0.1", start);
    expect(verdict.allowed).toBe(false);
    expect(verdict.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("lets the client back in once the block expires", () => {
    for (let attempt = 0; attempt < 10; attempt += 1) recordFailedLogin("10.0.0.1", start);
    expect(checkLoginRateLimit("10.0.0.1", start).allowed).toBe(false);

    expect(checkLoginRateLimit("10.0.0.1", start + 16 * 60_000).allowed).toBe(true);
  });

  it("blocks only the client that failed", () => {
    for (let attempt = 0; attempt < 10; attempt += 1) recordFailedLogin("10.0.0.1", start);

    expect(checkLoginRateLimit("10.0.0.1", start).allowed).toBe(false);
    expect(checkLoginRateLimit("10.0.0.2", start).allowed).toBe(true);
  });

  it("forgets failures that are older than the window", () => {
    for (let attempt = 0; attempt < 9; attempt += 1) recordFailedLogin("10.0.0.1", start);
    recordFailedLogin("10.0.0.1", start + 6 * 60_000);

    expect(checkLoginRateLimit("10.0.0.1", start + 6 * 60_000).allowed).toBe(true);
  });

  it("clears the record after a successful login", () => {
    for (let attempt = 0; attempt < 9; attempt += 1) recordFailedLogin("10.0.0.1", start);
    clearLoginAttempts("10.0.0.1");
    for (let attempt = 0; attempt < 9; attempt += 1) recordFailedLogin("10.0.0.1", start);

    expect(checkLoginRateLimit("10.0.0.1", start).allowed).toBe(true);
  });

  it("keys on the first forwarded hop", () => {
    expect(loginRateLimitClient(new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }))).toBe("203.0.113.7");
    expect(loginRateLimitClient(new Headers())).toBe("unknown");
  });
});

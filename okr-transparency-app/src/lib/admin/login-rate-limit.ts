export type LoginRateLimitVerdict = {
  allowed: boolean;
  retryAfterSeconds: number;
};

type AttemptRecord = {
  failures: number;
  windowStartedAt: number;
  blockedUntil: number;
};

const attemptWindowMs = 5 * 60_000;
const blockDurationMs = 15 * 60_000;
const maxFailuresPerWindow = 10;
const maxTrackedClients = 5_000;

const attemptsByClient = new Map<string, AttemptRecord>();

/**
 * Throttles admin token guessing per client. Cloud Run serves from several
 * instances and this state is per-instance, so it slows an attacker by a factor
 * of the instance count rather than stopping them outright — the durable
 * guarantee is still the token's own entropy. What it does buy unconditionally
 * is a ceiling on the audit-event writes a failed-login flood can trigger.
 */
export function checkLoginRateLimit(client: string, now = Date.now()): LoginRateLimitVerdict {
  const record = attemptsByClient.get(client);
  if (!record) return { allowed: true, retryAfterSeconds: 0 };

  if (record.blockedUntil > now) {
    return { allowed: false, retryAfterSeconds: Math.ceil((record.blockedUntil - now) / 1000) };
  }

  if (now - record.windowStartedAt > attemptWindowMs) {
    attemptsByClient.delete(client);
  }
  return { allowed: true, retryAfterSeconds: 0 };
}

export function recordFailedLogin(client: string, now = Date.now()) {
  pruneExpired(now);

  const record = attemptsByClient.get(client);
  if (!record || now - record.windowStartedAt > attemptWindowMs) {
    attemptsByClient.set(client, { failures: 1, windowStartedAt: now, blockedUntil: 0 });
    return;
  }

  record.failures += 1;
  if (record.failures >= maxFailuresPerWindow) {
    record.blockedUntil = now + blockDurationMs;
    record.failures = 0;
    record.windowStartedAt = now;
  }
}

export function clearLoginAttempts(client: string) {
  attemptsByClient.delete(client);
}

export function resetLoginRateLimit() {
  attemptsByClient.clear();
}

/**
 * The first forwarded hop is the closest thing to a client address behind a
 * Google load balancer. It is spoofable, so treat this as coarse throttling
 * rather than identification.
 */
export function loginRateLimitClient(headers: Headers) {
  const forwarded = headers.get("x-forwarded-for") ?? "";
  return forwarded.split(",")[0]?.trim() || "unknown";
}

function pruneExpired(now: number) {
  if (attemptsByClient.size < maxTrackedClients) return;

  attemptsByClient.forEach((record, client) => {
    const expired = record.blockedUntil <= now && now - record.windowStartedAt > attemptWindowMs;
    if (expired) attemptsByClient.delete(client);
  });
}

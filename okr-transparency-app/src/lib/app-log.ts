import { promises as fs } from "fs";
import path from "path";

export type AppLogLevel = "debug" | "info" | "warn" | "error";

export type AppLogEntry = {
  timestamp: string;
  level: AppLogLevel;
  scope: string;
  event: string;
  message: string;
  details?: Record<string, unknown>;
};

const dataDir = path.join(process.cwd(), "data");
const logPath = path.join(dataDir, "app-events.log");

export async function writeAppLog(entry: Omit<AppLogEntry, "timestamp">) {
  const line = JSON.stringify({
    timestamp: new Date().toISOString(),
    ...entry,
    details: entry.details ? sanitizeDetails(entry.details) : undefined
  });

  await fs.mkdir(dataDir, { recursive: true });
  await fs.appendFile(logPath, `${line}\n`, "utf8");
}

export async function readRecentAppLogs(limit = 200) {
  try {
    const text = await fs.readFile(logPath, "utf8");
    return text
      .trim()
      .split(/\r?\n/)
      .filter(Boolean)
      .slice(-limit)
      .map((line) => {
        try {
          return JSON.parse(line) as AppLogEntry;
        } catch {
          return {
            timestamp: new Date(0).toISOString(),
            level: "warn",
            scope: "log",
            event: "parse_failed",
            message: line
          } satisfies AppLogEntry;
        }
      });
  } catch {
    return [];
  }
}

function sanitizeDetails(details: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(details).map(([key, value]) => [
      key,
      shouldRedact(key) ? "[redacted]" : normalizeValue(value)
    ])
  );
}

function shouldRedact(key: string) {
  const normalized = key.toLowerCase();
  return normalized.includes("password") || normalized.includes("token") || normalized.includes("secret");
}

function normalizeValue(value: unknown): unknown {
  if (typeof value === "string") {
    return value.length > 2000 ? `${value.slice(0, 2000)}...[truncated]` : value;
  }

  if (Array.isArray(value)) {
    return value.map(normalizeValue);
  }

  if (value && typeof value === "object") {
    return sanitizeDetails(value as Record<string, unknown>);
  }

  return value;
}

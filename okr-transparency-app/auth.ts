import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { timingSafeEqual } from "crypto";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google,
    ...(credentialsLoginEnabled() ? [Credentials({
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" }
      },
      authorize(credentials) {
        const username = String(credentials?.username ?? "");
        const password = String(credentials?.password ?? "");
        const localAdmin = getLocalAdminCredentials();

        if (localAdmin && safeEquals(username, localAdmin.username) && safeEquals(password, localAdmin.password)) {
          logAuthEvent("info", "credentials.authorize.success", "Credentials login accepted", { username });
          return {
            id: "local-admin",
            name: "Admin",
            email: "admin@company.com"
          };
        }

        logAuthEvent("warn", "credentials.authorize.failed", "Credentials login rejected", {
          username,
          localAdminConfigured: Boolean(localAdmin)
        });
        return null;
      }
    })] : [])
  ],
  callbacks: {
    async signIn({ account, user }) {
      if (account?.provider !== "google") return true;

      const email = String(user.email ?? "").trim().toLowerCase();
      const allowed = await isAllowedGoogleUser(email);
      await logAuthEvent(allowed ? "info" : "warn", "google.sign_in.allowlist", allowed ? "Google login accepted" : "Google login rejected", {
        email,
        provider: account.provider
      });
      return allowed;
    }
  },
  events: {
    async signIn(message) {
      await logAuthEvent("info", "nextauth.sign_in", "NextAuth sign-in event", {
        provider: message.account?.provider,
        email: message.user.email
      });
    },
    async signOut() {
      await logAuthEvent("info", "nextauth.sign_out", "NextAuth sign-out event");
    }
  },
  logger: {
    error(error) {
      logAuthEvent("error", "nextauth.error", "NextAuth error", {
        name: error.name,
        message: error.message,
        stack: error.stack
      });
    },
    warn(code) {
      logAuthEvent("warn", "nextauth.warn", "NextAuth warning", { code });
    },
    debug(code, metadata) {
      logAuthEvent("debug", "nextauth.debug", "NextAuth debug", { code, metadata });
    }
  },
  trustHost: true,
  secret: process.env.AUTH_SECRET ?? (process.env.NODE_ENV === "production" ? undefined : "dev-auth-secret-change-me")
});

function credentialsLoginEnabled() {
  return process.env.NODE_ENV !== "production";
}

function getLocalAdminCredentials() {
  const username = process.env.OKR_LOCAL_ADMIN_USERNAME ?? "admin";
  const password = process.env.OKR_LOCAL_ADMIN_PASSWORD ?? "1234";

  if (!username || !password) return null;
  return { username, password };
}

async function isAllowedGoogleUser(email: string) {
  if (!email) return false;
  if (emailMatchesAllowedDomain(email)) return true;

  try {
    const { readAdminConfig } = await import("./src/lib/admin/config");
    const config = await readAdminConfig();
    return config.users.some((user) => user.enabled && user.email.trim().toLowerCase() === email);
  } catch (error) {
    await logAuthEvent("error", "google.sign_in.allowlist.error", "Failed to read login allowlist", {
      email,
      message: error instanceof Error ? error.message : "Unknown error"
    });
    return false;
  }
}

function emailMatchesAllowedDomain(email: string) {
  return getAllowedGoogleDomains().some((domain) => email.endsWith(`@${domain}`));
}

function getAllowedGoogleDomains() {
  const raw = process.env.OKR_ALLOWED_GOOGLE_DOMAINS ?? "unitxlabs.com";
  return raw
    .split(",")
    .map((domain) => domain.trim().toLowerCase().replace(/^@/, ""))
    .filter(Boolean);
}

function safeEquals(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

async function logAuthEvent(
  level: "debug" | "info" | "warn" | "error",
  event: string,
  message: string,
  details?: Record<string, unknown>
) {
  try {
    const { writeAppLog } = await import("./src/lib/app-log");
    await writeAppLog({ level, scope: "auth", event, message, details });
  } catch {
    // Logging must not block login.
  }
}

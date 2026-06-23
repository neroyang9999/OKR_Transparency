import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { timingSafeEqual } from "crypto";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google,
    Credentials({
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
    })
  ],
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

function getLocalAdminCredentials() {
  const username = process.env.OKR_LOCAL_ADMIN_USERNAME ?? (process.env.NODE_ENV === "production" ? "" : "admin");
  const password = process.env.OKR_LOCAL_ADMIN_PASSWORD ?? (process.env.NODE_ENV === "production" ? "" : "1234");

  if (!username || !password) return null;
  return { username, password };
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

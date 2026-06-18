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
          return {
            id: "local-admin",
            name: "Admin",
            email: "admin@company.com"
          };
        }

        return null;
      }
    })
  ],
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

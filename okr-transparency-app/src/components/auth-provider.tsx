"use client";

import { createContext, useContext } from "react";
import { SessionProvider } from "next-auth/react";

type AuthMode = "iap" | "authjs";

type AppIdentity = {
  mode: AuthMode;
  email?: string;
};

const AppIdentityContext = createContext<AppIdentity>({ mode: "authjs" });

export function AuthProvider({
  children,
  mode,
  email
}: {
  children: React.ReactNode;
  mode: AuthMode;
  email?: string;
}) {
  return (
    <AppIdentityContext.Provider value={{ mode, email }}>
      <SessionProvider>{children}</SessionProvider>
    </AppIdentityContext.Provider>
  );
}

export function useAppIdentity() {
  return useContext(AppIdentityContext);
}

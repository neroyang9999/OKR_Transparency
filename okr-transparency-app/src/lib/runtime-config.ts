import { getAllowedGoogleDomains } from "./allowed-google-domains";
import { getAppLogDestination, type AppLogDestination } from "./app-log";
import { getStorageMode, type OkrStorageMode } from "./storage/mode";

export type RuntimeAuthMode = "iap" | "google-oauth";

export type RuntimeConfigSummary = {
  production: boolean;
  storageMode: OkrStorageMode;
  authMode: RuntimeAuthMode;
  allowedGoogleDomains: string[];
  adminTokenLoginEnabled: boolean;
  localCredentialsEnabled: boolean;
  logDestination: AppLogDestination;
  warnings: string[];
};

/**
 * Every protection in this app is chosen by an environment variable, and an
 * unset variable always degrades quietly to the weaker mode — no IAP audience
 * silently falls back to Google login, no OKR_STORAGE silently writes to the
 * container filesystem. Summarising the resolved modes at boot turns that
 * silent drift into a line in the logs.
 */
export function describeRuntimeConfiguration(env: NodeJS.ProcessEnv = process.env): RuntimeConfigSummary {
  const production = env.NODE_ENV === "production";
  const authMode: RuntimeAuthMode = env.IAP_EXPECTED_AUDIENCE?.trim() ? "iap" : "google-oauth";
  const localCredentialsEnabled = !production || env.OKR_ENABLE_LOCAL_CREDENTIALS === "true";
  const adminTokenLoginEnabled = Boolean(env.OKR_ADMIN_TOKEN ?? (production ? "" : "dev-admin-token"));
  const storageMode = getStorageMode(env);
  const warnings: string[] = [];

  if (production && authMode === "google-oauth") {
    warnings.push("IAP_EXPECTED_AUDIENCE is unset: requests are accepted on Google sign-in alone, so anyone reaching the container URL bypasses IAP.");
  }
  if (production && storageMode === "file") {
    warnings.push("OKR_STORAGE=file in production: data is written to the container filesystem and is lost when the instance is replaced.");
  }
  if (production && localCredentialsEnabled) {
    warnings.push("OKR_ENABLE_LOCAL_CREDENTIALS=true in production: the username and password login is reachable alongside SSO.");
  }
  if (production && env.OKR_DEV_BYPASS_AUTH === "true") {
    warnings.push("OKR_DEV_BYPASS_AUTH=true is set but is ignored in production builds.");
  }
  if (production && !env.AUTH_SECRET?.trim()) {
    warnings.push("AUTH_SECRET is unset: NextAuth cannot sign sessions and login will fail.");
  }

  return {
    production,
    storageMode,
    authMode,
    allowedGoogleDomains: getAllowedGoogleDomains(env),
    adminTokenLoginEnabled,
    localCredentialsEnabled,
    logDestination: getAppLogDestination(env),
    warnings
  };
}

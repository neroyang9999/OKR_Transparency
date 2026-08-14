import { describe, expect, it } from "vitest";
import { describeRuntimeConfiguration } from "./runtime-config";

const productionEnv = {
  NODE_ENV: "production",
  IAP_EXPECTED_AUDIENCE: "/projects/1/global/backendServices/2",
  OKR_STORAGE: "firestore",
  AUTH_SECRET: "a-real-secret",
  OKR_ALLOWED_GOOGLE_DOMAINS: "unitxlabs.com"
} as unknown as NodeJS.ProcessEnv;

describe("describeRuntimeConfiguration", () => {
  it("reports a correctly configured production deployment with no warnings", () => {
    const summary = describeRuntimeConfiguration(productionEnv);

    expect(summary).toMatchObject({ production: true, authMode: "iap", storageMode: "firestore" });
    expect(summary.warnings).toEqual([]);
  });

  it("warns when IAP is not enforced, because requests fall back to Google sign-in alone", () => {
    const summary = describeRuntimeConfiguration({ ...productionEnv, IAP_EXPECTED_AUDIENCE: "" });

    expect(summary.authMode).toBe("google-oauth");
    expect(summary.warnings.join(" ")).toContain("IAP_EXPECTED_AUDIENCE");
  });

  it("warns when the fallback password login is enabled in production", () => {
    const summary = describeRuntimeConfiguration({ ...productionEnv, OKR_ENABLE_LOCAL_CREDENTIALS: "true" });

    expect(summary.localCredentialsEnabled).toBe(true);
    expect(summary.warnings.join(" ")).toContain("OKR_ENABLE_LOCAL_CREDENTIALS");
  });

  it("warns when production would write to the container filesystem", () => {
    const summary = describeRuntimeConfiguration({ ...productionEnv, OKR_STORAGE: "file" });

    expect(summary.warnings.join(" ")).toContain("OKR_STORAGE=file");
  });

  it("warns when AUTH_SECRET is missing", () => {
    const summary = describeRuntimeConfiguration({ ...productionEnv, AUTH_SECRET: "" });

    expect(summary.warnings.join(" ")).toContain("AUTH_SECRET");
  });

  it("keeps development defaults quiet", () => {
    const summary = describeRuntimeConfiguration({ NODE_ENV: "development", OKR_STORAGE: "file" } as unknown as NodeJS.ProcessEnv);

    expect(summary.production).toBe(false);
    expect(summary.warnings).toEqual([]);
  });
});

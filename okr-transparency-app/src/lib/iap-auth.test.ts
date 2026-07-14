import { generateKeyPair, SignJWT } from "jose";
import { describe, expect, it } from "vitest";
import { verifyIapJwt } from "./iap-auth";

const audience = "/projects/123456789/locations/us-west1/services/okr-transparency-app";

describe("IAP JWT verification", () => {
  it("accepts a signed token with the expected issuer, audience, subject, and email", async () => {
    const { publicKey, privateKey } = await generateKeyPair("ES256");
    const token = await new SignJWT({ email: "Lead@Company.com" })
      .setProtectedHeader({ alg: "ES256" })
      .setIssuer("https://cloud.google.com/iap")
      .setAudience(audience)
      .setSubject("accounts.google.com:123456")
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(privateKey);

    await expect(verifyIapJwt(token, audience, publicKey)).resolves.toEqual({
      email: "lead@company.com",
      subject: "accounts.google.com:123456"
    });
  });

  it("rejects a token issued for a different Cloud Run service", async () => {
    const { publicKey, privateKey } = await generateKeyPair("ES256");
    const token = await new SignJWT({ email: "lead@company.com" })
      .setProtectedHeader({ alg: "ES256" })
      .setIssuer("https://cloud.google.com/iap")
      .setAudience("/projects/other/locations/us-west1/services/other")
      .setSubject("accounts.google.com:123456")
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(privateKey);

    await expect(verifyIapJwt(token, audience, publicKey)).resolves.toBeNull();
  });
});

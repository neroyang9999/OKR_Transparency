import { createRemoteJWKSet, jwtVerify } from "jose";

const IAP_ISSUER = "https://cloud.google.com/iap";
const IAP_JWKS = createRemoteJWKSet(new URL("https://www.gstatic.com/iap/verify/public_key-jwk"));

type VerificationKey = Parameters<typeof jwtVerify>[1];

export type IapIdentity = {
  email: string;
  subject: string;
};

export function isIapAuthenticationRequired() {
  return Boolean(getExpectedIapAudience());
}

export async function verifyIapJwt(
  token: string,
  audience = getExpectedIapAudience(),
  verificationKey: VerificationKey = IAP_JWKS
): Promise<IapIdentity | null> {
  if (!token || !audience) return null;

  try {
    const { payload } = await jwtVerify(token, verificationKey, {
      algorithms: ["ES256"],
      audience,
      issuer: IAP_ISSUER
    });
    const email = normalizeIapEmail(payload.email);
    const subject = typeof payload.sub === "string" ? payload.sub.trim() : "";
    return email && subject ? { email, subject } : null;
  } catch {
    return null;
  }
}

function getExpectedIapAudience() {
  return process.env.IAP_EXPECTED_AUDIENCE?.trim() ?? "";
}

function normalizeIapEmail(value: unknown) {
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase().replace(/^accounts\.google\.com:/i, "");
}

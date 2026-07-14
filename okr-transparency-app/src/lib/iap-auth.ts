import { createRemoteJWKSet, jwtVerify, type CryptoKey, type JWK, type JWTVerifyGetKey, type KeyObject } from "jose";

const IAP_ISSUER = "https://cloud.google.com/iap";
const IAP_JWKS = createRemoteJWKSet(new URL("https://www.gstatic.com/iap/verify/public_key-jwk"));

type VerificationKey = CryptoKey | KeyObject | JWK | Uint8Array | JWTVerifyGetKey;

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
    const options = {
      algorithms: ["ES256"],
      audience,
      issuer: IAP_ISSUER
    };
    const { payload } = typeof verificationKey === "function"
      ? await jwtVerify(token, verificationKey, options)
      : await jwtVerify(token, verificationKey, options);
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

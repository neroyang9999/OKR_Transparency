export function emailMatchesAllowedGoogleDomain(email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  return getAllowedGoogleDomains().some((domain) => normalizedEmail.endsWith(`@${domain}`));
}

export function getAllowedGoogleDomains(env: NodeJS.ProcessEnv = process.env) {
  const raw = env.OKR_ALLOWED_GOOGLE_DOMAINS ?? "unitxlabs.com";
  return raw
    .split(",")
    .map((domain) => domain.trim().toLowerCase().replace(/^@/, ""))
    .filter(Boolean);
}

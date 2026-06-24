export function documentIdFromParts(parts: string[]) {
  const raw = parts.map((part) => part.trim()).join("\u0000");
  return Buffer
    .from(raw || "default", "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

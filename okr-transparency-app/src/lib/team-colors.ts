const teamColors: Record<string, string> = {
  emerald: "#10b981",
  violet: "#8b5cf6",
  amber: "#f59e0b",
  rose: "#f43f5e",
  slate: "#64748b",
  blue: "#3b82f6"
};

/** Resolves an admin-config team color ("emerald" or "bg-emerald-500") to its hex value. */
export function teamColor(color?: string) {
  const key = (color ?? "").replace(/^bg-/, "").replace(/-\d+$/, "");
  return teamColors[key] ?? teamColors.blue;
}

export function teamInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

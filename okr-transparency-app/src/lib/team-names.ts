const canonicalTeams: Record<string, string> = {
  "Integration Team": "System Team",
  "Platform Team": "Infra Team"
};

const canonicalOwners: Record<string, string> = {
  "Integration Lead": "System Leader",
  "Platform Lead": "Infra Leader"
};

export function canonicalTeamName(value: string) {
  return canonicalTeams[value.trim()] ?? value.trim();
}

export function canonicalOwnerName(value: string) {
  return canonicalOwners[value.trim()] ?? value.trim();
}

export function legacyTeamNamesFor(value: string) {
  const canonical = canonicalTeamName(value);
  return Object.entries(canonicalTeams)
    .filter(([, current]) => current === canonical)
    .map(([legacy]) => legacy);
}

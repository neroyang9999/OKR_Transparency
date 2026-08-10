import { promises as fs } from "fs";
import path from "path";
import { listFirestoreCollection, readFirestoreDocument, writeFirestoreDocument } from "../storage/firestore";
import { isFirestoreStorageEnabled } from "../storage/mode";
import { canonicalOwnerName, canonicalTeamName } from "../team-names";

const dataDir = path.join(process.cwd(), "data");
const configPath = path.join(dataDir, "okr-admin-config.json");
const eventsPath = path.join(dataDir, "okr-admin-events.json");
const configDocumentPath = "okrAdmin/config";

export type AdminPeriodStatus = "planned" | "active" | "locked";

export type AdminPeriod = {
  id: string;
  label: string;
  labelEn: string;
  shortLabel: string;
  status: AdminPeriodStatus;
};

export type AdminTeam = {
  id: string;
  name: string;
  owner: string;
  parentTeam: string;
  color: string;
  enabled: boolean;
};

export type AdminRole = "super_admin" | "team_leader" | "user";

export type AdminUser = {
  email: string;
  displayName: string;
  role: AdminRole;
  teams: string[];
  leaderTeams?: string[];
  ownerAliases: string[];
  enabled: boolean;
};

export type AdminConfig = {
  version: 2;
  revision: number;
  defaultPeriodId: string;
  periods: AdminPeriod[];
  defaultTeam: string;
  teams: AdminTeam[];
  users: AdminUser[];
  settings: {
    defaultLanguage: "zh" | "en";
    showEditLinks: boolean;
    allowProgressNotes: boolean;
    backupExportEnabled: boolean;
  };
};

export type AdminEvent = {
  id: string;
  type: "login" | "config.update" | "publish" | "rollback";
  actor: string;
  message: string;
  createdAt: string;
  status: "ok" | "error";
  details?: string[];
};

type EventFile = {
  version: 1;
  events: AdminEvent[];
};

type LegacyPeriod = Partial<AdminPeriod> & {
  editable?: boolean;
  locked?: boolean;
};

type LegacyTeam = Partial<AdminTeam>;

type AdminConfigInput = Partial<Omit<AdminConfig, "version" | "periods" | "teams">> & {
  version?: 1 | 2;
  periods?: LegacyPeriod[];
  teams?: LegacyTeam[];
  permissions?: unknown[];
};

export async function readAdminConfig(): Promise<AdminConfig> {
  if (isFirestoreStorageEnabled()) {
    const config = await readFirestoreDocument<AdminConfigInput>(configDocumentPath);
    return normalizeAdminConfig(config ?? {});
  }

  try {
    const text = await fs.readFile(configPath, "utf8");
    return normalizeAdminConfig(JSON.parse(text) as AdminConfigInput);
  } catch {
    return defaultAdminConfig();
  }
}

export async function writeAdminConfig(config: AdminConfig, actor = "Admin") {
  const currentConfig = await readAdminConfig();
  const nextConfig = normalizeAdminConfig({
    ...config,
    version: 2,
    revision: currentConfig.revision + 1
  });
  const details = summarizeAdminConfigChanges(currentConfig, nextConfig);

  if (isFirestoreStorageEnabled()) {
    await writeFirestoreDocument(configDocumentPath, nextConfig);
  } else {
    await fs.mkdir(dataDir, { recursive: true });
    await fs.writeFile(configPath, JSON.stringify(nextConfig, null, 2), "utf8");
  }

  await appendAdminEvent({
    type: "config.update",
    actor,
    status: "ok",
    message: details.length > 0 ? `Updated ${details.join(", ")}` : "Saved admin configuration",
    details
  });
  return nextConfig;
}

export function validateAdminConfig(config: AdminConfig) {
  const errors: string[] = [];
  const periodIds = config.periods.map((period) => period.id.trim()).filter(Boolean);
  const teamIds = config.teams.map((team) => team.id.trim()).filter(Boolean);
  const teamNames = config.teams.map((team) => team.name.trim()).filter(Boolean);
  const emails = config.users.map((user) => user.email.trim().toLowerCase()).filter(Boolean);
  addDuplicateErrors(periodIds, "period", errors);
  addDuplicateErrors(teamIds, "team id", errors);
  addDuplicateErrors(teamNames, "team", errors);
  addDuplicateErrors(emails, "user email", errors);

  if (config.periods.length === 0) errors.push("At least one period is required");
  const activePeriods = config.periods.filter((period) => period.status === "active");
  if (activePeriods.length !== 1) errors.push("Exactly one active period is required");
  if (activePeriods[0]?.id !== config.defaultPeriodId) errors.push("The default period must be the active period");
  config.periods.forEach((period) => {
    if (!period.id.trim()) errors.push("Period id is required");
    if (!period.label.trim()) errors.push(`${period.id || "Period"}: Chinese label is required`);
    if (!period.shortLabel.trim()) errors.push(`${period.id || "Period"}: short label is required`);
  });

  const teamSet = new Set(teamNames);
  const parentByTeam = new Map(config.teams.map((team) => [team.name, team.parentTeam]));
  config.teams.forEach((team) => {
    if (!team.id.trim()) errors.push(`${team.name || "Team"}: stable id is required`);
    if (!team.name.trim()) errors.push("Team name is required");
    if (!team.owner.trim()) errors.push(`${team.name || "Team"}: owner is required`);
    if (team.parentTeam && !teamSet.has(team.parentTeam)) errors.push(`${team.name}: parent team ${team.parentTeam} does not exist`);
    const visited = new Set<string>();
    let cursor: string | undefined = team.name;
    while (cursor) {
      if (visited.has(cursor)) {
        errors.push(`${team.name}: team hierarchy cycle detected`);
        break;
      }
      visited.add(cursor);
      cursor = parentByTeam.get(cursor) || undefined;
    }
  });

  config.users.forEach((user) => {
    if (!user.email.trim()) errors.push("User email is required");
    if (user.email.trim() && !isValidEmail(user.email)) errors.push(`${user.email}: valid email is required`);
    if (!user.displayName.trim()) errors.push(`${user.email || "User"}: display name is required`);
    user.teams.forEach((team) => {
      if (!teamSet.has(team)) errors.push(`${user.email}: assigned team ${team} does not exist`);
    });
    (user.leaderTeams ?? []).forEach((team) => {
      if (!teamSet.has(team)) errors.push(`${user.email}: leader team ${team} does not exist`);
    });
  });
  if (config.users.filter((user) => user.enabled && user.role === "super_admin" && isValidEmail(user.email)).length < 2) {
    errors.push("At least two enabled system administrators with valid email addresses are required");
  }
  if (!teamSet.has(config.defaultTeam)) errors.push(`Default team ${config.defaultTeam} does not exist`);
  if (!periodIds.includes(config.defaultPeriodId)) errors.push(`Default period ${config.defaultPeriodId} does not exist`);
  return Array.from(new Set(errors));
}

export function validateAdminConfigUpdate(config: AdminConfig, actorEmail: string) {
  const errors = validateAdminConfig(config);
  const normalizedActorEmail = actorEmail.trim().toLowerCase();
  if (normalizedActorEmail && normalizedActorEmail !== "admin-token") {
    const actorRemainsAdmin = config.users.some((user) =>
      user.email.trim().toLowerCase() === normalizedActorEmail && user.enabled && user.role === "super_admin"
    );
    if (!actorRemainsAdmin) errors.push("You cannot remove, disable, or demote your own system administrator account");
  }
  return Array.from(new Set(errors));
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function normalizeAdminConfig(input: AdminConfigInput): AdminConfig {
  const fallback = defaultAdminConfig();
  const sourcePeriods = Array.isArray(input.periods) && input.periods.length > 0 ? input.periods : fallback.periods;
  const preliminaryPeriods = sourcePeriods.map((period, index) => normalizePeriod(period, index));
  const requestedDefault = preliminaryPeriods.some((period) => period.id === input.defaultPeriodId)
    ? String(input.defaultPeriodId)
    : preliminaryPeriods.find((period) => period.status === "active")?.id ?? preliminaryPeriods[0]?.id ?? fallback.defaultPeriodId;
  const periods = preliminaryPeriods.map((period) => ({
    ...period,
    status: period.id === requestedDefault ? "active" as const : period.status === "active" ? "planned" as const : period.status
  }));

  const sourceTeams = Array.isArray(input.teams) && input.teams.length > 0 ? input.teams : fallback.teams;
  const users = normalizeUsers(input.users, fallback.users);
  const teams = normalizeTeams(sourceTeams);
  const defaultTeam = teams.some((team) => team.name === input.defaultTeam)
    ? String(input.defaultTeam)
    : teams.find((team) => team.enabled)?.name ?? teams[0]?.name ?? fallback.defaultTeam;

  return {
    version: 2,
    revision: normalizeRevision(input.revision),
    defaultPeriodId: requestedDefault,
    periods,
    defaultTeam,
    teams,
    users,
    settings: {
      defaultLanguage: input.settings?.defaultLanguage === "en" ? "en" : "zh",
      showEditLinks: input.settings?.showEditLinks ?? fallback.settings.showEditLinks,
      allowProgressNotes: input.settings?.allowProgressNotes ?? fallback.settings.allowProgressNotes,
      backupExportEnabled: input.settings?.backupExportEnabled ?? fallback.settings.backupExportEnabled
    }
  };
}

export function summarizeAdminConfigChanges(previous: AdminConfig, next: AdminConfig) {
  const changes: string[] = [];
  if (JSON.stringify(previous.periods) !== JSON.stringify(next.periods) || previous.defaultPeriodId !== next.defaultPeriodId) changes.push("periods");
  if (JSON.stringify(previous.teams) !== JSON.stringify(next.teams) || previous.defaultTeam !== next.defaultTeam) changes.push("teams");
  if (JSON.stringify(previous.users) !== JSON.stringify(next.users)) changes.push("users and access");
  if (JSON.stringify(previous.settings) !== JSON.stringify(next.settings)) changes.push("system settings");
  return changes;
}

export async function readAdminEvents() {
  if (isFirestoreStorageEnabled()) {
    return listFirestoreCollection<AdminEvent>("okrAdminEvents", 200, "createdAt desc");
  }

  const file = await readEventFile();
  return file.events;
}

export async function appendAdminEvent(input: Omit<AdminEvent, "id" | "createdAt">) {
  const file = await readEventFile();
  const event: AdminEvent = {
    ...input,
    id: `evt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString()
  };

  if (isFirestoreStorageEnabled()) {
    await writeFirestoreDocument(`okrAdminEvents/${event.id}`, event);
    return event;
  }

  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(eventsPath, JSON.stringify({ version: 1, events: [event, ...file.events].slice(0, 200) }, null, 2), "utf8");
  return event;
}

function normalizePeriod(period: LegacyPeriod, index: number): AdminPeriod {
  const id = String(period.id ?? `period-${index + 1}`).trim() || `period-${index + 1}`;
  const explicitStatus = period.status === "planned" || period.status === "active" || period.status === "locked" ? period.status : null;
  const legacyStatus: AdminPeriodStatus = period.locked || period.editable === false ? "locked" : period.editable ? "active" : "planned";
  return {
    id,
    label: String(period.label ?? id).trim(),
    labelEn: String(period.labelEn ?? period.label ?? id).trim(),
    shortLabel: String(period.shortLabel ?? id).trim(),
    status: explicitStatus ?? legacyStatus
  };
}

function normalizeTeams(input: LegacyTeam[]) {
  const usedIds = new Set<string>();
  return input.map((team, index): AdminTeam => {
    const name = canonicalTeamName(String(team.name ?? `Team ${index + 1}`)) || `Team ${index + 1}`;
    const baseId = String(team.id ?? slugify(name) ?? `team-${index + 1}`).trim();
    let id = baseId;
    let suffix = 2;
    while (usedIds.has(id.toLowerCase())) id = `${baseId}-${suffix++}`;
    usedIds.add(id.toLowerCase());
    return {
      id,
      name,
      owner: canonicalOwnerName(String(team.owner ?? "")),
      parentTeam: canonicalTeamName(String(team.parentTeam ?? "")),
      color: normalizeTeamColor(team.color),
      enabled: team.enabled ?? true
    };
  });
}

function normalizeUsers(input: Partial<AdminUser>[] | undefined, fallback: AdminUser[]) {
  if (!Array.isArray(input)) return fallback;
  return input.map((user) => {
    const email = String(user.email ?? "").trim().toLowerCase();
    const displayName = String(user.displayName ?? "").trim();
    return {
      email,
      displayName,
      role: user.role === "super_admin" || user.role === "team_leader" || user.role === "user" ? user.role : "user",
      teams: Array.isArray(user.teams) ? unique(user.teams.map((team) => canonicalTeamName(String(team))).filter(Boolean)) : [],
      leaderTeams: Array.isArray(user.leaderTeams) ? unique(user.leaderTeams.map((team) => canonicalTeamName(String(team))).filter(Boolean)) : [],
      ownerAliases: unique([
        displayName,
        email,
        ...(Array.isArray(user.ownerAliases) ? user.ownerAliases.map((alias) => canonicalOwnerName(String(alias))) : [])
      ].filter(Boolean)),
      enabled: user.enabled ?? true
    };
  });
}

function defaultAdminConfig(): AdminConfig {
  return {
    version: 2,
    revision: 1,
    defaultPeriodId: "2026-q3",
    periods: [
      { id: "2026-q3", label: "2026 年 7 月 - 9 月", labelEn: "Jul - Sep 2026", shortLabel: "2026 Q3", status: "active" },
      { id: "2026-q2", label: "2026 年 4 月 - 6 月", labelEn: "Apr - Jun 2026", shortLabel: "2026 Q2", status: "locked" }
    ],
    defaultTeam: "Software",
    teams: [
      { id: "software", name: "Software", owner: "Software Lead", parentTeam: "", color: "blue", enabled: true },
      { id: "application-team", name: "Application Team", owner: "Application Lead", parentTeam: "Software", color: "blue", enabled: true },
      { id: "integration-team", name: "System Team", owner: "System Leader", parentTeam: "Software", color: "blue", enabled: true },
      { id: "qa-team", name: "QA Team", owner: "QA Lead", parentTeam: "Software", color: "blue", enabled: true },
      { id: "platform-team", name: "Infra Team", owner: "Infra Leader", parentTeam: "Software", color: "blue", enabled: true },
      { id: "algorithm-team", name: "Algorithm Team", owner: "Algorithm Lead", parentTeam: "Software", color: "blue", enabled: true },
      { id: "tpm-team", name: "TPM Team", owner: "TPM Lead", parentTeam: "Software", color: "blue", enabled: true },
      { id: "hardware", name: "Hardware", owner: "Hardware Lead", parentTeam: "", color: "emerald", enabled: true },
      { id: "advanced-technology", name: "Advanced Technology", owner: "Advanced Tech Lead", parentTeam: "", color: "violet", enabled: true },
      { id: "ap-ops", name: "AP OPS", owner: "AP OPS Lead", parentTeam: "", color: "amber", enabled: true }
    ],
    users: [
      { email: "admin@company.com", displayName: "Admin", role: "super_admin", teams: [], ownerAliases: ["Admin", "admin@company.com"], enabled: true },
      { email: "software-lead@company.com", displayName: "Software Lead", role: "team_leader", teams: ["Software"], ownerAliases: ["Software Lead", "software-lead@company.com"], enabled: true },
      { email: "member@company.com", displayName: "Team Member", role: "user", teams: ["Software"], ownerAliases: ["Team Member", "member@company.com"], enabled: true }
    ],
    settings: {
      defaultLanguage: "zh",
      showEditLinks: true,
      allowProgressNotes: true,
      backupExportEnabled: true
    }
  };
}

function normalizeRevision(value: unknown) {
  const revision = typeof value === "number" ? Math.floor(value) : Number(value);
  return Number.isFinite(revision) && revision > 0 ? revision : 1;
}

function normalizeTeamColor(value: unknown) {
  const raw = String(value ?? "slate").trim().toLowerCase();
  const token = raw.replace(/^bg-/, "").replace(/-500$/, "");
  return ["blue", "emerald", "violet", "amber", "rose", "slate"].includes(token) ? token : "slate";
}

function addDuplicateErrors(values: string[], label: string, errors: string[]) {
  const seen = new Set<string>();
  values.forEach((value) => {
    const normalized = value.toLowerCase();
    if (seen.has(normalized)) errors.push(`Duplicate ${label}: ${value}`);
    seen.add(normalized);
  });
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function unique(values: string[]) {
  return Array.from(new Set(values));
}

async function readEventFile(): Promise<EventFile> {
  try {
    const text = await fs.readFile(eventsPath, "utf8");
    const parsed = JSON.parse(text) as EventFile;
    return Array.isArray(parsed.events) ? parsed : { version: 1, events: [] };
  } catch {
    return { version: 1, events: [] };
  }
}

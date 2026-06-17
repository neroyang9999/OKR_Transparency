import { promises as fs } from "fs";
import path from "path";
import { readOkrSnapshot, writeOkrSnapshot } from "../okr/store";
import type { OkrSnapshot } from "../okr/types";

const dataDir = path.join(process.cwd(), "data");
const configPath = path.join(dataDir, "okr-admin-config.json");
const eventsPath = path.join(dataDir, "okr-admin-events.json");
const backupPath = path.join(dataDir, "okr-admin-rollback-snapshot.json");

export type AdminPeriod = {
  id: string;
  label: string;
  labelEn: string;
  shortLabel: string;
  editable: boolean;
  locked: boolean;
};

export type AdminTeam = {
  name: string;
  owner: string;
  parentTeam: string;
  color: string;
  enabled: boolean;
};

export type AdminPermission = {
  team: string;
  accounts: string;
  canEdit: boolean;
  canPublish: boolean;
  notes: string;
};

export type AdminRole = "super_admin" | "team_leader" | "user";

export type AdminUser = {
  email: string;
  displayName: string;
  role: AdminRole;
  teams: string[];
  ownerAliases: string[];
  enabled: boolean;
};

export type AdminConfig = {
  version: 1;
  defaultPeriodId: string;
  periods: AdminPeriod[];
  defaultTeam: string;
  teams: AdminTeam[];
  permissions: AdminPermission[];
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
  type: "login" | "config.update" | "sync" | "publish" | "rollback";
  actor: string;
  message: string;
  createdAt: string;
  status: "ok" | "error";
};

type EventFile = {
  version: 1;
  events: AdminEvent[];
};

export async function readAdminConfig(): Promise<AdminConfig> {
  try {
    const text = await fs.readFile(configPath, "utf8");
    return normalizeAdminConfig(JSON.parse(text) as Partial<AdminConfig>);
  } catch {
    return defaultAdminConfig();
  }
}

export async function writeAdminConfig(config: AdminConfig, actor = "Admin") {
  const nextConfig = normalizeAdminConfig(config);
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(configPath, JSON.stringify(nextConfig, null, 2), "utf8");
  await appendAdminEvent({
    type: "config.update",
    actor,
    status: "ok",
    message: "Updated admin configuration"
  });
  return nextConfig;
}

export async function readAdminEvents() {
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
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(eventsPath, JSON.stringify({ version: 1, events: [event, ...file.events].slice(0, 200) }, null, 2), "utf8");
  return event;
}

export async function backupCurrentSnapshot() {
  const snapshot = await readOkrSnapshot();
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(backupPath, JSON.stringify(snapshot, null, 2), "utf8");
}

export async function rollbackSnapshot(actor = "Admin") {
  try {
    const text = await fs.readFile(backupPath, "utf8");
    const snapshot = JSON.parse(text) as OkrSnapshot;
    await writeOkrSnapshot({
      ...snapshot,
      meta: {
        ...snapshot.meta,
        lastSyncedAt: new Date().toISOString(),
        message: `Rolled back by ${actor}`
      }
    });
    await appendAdminEvent({
      type: "rollback",
      actor,
      status: "ok",
      message: "Rolled back to previous snapshot"
    });
    return snapshot;
  } catch (error) {
    await appendAdminEvent({
      type: "rollback",
      actor,
      status: "error",
      message: error instanceof Error ? error.message : "Rollback failed"
    });
    throw error;
  }
}

function normalizeAdminConfig(input: Partial<AdminConfig>): AdminConfig {
  const fallback = defaultAdminConfig();
  const periods = Array.isArray(input.periods) && input.periods.length > 0 ? input.periods : fallback.periods;
  const teams = Array.isArray(input.teams) && input.teams.length > 0 ? input.teams : fallback.teams;
  return {
    version: 1,
    defaultPeriodId: periods.some((period) => period.id === input.defaultPeriodId) ? input.defaultPeriodId! : fallback.defaultPeriodId,
    periods,
    defaultTeam: teams.some((team) => team.name === input.defaultTeam) ? input.defaultTeam! : fallback.defaultTeam,
    teams,
    permissions: normalizePermissions(input.permissions, fallback.permissions),
    users: normalizeUsers(input.users, fallback.users),
    settings: {
      defaultLanguage: input.settings?.defaultLanguage === "en" ? "en" : "zh",
      showEditLinks: input.settings?.showEditLinks ?? fallback.settings.showEditLinks,
      allowProgressNotes: input.settings?.allowProgressNotes ?? fallback.settings.allowProgressNotes,
      backupExportEnabled: input.settings?.backupExportEnabled ?? fallback.settings.backupExportEnabled
    }
  };
}

function defaultAdminConfig(): AdminConfig {
  return {
    version: 1,
    defaultPeriodId: "2026-q3",
    periods: [
      { id: "2026-q3", label: "2026 年 7 月 - 9 月", labelEn: "Jul - Sep 2026", shortLabel: "2026 Q3", editable: true, locked: false },
      { id: "2026-q2", label: "2026 年 4 月 - 6 月", labelEn: "Apr - Jun 2026", shortLabel: "2026 Q2", editable: false, locked: true }
    ],
    defaultTeam: "Software",
    teams: [
      { name: "Software", owner: "Software Lead", parentTeam: "", color: "bg-blue-500", enabled: true },
      { name: "Application Team", owner: "Application Lead", parentTeam: "Software", color: "bg-blue-500", enabled: true },
      { name: "Integration Team", owner: "Integration Lead", parentTeam: "Software", color: "bg-blue-500", enabled: true },
      { name: "QA Team", owner: "QA Lead", parentTeam: "Software", color: "bg-blue-500", enabled: true },
      { name: "Platform Team", owner: "Platform Lead", parentTeam: "Software", color: "bg-blue-500", enabled: true },
      { name: "Algorithm Team", owner: "Algorithm Lead", parentTeam: "Software", color: "bg-blue-500", enabled: true },
      { name: "TPM Team", owner: "TPM Lead", parentTeam: "Software", color: "bg-blue-500", enabled: true },
      { name: "Hardware", owner: "Hardware Lead", parentTeam: "", color: "bg-emerald-500", enabled: true },
      { name: "Optics Team", owner: "Optics Lead", parentTeam: "Hardware", color: "bg-emerald-500", enabled: true },
      { name: "Advanced Technology", owner: "Advanced Tech Lead", parentTeam: "", color: "bg-violet-500", enabled: true },
      { name: "AP OPS", owner: "AP OPS Lead", parentTeam: "", color: "bg-amber-500", enabled: true }
    ],
    permissions: [
      { team: "Software", accounts: "software-lead@company.com, tpm@company.com", canEdit: true, canPublish: true, notes: "上云后按登录账号匹配" },
      { team: "Hardware", accounts: "hardware-lead@company.com", canEdit: true, canPublish: true, notes: "上云后按登录账号匹配" }
    ],
    users: [
      {
        email: "admin@company.com",
        displayName: "Admin",
        role: "super_admin",
        teams: [],
        ownerAliases: ["Admin"],
        enabled: true
      },
      {
        email: "software-lead@company.com",
        displayName: "Software Lead",
        role: "team_leader",
        teams: ["Software"],
        ownerAliases: ["Software Lead"],
        enabled: true
      },
      {
        email: "member@company.com",
        displayName: "Team Member",
        role: "user",
        teams: ["Software"],
        ownerAliases: ["Team Member"],
        enabled: true
      }
    ],
    settings: {
      defaultLanguage: "zh",
      showEditLinks: true,
      allowProgressNotes: true,
      backupExportEnabled: true
    }
  };
}

function normalizeUsers(input: Partial<AdminUser>[] | undefined, fallback: AdminUser[]) {
  if (!Array.isArray(input)) return fallback;
  return input.map((user) => ({
    email: String(user.email ?? "").trim().toLowerCase(),
    displayName: String(user.displayName ?? "").trim(),
    role: user.role === "super_admin" || user.role === "team_leader" || user.role === "user" ? user.role : "user",
    teams: Array.isArray(user.teams) ? user.teams.map((team) => String(team).trim()).filter(Boolean) : [],
    ownerAliases: Array.isArray(user.ownerAliases) ? user.ownerAliases.map((alias) => String(alias).trim()).filter(Boolean) : [],
    enabled: user.enabled ?? true
  }));
}

function normalizePermissions(input: Partial<AdminPermission>[] | undefined, fallback: AdminPermission[]) {
  if (!Array.isArray(input)) return fallback;
  return input.map((permission) => ({
    team: permission.team ?? "",
    accounts: permission.accounts ?? (permission as { owners?: string }).owners ?? "",
    canEdit: permission.canEdit ?? false,
    canPublish: permission.canPublish ?? false,
    notes: permission.notes ?? ""
  }));
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

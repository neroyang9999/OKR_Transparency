import type { AdminConfig, AdminRole, AdminUser } from "./config";

export type UserImportAction = "add" | "update";

export type UserImportRow = {
  line: number;
  action: UserImportAction;
  user: AdminUser;
  changedFields: string[];
};

export type UserImportIssue = {
  line: number;
  message: string;
};

export type UserImportPreview = {
  rows: UserImportRow[];
  issues: UserImportIssue[];
  addCount: number;
  updateCount: number;
};

const columnAliases: Record<string, keyof ParsedRow> = {
  email: "email",
  "邮箱": "email",
  displayname: "displayName",
  name: "displayName",
  "姓名": "displayName",
  role: "role",
  "角色": "role",
  teams: "teams",
  team: "teams",
  "团队": "teams",
  leaderteams: "leaderTeams",
  "管理团队": "leaderTeams",
  owneraliases: "ownerAliases",
  aliases: "ownerAliases",
  "别名": "ownerAliases",
  enabled: "enabled",
  "启用": "enabled"
};

const defaultColumns: Array<keyof ParsedRow> = ["email", "displayName", "role", "teams", "leaderTeams", "ownerAliases", "enabled"];
const roleAliases: Record<string, AdminRole> = {
  super_admin: "super_admin",
  superadmin: "super_admin",
  admin: "super_admin",
  "系统管理员": "super_admin",
  team_leader: "team_leader",
  teamleader: "team_leader",
  leader: "team_leader",
  "团队负责人": "team_leader",
  user: "user",
  member: "user",
  "成员": "user"
};

type ParsedRow = {
  email: string;
  displayName?: string;
  role?: AdminRole;
  teams?: string[];
  leaderTeams?: string[];
  ownerAliases?: string[];
  enabled?: boolean;
};

/**
 * Turns a pasted spreadsheet range into a reviewable set of member changes.
 * Only the columns actually present in a row are applied, so a two-column
 * "email, team" paste cannot silently blank out roles or aliases that were set
 * in the console.
 */
export function parseUserImport(text: string, config: AdminConfig): UserImportPreview {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0) return { rows: [], issues: [], addCount: 0, updateCount: 0 };

  const delimiter = lines[0].includes("\t") ? "\t" : ",";
  const headerCells = splitDelimited(lines[0], delimiter);
  const header = readHeader(headerCells);
  const columns = header ?? defaultColumns;
  const bodyLines = header ? lines.slice(1) : lines;
  const bodyOffset = header ? 2 : 1;

  const teamNames = new Set(config.teams.map((team) => team.name));
  const usersByEmail = new Map(config.users.map((user) => [normalizeEmail(user.email), user]));
  const rows: UserImportRow[] = [];
  const issues: UserImportIssue[] = [];
  const seenEmails = new Set<string>();

  bodyLines.forEach((line, index) => {
    const lineNumber = index + bodyOffset;
    const cells = splitDelimited(line, delimiter);
    const parsed = readRow(cells, columns, lineNumber, teamNames, issues);
    if (!parsed) return;

    if (seenEmails.has(parsed.email)) {
      issues.push({ line: lineNumber, message: `${parsed.email} appears more than once in this paste` });
      return;
    }
    seenEmails.add(parsed.email);

    const existing = usersByEmail.get(parsed.email);
    const user = mergeUser(existing, parsed);
    const changedFields = existing ? changedUserFields(existing, user) : [];
    if (existing && changedFields.length === 0) return;

    rows.push({ line: lineNumber, action: existing ? "update" : "add", user, changedFields });
  });

  return {
    rows,
    issues,
    addCount: rows.filter((row) => row.action === "add").length,
    updateCount: rows.filter((row) => row.action === "update").length
  };
}

export function applyUserImport(config: AdminConfig, rows: UserImportRow[]): AdminConfig {
  const importedByEmail = new Map(rows.map((row) => [normalizeEmail(row.user.email), row.user]));
  const updated = config.users.map((user) => importedByEmail.get(normalizeEmail(user.email)) ?? user);
  const existingEmails = new Set(config.users.map((user) => normalizeEmail(user.email)));
  const added = rows
    .filter((row) => !existingEmails.has(normalizeEmail(row.user.email)))
    .map((row) => row.user);

  return { ...config, users: [...updated, ...added] };
}

/** Unrecognised headers map to null so their cells are ignored rather than misread as another column. */
function readHeader(cells: string[]): Array<keyof ParsedRow | null> | null {
  const mapped = cells.map((cell) => columnAliases[cell.trim().toLowerCase()] ?? null);
  return mapped.includes("email") ? mapped : null;
}

function readRow(
  cells: string[],
  columns: Array<keyof ParsedRow | null>,
  line: number,
  teamNames: Set<string>,
  issues: UserImportIssue[]
): ParsedRow | null {
  const values = new Map<keyof ParsedRow, string>();
  columns.forEach((column, index) => {
    if (!column) return;
    const value = cells[index]?.trim() ?? "";
    if (value) values.set(column, value);
  });

  const email = normalizeEmail(values.get("email") ?? "");
  if (!email) {
    issues.push({ line, message: "Missing email address" });
    return null;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    issues.push({ line, message: `${email} is not a valid email address` });
    return null;
  }

  const row: ParsedRow = { email };

  const displayName = values.get("displayName");
  if (displayName) row.displayName = displayName;

  const rawRole = values.get("role");
  if (rawRole) {
    const role = roleAliases[rawRole.toLowerCase()];
    if (!role) {
      issues.push({ line, message: `${email}: unknown role "${rawRole}"` });
      return null;
    }
    row.role = role;
  }

  const teams = readTeams(values.get("teams"), email, line, teamNames, issues);
  if (teams === null) return null;
  if (teams) row.teams = teams;

  const leaderTeams = readTeams(values.get("leaderTeams"), email, line, teamNames, issues);
  if (leaderTeams === null) return null;
  if (leaderTeams) row.leaderTeams = leaderTeams;

  const aliases = values.get("ownerAliases");
  if (aliases) row.ownerAliases = splitList(aliases);

  const enabled = values.get("enabled");
  if (enabled) row.enabled = !["false", "0", "no", "off", "停用", "禁用"].includes(enabled.toLowerCase());

  return row;
}

function readTeams(
  raw: string | undefined,
  email: string,
  line: number,
  teamNames: Set<string>,
  issues: UserImportIssue[]
): string[] | null | undefined {
  if (!raw) return undefined;

  const teams = splitList(raw);
  const unknown = teams.filter((team) => !teamNames.has(team));
  if (unknown.length > 0) {
    issues.push({ line, message: `${email}: team ${unknown.join("、")} does not exist` });
    return null;
  }
  return teams;
}

function mergeUser(existing: AdminUser | undefined, row: ParsedRow): AdminUser {
  if (!existing) {
    return {
      email: row.email,
      displayName: row.displayName || row.email.split("@")[0],
      role: row.role ?? "user",
      teams: row.teams ?? [],
      ...(row.leaderTeams ? { leaderTeams: row.leaderTeams } : {}),
      ownerAliases: row.ownerAliases ?? [],
      enabled: row.enabled ?? true
    };
  }

  return {
    ...existing,
    email: row.email,
    displayName: row.displayName ?? existing.displayName,
    role: row.role ?? existing.role,
    teams: row.teams ?? existing.teams,
    ...(row.leaderTeams ? { leaderTeams: row.leaderTeams } : {}),
    ownerAliases: row.ownerAliases ?? existing.ownerAliases,
    enabled: row.enabled ?? existing.enabled
  };
}

function changedUserFields(existing: AdminUser, next: AdminUser) {
  const fields: Array<keyof AdminUser> = ["displayName", "role", "teams", "leaderTeams", "ownerAliases", "enabled"];
  return fields
    .filter((field) => JSON.stringify(existing[field] ?? null) !== JSON.stringify(next[field] ?? null))
    .map(String);
}

function splitList(value: string) {
  return value
    .split(/[|;、]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

/** Splits one delimited line, honouring double-quoted cells that contain the delimiter. */
function splitDelimited(line: string, delimiter: string) {
  const cells: string[] = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];

    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }

    if (character === delimiter && !quoted) {
      cells.push(current);
      current = "";
      continue;
    }

    current += character;
  }

  cells.push(current);
  return cells.map((cell) => cell.trim());
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

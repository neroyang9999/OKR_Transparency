import type { NextRequest } from "next/server";
import { isAuthorized } from "../admin-auth";
import type { AdminConfig, AdminRole, AdminUser } from "./config";
import type { EditableObjective, OkrDraft } from "../okr/edit-types";

export type SessionUser = {
  email: string;
  name: string;
  image?: string;
};

export type UserAccess = {
  email: string;
  displayName: string;
  role: AdminRole;
  teams: string[];
  ownerAliases: string[];
  source: "google" | "iap" | "admin-token";
};

export type TeamEditPolicy = {
  canEdit: boolean;
  canPublish: boolean;
  ownerOptions: string[];
  editableOwnerAliases: string[];
  role?: AdminRole;
};

export async function resolveRequestAccess(request: NextRequest, config: AdminConfig): Promise<UserAccess | null> {
  if (isAuthorized(request)) {
    return {
      email: "admin-token",
      displayName: "Admin Token",
      role: "super_admin",
      teams: [],
      ownerAliases: ["Admin Token"],
      source: "admin-token"
    };
  }

  const iapUser = getIapSessionUser(request.headers);
  const iapAccess = getAccessForSessionUser(config, iapUser, "iap");
  if (iapAccess) return iapAccess;

  const session = await getAuthSession();
  return getAccessForSessionUser(config, {
    email: session?.user?.email ?? "",
    name: session?.user?.name ?? "",
    image: session?.user?.image ?? undefined
  });
}

export async function getCurrentSessionUser(): Promise<SessionUser | null> {
  const iapUser = await getCurrentIapSessionUser();
  if (iapUser) return iapUser;

  const session = await getAuthSession();
  const email = normalizeToken(session?.user?.email ?? "");
  if (!email) return null;
  return {
    email,
    name: session?.user?.name ?? email,
    image: session?.user?.image ?? undefined
  };
}

export function getAccessForSessionUser(config: AdminConfig, user: SessionUser | null, source: "google" | "iap" = "google"): UserAccess | null {
  const email = normalizeToken(user?.email ?? "");
  if (!email) return null;

  const configured = config.users.find((item) => normalizeToken(item.email) === email && item.enabled);
  if (!configured) return null;

  return accessFromAdminUser(configured, user?.name ?? configured.displayName, source);
}

export function accessFromAdminUser(user: AdminUser, sessionName = "", source: "google" | "iap" = "google"): UserAccess {
  const email = normalizeToken(user.email);
  const aliases = uniqueTokens([
    ...user.ownerAliases,
    user.displayName,
    sessionName,
    email
  ]);

  return {
    email,
    displayName: user.displayName || sessionName || email,
    role: user.role,
    teams: user.teams,
    ownerAliases: aliases,
    source
  };
}

export function getTeamEditPolicy(config: AdminConfig, team: string, access: UserAccess | null): TeamEditPolicy {
  if (!access) {
    return { canEdit: false, canPublish: false, ownerOptions: [], editableOwnerAliases: [] };
  }

  const ownerOptions = getOwnerOptions(config, team, access);
  if (access.role === "super_admin") {
    return {
      canEdit: true,
      canPublish: true,
      ownerOptions,
      editableOwnerAliases: ownerOptions,
      role: access.role
    };
  }

  if (access.role === "team_leader" && canLeadTeam(config, access.teams, team)) {
    return {
      canEdit: true,
      canPublish: true,
      ownerOptions,
      editableOwnerAliases: ownerOptions,
      role: access.role
    };
  }

  if (access.role === "user") {
    return {
      canEdit: access.teams.includes(team),
      canPublish: false,
      ownerOptions: access.ownerAliases,
      editableOwnerAliases: access.ownerAliases,
      role: access.role
    };
  }

  return { canEdit: false, canPublish: false, ownerOptions: [], editableOwnerAliases: [], role: access.role };
}

export function canManageAdmin(access: UserAccess | null) {
  return access?.role === "super_admin";
}

export function canManageTeam(config: AdminConfig, team: string, access: UserAccess | null) {
  return access?.role === "super_admin" || (access?.role === "team_leader" && canLeadTeam(config, access.teams, team));
}

export function canEditOwner(access: UserAccess | null, owner: string) {
  if (!access) return false;
  if (access.role === "super_admin" || access.role === "team_leader") return true;
  return tokenMatches(access.ownerAliases, owner);
}

export function validateEditablePeriod(config: AdminConfig, periodId: string) {
  const period = config.periods.find((item) => item.id === periodId);
  if (!period) return { ok: false, error: "Period is not configured" };
  if (!period.editable || period.locked) return { ok: false, error: "Period is locked" };
  return { ok: true, error: "" };
}

export function authorizeDraftChange(config: AdminConfig, access: UserAccess | null, previous: OkrDraft, next: OkrDraft) {
  const period = validateEditablePeriod(config, next.periodId);
  if (!period.ok) return period;

  const policy = getTeamEditPolicy(config, next.team, access);
  if (!policy.canEdit) return { ok: false, error: "No edit permission for this team" };

  if (access?.role === "super_admin" || access?.role === "team_leader") return { ok: true, error: "" };

  return userDraftChangeIsAllowed(previous, next, policy.editableOwnerAliases)
    ? { ok: true, error: "" }
    : { ok: false, error: "Users can only edit OKRs owned by themselves" };
}

export function authorizePublish(config: AdminConfig, access: UserAccess | null, team: string, periodId: string) {
  const period = validateEditablePeriod(config, periodId);
  if (!period.ok) return period;

  const policy = getTeamEditPolicy(config, team, access);
  return policy.canPublish ? { ok: true, error: "" } : { ok: false, error: "No publish permission for this team" };
}

export function getOwnerOptions(config: AdminConfig, team: string, access: UserAccess | null) {
  if (!access) return [];
  if (access.role === "user") return access.ownerAliases;

  const teamOwners = config.teams
    .filter((item) => item.name === team || item.parentTeam === team)
    .map((item) => item.owner);
  const userOwners = config.users
    .filter((user) => user.enabled && (access.role === "super_admin" || user.teams.some((userTeam) => canLeadTeam(config, [team], userTeam))))
    .flatMap((user) => user.ownerAliases.length > 0 ? user.ownerAliases : [user.displayName, user.email]);

  return uniqueTokens([...teamOwners, ...userOwners]);
}

function canLeadTeam(config: AdminConfig, leaderTeams: string[], team: string) {
  if (leaderTeams.includes(team)) return true;
  const parentByTeam = new Map(config.teams.map((item) => [item.name, item.parentTeam]));
  let parent = parentByTeam.get(team);

  while (parent) {
    if (leaderTeams.includes(parent)) return true;
    parent = parentByTeam.get(parent);
  }

  return false;
}

function userDraftChangeIsAllowed(previous: OkrDraft, next: OkrDraft, ownerAliases: string[]) {
  const previousObjectives = new Map(previous.objectives.map((objective) => [objective.id, objective]));
  if (previous.objectives.length !== next.objectives.length) return false;

  return next.objectives.every((objective) => {
    const previousObjective = previousObjectives.get(objective.id);
    if (!previousObjective) return false;
    if (!objectivesEqualExceptKrs(previousObjective, objective)) return false;

    const previousKrs = new Map(previousObjective.keyResults.map((kr) => [kr.id, kr]));
    if (previousObjective.keyResults.length !== objective.keyResults.length) return false;

    return objective.keyResults.every((kr) => {
      const previousKr = previousKrs.get(kr.id);
      if (!previousKr) return false;
      if (tokenMatches(ownerAliases, previousKr.owner)) {
        return tokenMatches(ownerAliases, kr.owner);
      }
      return JSON.stringify(previousKr) === JSON.stringify(kr);
    });
  });
}

function objectivesEqualExceptKrs(left: EditableObjective, right: EditableObjective) {
  const leftRest = objectiveWithoutKrs(left);
  const rightRest = objectiveWithoutKrs(right);
  return JSON.stringify(leftRest) === JSON.stringify(rightRest);
}

function objectiveWithoutKrs(objective: EditableObjective) {
  return {
    id: objective.id,
    periodId: objective.periodId,
    team: objective.team,
    title: objective.title,
    owner: objective.owner,
    type: objective.type,
    confidence: objective.confidence,
    weight: objective.weight,
    progress: objective.progress,
    alignedToId: objective.alignedToId,
    status: objective.status
  };
}

function tokenMatches(tokens: string[], value: string) {
  const normalizedValue = normalizeToken(value);
  return Boolean(normalizedValue) && tokens.some((token) => normalizeToken(token) === normalizedValue);
}

function uniqueTokens(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function normalizeToken(value: string) {
  return value.trim().toLowerCase();
}

async function getAuthSession() {
  try {
    const { auth } = await import("../../../auth");
    return await auth();
  } catch {
    return null;
  }
}

function getIapSessionUser(headers: Headers): SessionUser | null {
  const email = extractIapEmail(headers);
  if (!email) return null;
  return {
    email,
    name: email
  };
}

async function getCurrentIapSessionUser(): Promise<SessionUser | null> {
  try {
    const { headers } = await import("next/headers");
    return getIapSessionUser(await headers());
  } catch {
    return null;
  }
}

function extractIapEmail(headers: Headers) {
  const rawEmail = headers.get("x-goog-authenticated-user-email") ?? "";
  return normalizeToken(rawEmail.replace(/^accounts\.google\.com:/i, ""));
}

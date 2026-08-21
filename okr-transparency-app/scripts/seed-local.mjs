#!/usr/bin/env node
/**
 * Seed a local OKR scenario so a behaviour can be checked in the running app.
 *
 * Two things make hand-rolling a fixture go wrong, both discovered the slow way:
 *
 * 1. `readDraft` reads `data/okr-period-snapshots.json` BEFORE `data/okr-snapshot.json`, so a
 *    fixture written only to the snapshot leaves the editor showing zero Objectives.
 * 2. A member-scoped record needs BOTH `owner_email` and an `owner` that matches the member's
 *    configured display name. `filterDraftByOwner` checks the email for scope and the name
 *    against the owner aliases, so getting either wrong silently yields an empty editor.
 *
 * Identities therefore come from data/okr-admin-config.json rather than from arguments, so the
 * caller only has to name a team and a member email.
 *
 * `okr-period-snapshots.json` and `okr-drafts.json` are listed in .gitignore yet are still
 * tracked (they were committed before the rules were added, and .gitignore does not apply to
 * tracked files). Seeding therefore dirties the working tree, so this script backs them up first
 * and `--restore` puts them back.
 *
 * Usage:
 *   node scripts/seed-local.mjs                       # default scenario, prints the URLs to open
 *   node scripts/seed-local.mjs --as liang.zhang@unitxlabs.com
 *   node scripts/seed-local.mjs --team "AP OPS" --as zhicheng@unitxlabs.com
 *   node scripts/seed-local.mjs --no-member-aligned    # member Objectives all start unaligned
 *   node scripts/seed-local.mjs --restore              # undo everything this wrote
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = join(appRoot, "data");
const backupDir = join(dataDir, "seed-local-backups");

/** Tracked files the seed overwrites. Backed up so `--restore` works without git. */
const trackedTargets = ["okr-period-snapshots.json", "okr-drafts.json"];
/** Untracked files the seed creates outright. */
const untrackedTargets = ["okr-snapshot.json"];

const args = parseArgs(process.argv.slice(2));

if (args.restore) {
  restore();
  process.exit(0);
}

const config = readConfig();
const team = args.team ?? "QA Team";
const memberEmail = (args.as ?? "yating@unitxlabs.com").trim().toLowerCase();
const periodId = args.period ?? config.defaultPeriodId ?? "2026-q3";
const memberAligned = args.memberAligned !== false;

const teamConfig = requireTeam(team);
const parentTeam = teamConfig.parentTeam || "";
const teamLeader = resolveTeamOwner(teamConfig);
const parentLeader = parentTeam ? resolveTeamOwner(requireTeam(parentTeam)) : null;
const member = requireMember(memberEmail, team);

/** What a team-level publish stamps onto every record: the resolved leader, not the config label. */
const teamOwner = teamLeader?.displayName ?? teamConfig.owner;
const parentOwner = parentTeam ? (parentLeader?.displayName ?? requireTeam(parentTeam).owner) : "";
const memberName = member.displayName;

seed();

function seed() {
  assertDataDirClean();
  backup();

  const records = buildRecords();
  writeJson(join(dataDir, "okr-snapshot.json"), {
    version: 1,
    meta: {
      status: "ok",
      source: "snapshot",
      lastSyncedAt: `${periodId}-seed`,
      message: "seed-local fixture",
      rowCount: records.length
    },
    records
  });

  // readDraft prefers this file, so the same records have to land here too.
  writeJson(join(dataDir, "okr-period-snapshots.json"), {
    version: 1,
    periods: [{ periodId, updatedAt: "2026-01-01T00:00:00.000Z", records }]
  });

  // A leftover draft would win over both snapshots.
  writeJson(join(dataDir, "okr-drafts.json"), { version: 1, drafts: [] });

  writeFileSync(join(appRoot, ".env.local"), [
    "OKR_STORAGE=file",
    "OKR_DEV_BYPASS_AUTH=true",
    `OKR_DEV_USER_EMAIL=${memberEmail}`,
    "AUTH_SECRET=local-seed-only",
    ""
  ].join("\n"), "utf8");

  const query = new URLSearchParams({ team, period: periodId, lang: "zh" });
  const memberQuery = new URLSearchParams({ team, member: memberEmail, period: periodId, mode: "edit", lang: "zh" });

  console.log(`seeded ${records.length} records for ${team} / ${periodId}, signed in as ${memberEmail}`);
  console.log(`  resolved: team owner "${teamOwner}", member "${memberName}"${parentTeam ? `, parent ${parentTeam} / "${parentOwner}"` : ", no parent team"}`);
  console.log(`  member Objectives: ${memberAligned ? "one aligned, one unaligned" : "both unaligned"}`);
  console.log("");
  console.log("start the app, then open:");
  console.log(`  team page    /?${query}`);
  console.log(`  member edit  /?${memberQuery}`);
  console.log("");
  console.log("when done:  node scripts/seed-local.mjs --restore");
}

function buildRecords() {
  const teamObjectiveId = `${slug(team)}-O1`;
  const records = [
    record({ okr_id: `${slug(parentTeam)}-O1`, team: parentTeam, owner: parentOwner, objective: `${parentTeam} 的团队目标` }),
    record({
      okr_id: teamObjectiveId,
      team,
      owner: teamOwner,
      objective: `${team} 的团队目标`,
      aligned_to_id: `${slug(parentTeam)}-O1`
    }),
    record({
      okr_id: `${teamObjectiveId}-KR1`,
      team,
      owner: teamOwner,
      objective: `${team} 的团队目标`,
      kr: "团队级 KR 1",
      parent_id: teamObjectiveId
    }),
    // The leader's own OKR: a member alignment picker must not offer this, even though the
    // leader's display name is a legitimate team owner alias.
    record({
      okr_id: `${slug(team)}-LEADER-M1`,
      team,
      owner: teamOwner,
      objective: `${teamOwner} 的个人目标`,
      objective_scope: "member",
      owner_email: teamLeader?.email ?? "leader@unitxlabs.com"
    }),
    record({
      okr_id: `${slug(team)}-${slug(memberName)}-M1`,
      team,
      owner: memberName,
      objective: `${memberName} 的成员目标（起始已对齐）`,
      objective_scope: "member",
      owner_email: memberEmail,
      aligned_to_id: memberAligned ? teamObjectiveId : ""
    }),
    record({
      okr_id: `${slug(team)}-${slug(memberName)}-M2`,
      team,
      owner: memberName,
      objective: `${memberName} 的成员目标（起始未对齐）`,
      objective_scope: "member",
      owner_email: memberEmail
    })
  ];
  return records;
}

function record(partial) {
  return {
    okr_id: "",
    parent_id: "",
    level: "Team",
    team,
    objective: "",
    kr: "",
    type: "Committed",
    owner: "",
    baseline: "",
    target: "",
    actual: "",
    score: 0.4,
    confidence: "Green",
    dependencies: "",
    risks: "",
    decisions_needed: "",
    source_doc_url: "",
    last_update: "2026-01-01",
    aligned_to_id: "",
    objective_scope: "team",
    ...partial
  };
}

/** Refuse to clobber real local state; the caller may have data they still need. */
function assertDataDirClean() {
  const dirty = trackedTargets.filter((name) => isDirty(join("data", name)));
  if (dirty.length === 0) return;
  console.error(`data/${dirty.join(", data/")} has uncommitted changes.`);
  console.error("Commit, stash, or `git checkout` them first — seeding would overwrite them.");
  process.exit(1);
}

function isDirty(relativeToApp) {
  try {
    const output = execFileSync("git", ["status", "--porcelain", "--", relativeToApp], {
      cwd: appRoot,
      encoding: "utf8"
    });
    return output.trim().length > 0;
  } catch {
    return false;
  }
}

function backup() {
  mkdirSync(backupDir, { recursive: true });
  for (const name of trackedTargets) {
    const source = join(dataDir, name);
    if (existsSync(source)) writeFileSync(join(backupDir, name), readFileSync(source));
  }
}

function restore() {
  let restored = 0;
  for (const name of trackedTargets) {
    const saved = join(backupDir, name);
    if (!existsSync(saved)) continue;
    writeFileSync(join(dataDir, name), readFileSync(saved));
    restored += 1;
  }
  for (const name of untrackedTargets) rmSync(join(dataDir, name), { force: true });
  rmSync(join(appRoot, ".env.local"), { force: true });
  rmSync(backupDir, { recursive: true, force: true });
  console.log(`restored ${restored} tracked file(s), removed the seeded snapshot and .env.local`);
  if (restored < trackedTargets.length) {
    console.log("no backup found for every file — run `git checkout -- data/` if anything looks off");
  }
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function slug(value) {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    const key = camel(token.replace(/^--/, ""));
    if (key === "restore") { parsed.restore = true; continue; }
    if (key === "noMemberAligned") { parsed.memberAligned = false; continue; }
    parsed[key] = argv[index + 1];
    index += 1;
  }
  return parsed;
}

function camel(value) {
  return value.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}

function readConfig() {
  const path = join(dataDir, "okr-admin-config.json");
  if (!existsSync(path)) {
    console.error(`missing ${path} — the seed needs it to resolve team owners and member names`);
    process.exit(1);
  }
  return JSON.parse(readFileSync(path, "utf8"));
}

function requireTeam(name) {
  const found = (config.teams ?? []).find((item) => item.enabled && item.name === name);
  if (found) return found;
  const available = (config.teams ?? []).filter((item) => item.enabled).map((item) => item.name).join(", ");
  console.error(`team "${name}" is not configured. Available: ${available}`);
  process.exit(1);
}

/** Mirrors resolveTeamOwner: the configured `owner` is a lookup key, matched against identities. */
function resolveTeamOwner(teamConfig) {
  const users = (config.users ?? []).filter((user) => user.enabled);
  const label = String(teamConfig.owner ?? "").trim().toLowerCase();
  const byLabel = users.find((user) => [user.displayName, user.email, ...(user.ownerAliases ?? [])]
    .some((value) => String(value ?? "").trim().toLowerCase() === label));
  if (byLabel) return byLabel;
  return users.find((user) => user.role === "team_leader" && (user.teams ?? []).includes(teamConfig.name))
    ?? users.find((user) => (user.leaderTeams ?? []).includes(teamConfig.name))
    ?? null;
}

function requireMember(email, teamName) {
  const found = (config.users ?? []).find((user) =>
    user.enabled &&
    String(user.email ?? "").trim().toLowerCase() === email &&
    (user.teams ?? []).includes(teamName));
  if (found) return found;
  const available = (config.users ?? [])
    .filter((user) => user.enabled && (user.teams ?? []).includes(teamName))
    .map((user) => user.email).join(", ");
  console.error(`"${email}" is not an enabled member of ${teamName}. Available: ${available}`);
  process.exit(1);
}

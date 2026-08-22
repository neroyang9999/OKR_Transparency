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
 *   node scripts/seed-local.mjs --map                  # every configured team, for the map view
 *   node scripts/seed-local.mjs --restore              # undo everything this wrote
 *
 * `--map` seeds the whole configured org rather than one chain, because the alignment map only
 * shows what it was built for once all three columns are populated: several Objectives landing on
 * one parent (which is what makes the channels share), cards of noticeably different heights (which
 * is what puts a small rise between two that look level), and rows far enough apart that focusing
 * one has to lift the others a long way.
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

  const records = args.map ? buildMapRecords() : buildRecords();
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

  if (args.map) {
    const teamObjectives = records.filter((item) => !item.parent_id && item.objective_scope === "team");
    const memberObjectives = records.filter((item) => item.objective_scope === "member");
    console.log(`seeded ${records.length} records across the whole configured org / ${periodId}, signed in as ${memberEmail}`);
    console.log(`  ${teamObjectives.length} team Objectives, ${memberObjectives.length} member Objectives`);
    const secondLevel = teamObjectives.filter((item) =>
      (config.teams ?? []).some((entry) => entry.name === item.team && entry.parentTeam));
    console.log(`  ${teamObjectives.length - secondLevel.length} root, ${secondLevel.length} second-level`);
    console.log(`  unaligned on purpose: ${secondLevel.filter((item) => !item.aligned_to_id).length} second-level, ` +
      `${memberObjectives.filter((item) => !item.aligned_to_id).length} member`);
    console.log("");
    console.log("start the app, then open:");
    console.log(`  alignment map  /map?period=${periodId}&lang=zh`);
    console.log("");
  } else {
    console.log(`seeded ${records.length} records for ${team} / ${periodId}, signed in as ${memberEmail}`);
    console.log(`  resolved: team owner "${teamOwner}", member "${memberName}"${parentTeam ? `, parent ${parentTeam} / "${parentOwner}"` : ", no parent team"}`);
    console.log(`  member Objectives: ${memberAligned ? "one aligned, one unaligned" : "both unaligned"}`);
    console.log("");
    console.log("start the app, then open:");
    console.log(`  team page    /?${query}`);
    console.log(`  member edit  /?${memberQuery}`);
    console.log("");
  }
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

/**
 * Every enabled team, shaped for the alignment map rather than for one editor.
 *
 * The shapes matter more than the volume. Objective titles come in three lengths on purpose: the
 * cards they produce differ in height, which is the only way to get a pair whose centres sit a few
 * pixels apart — the case where a route has to read as straight rather than as a step. Two
 * Objectives per root team make the second level land on more than one parent, so the channels in
 * the first gap have to share. And every fourth member starts unaligned, so the amber state is on
 * screen without having to go and break something.
 */
function buildMapRecords() {
  const enabledTeams = (config.teams ?? []).filter((item) => item.enabled);
  const roots = enabledTeams.filter((item) => !item.parentTeam);
  const children = enabledTeams.filter((item) => item.parentTeam);
  const records = [];

  const rootObjectiveIds = new Map();
  roots.forEach((rootTeam, rootIndex) => {
    const ids = [];
    for (let n = 1; n <= 2; n += 1) {
      const okrId = `${slug(rootTeam.name)}-O${n}`;
      ids.push(okrId);
      records.push(record({
        okr_id: okrId,
        team: rootTeam.name,
        owner: ownerNameOf(rootTeam),
        objective: objectiveTitle(rootTeam.name, rootIndex + n),
        score: seededProgress(rootIndex + n),
        confidence: seededConfidence(rootIndex + n)
      }));
      records.push(krFor(okrId, rootTeam.name, ownerNameOf(rootTeam), rootIndex + n));
    }
    rootObjectiveIds.set(rootTeam.name, ids);
  });

  children.forEach((childTeam, childIndex) => {
    const parents = rootObjectiveIds.get(childTeam.parentTeam) ?? [];
    /** A band needs three Objectives before it folds itself on first paint, so one team gets three
     *  and the folded-band anchor is on screen without a click. */
    const count = childIndex === 0 ? 3 : childIndex % 3 === 1 ? 2 : 1;
    for (let n = 1; n <= count; n += 1) {
      const okrId = `${slug(childTeam.name)}-O${n}`;
      /** One Objective left off the tree: the map's whole point is showing what has not aligned. */
      const orphan = childIndex === 2 && n === 1;
      records.push(record({
        okr_id: okrId,
        team: childTeam.name,
        owner: ownerNameOf(childTeam),
        objective: objectiveTitle(childTeam.name, childIndex + n),
        aligned_to_id: orphan || parents.length === 0 ? "" : parents[(childIndex + n) % parents.length],
        score: seededProgress(childIndex + n + 1),
        confidence: seededConfidence(childIndex + n + 1)
      }));
      records.push(krFor(okrId, childTeam.name, ownerNameOf(childTeam), childIndex + n));
    }
  });

  enabledTeams.forEach((teamConfig, teamIndex) => {
    const members = (config.users ?? []).filter((user) =>
      user.enabled && (user.teams ?? []).includes(teamConfig.name));
    const target = `${slug(teamConfig.name)}-O1`;
    const hasTarget = records.some((item) => item.okr_id === target);

    members.forEach((member, memberIndex) => {
      const memberName = member.displayName || member.email.split("@")[0];
      records.push(record({
        okr_id: `${slug(teamConfig.name)}-${slug(member.email.split("@")[0])}-M1`,
        team: teamConfig.name,
        owner: memberName,
        objective: memberTitle(memberName, teamIndex + memberIndex),
        objective_scope: "member",
        owner_email: member.email,
        aligned_to_id: !hasTarget || memberIndex % 4 === 3 ? "" : target,
        score: seededProgress(teamIndex + memberIndex),
        confidence: seededConfidence(teamIndex + memberIndex)
      }));
    });
  });

  return records;
}

function krFor(objectiveId, teamName, owner, seed) {
  return record({
    okr_id: `${objectiveId}-KR1`,
    team: teamName,
    owner,
    objective: objectiveTitle(teamName, seed),
    kr: "把上面这件事拆成可度量的一条",
    parent_id: objectiveId,
    score: seededProgress(seed + 2),
    confidence: seededConfidence(seed + 2)
  });
}

/** Three lengths, cycled: the cards they produce differ in height, which is what the map's routing
 *  has to cope with. A single length would put every card centre on the same row. */
function objectiveTitle(teamName, seed) {
  const shapes = [
    `${teamName} 目标`,
    `${teamName}：把交付节奏稳定在两周一个可用版本`,
    `${teamName}：把端到端交付周期压到两周，并让每次发布都带上可回滚的验证脚本和一份回归基线`
  ];
  return shapes[Math.abs(seed) % shapes.length];
}

function memberTitle(memberName, seed) {
  const shapes = [
    `${memberName} 的个人目标`,
    `${memberName}：承接团队目标，负责其中的验证与回归部分`,
    `${memberName}：把手上这条链路的失败率降到 1% 以下，并补齐缺失的回归用例与告警`
  ];
  return shapes[Math.abs(seed) % shapes.length];
}

/** Spread across the range so the progress bars and the status filters both have something to do. */
function seededProgress(seed) {
  return [0.15, 0.4, 0.62, 0.85, 0.28, 0.7][Math.abs(seed) % 6];
}

function seededConfidence(seed) {
  return ["Green", "Yellow", "Green", "Red", "Green", "Yellow"][Math.abs(seed) % 6];
}

function ownerNameOf(teamConfig) {
  return resolveTeamOwner(teamConfig)?.displayName ?? teamConfig.owner;
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
    if (key === "map") { parsed.map = true; continue; }
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

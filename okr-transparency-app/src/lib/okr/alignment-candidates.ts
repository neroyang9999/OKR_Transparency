import type { AdminConfig } from "@/lib/admin/config";
import type { AlignmentOption } from "./alignment-options";
import { isMemberScopedRecord, ownerScopeForTeam } from "./owner-scope";
import type { OkrRecord } from "./types";

/**
 * Who is picking an alignment target. A team aligns up to its parent team; a member aligns up to
 * the team-level OKR of their own team.
 */
export type AlignmentScope = "team" | "member";

/**
 * The alignment targets offered in the editor.
 *
 * The scope decides the target set, and the caller must not narrow it further — passing a
 * hand-built owner allowlist is what previously hid every team's OKR from its own members
 * (the allowlist held the configured owner *label* while publishing stamps the resolved
 * owner *display name* onto each record).
 */
export function getAlignmentOptions(
  records: OkrRecord[],
  team: string,
  config: AdminConfig,
  scope: AlignmentScope = "team"
): AlignmentOption[] {
  const recordById = new Map(records.map((record) => [record.okr_id, record]));
  const candidates = scope === "member"
    ? teamLevelRecordsOf(records, team, config)
    : parentTeamRecordsOf(records, team, config);

  return candidates
    .sort((left, right) => Number(Boolean(left.kr)) - Number(Boolean(right.kr)))
    .map((record) => {
      const parent = record.parent_id ? recordById.get(record.parent_id) : null;
      return {
        id: record.okr_id,
        kind: record.kr ? "KR" : "O",
        team: record.team,
        owner: record.owner,
        title: record.kr || record.objective,
        parentId: record.kr ? record.parent_id : undefined,
        parentTitle: record.kr ? parent?.objective ?? record.objective : undefined,
        progress: record.score === null ? null : Math.round(record.score * 100),
        confidence: record.confidence
      } satisfies AlignmentOption;
    });
}

/**
 * A member aligns up to their own team's team-level OKR, so both halves matter: the owner must
 * belong to the team, and the record must not be somebody's personal OKR. Matching on the owner
 * alone would offer the leader's own member-scoped OKR as an alignment target, since a leader's
 * display name is a legitimate team owner alias.
 */
function teamLevelRecordsOf(records: OkrRecord[], team: string, config: AdminConfig) {
  const aliases = teamOwnerAliases(team, config);
  return records.filter((record) =>
    record.team === team &&
    !isMemberScopedRecord(record) &&
    aliases.has(normalizeToken(record.owner))
  );
}

function parentTeamRecordsOf(records: OkrRecord[], team: string, config: AdminConfig) {
  const parentTeam = config.teams.find((item) => item.name === team && item.enabled)?.parentTeam || null;
  if (!parentTeam) return [];
  return records.filter((record) => record.team === parentTeam);
}

/**
 * Every spelling of "this team owns the record" that publishing can leave behind: the resolved
 * leader's display name, email and aliases, the configured owner label, plus the team name itself
 * for records published before owner scopes existed.
 */
function teamOwnerAliases(team: string, config: AdminConfig) {
  const scope = ownerScopeForTeam(config, team);
  return new Set(
    [...(scope?.aliases ?? []), scope?.owner ?? "", team]
      .map(normalizeToken)
      .filter(Boolean)
  );
}

function normalizeToken(value: string) {
  return value.trim().toLowerCase();
}

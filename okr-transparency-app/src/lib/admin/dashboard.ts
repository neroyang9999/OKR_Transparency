import { getOkrQualityStats } from "../okr/graph-validation";
import type { OkrRecord } from "../okr/types";
import type { AdminConfig, AdminEvent } from "./config";

export type AdminAttentionItem = {
  id: string;
  level: "critical" | "warning" | "info";
  title: string;
  description: string;
  destination: "periods" | "organization" | "recovery";
};

export type AdminRuntimeSummary = {
  activePeriodId: string;
  enabledTeamCount: number;
  publishedTeamCount: number;
  lastPublishAt: string;
  quality: ReturnType<typeof getOkrQualityStats>;
  attention: AdminAttentionItem[];
};

export function getAdminRuntimeSummary(config: AdminConfig, events: AdminEvent[], records: OkrRecord[]): AdminRuntimeSummary {
  const enabledTeams = config.teams.filter((team) => team.enabled);
  const publishedTeams = new Set(records.map((record) => record.team));
  const quality = getOkrQualityStats(records);
  const attention: AdminAttentionItem[] = [];
  const activePeriod = config.periods.find((period) => period.status === "active");
  const enabledAdmins = config.users.filter((user) => user.enabled && user.role === "super_admin");
  const unpublished = enabledTeams.filter((team) => !publishedTeams.has(team.name));
  const failedEvents = events.filter((event) => event.status === "error");

  if (!activePeriod) {
    attention.push({ id: "no-active-period", level: "critical", title: "没有进行中的周期", description: "编辑和发布都会被阻止。", destination: "periods" });
  }
  if (enabledAdmins.length < 2) {
    attention.push({ id: "single-admin", level: "warning", title: "系统管理员少于 2 人", description: "建议至少保留两名启用的系统管理员，避免单点失效。", destination: "organization" });
  }
  if (unpublished.length > 0) {
    attention.push({ id: "unpublished-teams", level: "warning", title: `${unpublished.length} 个团队尚未发布`, description: unpublished.slice(0, 4).map((team) => team.name).join("、"), destination: "organization" });
  }
  if (quality.missingOwnerCount > 0) {
    attention.push({ id: "missing-owners", level: "critical", title: `${quality.missingOwnerCount} 个 KR 缺少负责人`, description: "发布前需要补齐 KR owner。", destination: "organization" });
  }
  if (quality.staleCount > 0) {
    attention.push({ id: "stale-krs", level: "warning", title: `${quality.staleCount} 个 KR 超过 14 天未更新`, description: "需要提醒对应负责人完成周更新。", destination: "organization" });
  }
  if (failedEvents.length > 0) {
    attention.push({ id: "failed-events", level: "critical", title: `${failedEvents.length} 个失败操作需要检查`, description: failedEvents[0]?.message ?? "查看审计记录了解原因。", destination: "recovery" });
  }

  return {
    activePeriodId: activePeriod?.id ?? config.defaultPeriodId,
    enabledTeamCount: enabledTeams.length,
    publishedTeamCount: enabledTeams.filter((team) => publishedTeams.has(team.name)).length,
    lastPublishAt: events.find((event) => event.type === "publish" && event.status === "ok")?.createdAt ?? "",
    quality,
    attention
  };
}

export type VersionRecordChange = {
  id: string;
  label: string;
  kind: "restore" | "remove" | "change";
  fields: string[];
};

export function diffVersionRecords(current: OkrRecord[], target: OkrRecord[]) {
  const currentById = new Map(current.map((record) => [record.okr_id, record]));
  const targetById = new Map(target.map((record) => [record.okr_id, record]));
  const changes: VersionRecordChange[] = [];

  target.forEach((record) => {
    const existing = currentById.get(record.okr_id);
    if (!existing) {
      changes.push({ id: record.okr_id, label: record.kr || record.objective || record.okr_id, kind: "restore", fields: [] });
      return;
    }
    const fields = comparableFields.filter((field) => existing[field] !== record[field]);
    if (fields.length > 0) changes.push({ id: record.okr_id, label: record.kr || record.objective || record.okr_id, kind: "change", fields });
  });

  current.forEach((record) => {
    if (!targetById.has(record.okr_id)) {
      changes.push({ id: record.okr_id, label: record.kr || record.objective || record.okr_id, kind: "remove", fields: [] });
    }
  });

  return {
    changes,
    restoreCount: changes.filter((change) => change.kind === "restore").length,
    removeCount: changes.filter((change) => change.kind === "remove").length,
    changeCount: changes.filter((change) => change.kind === "change").length
  };
}

const comparableFields: Array<keyof OkrRecord> = [
  "objective",
  "kr",
  "owner",
  "baseline",
  "target",
  "actual",
  "score",
  "confidence",
  "risks",
  "decisions_needed",
  "aligned_to_id"
];

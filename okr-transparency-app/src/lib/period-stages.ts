import type { AdminConfig, AdminPeriod, AdminPeriodStatus, AdminRole } from "./admin/config";
import type { Lang } from "./i18n";
import type { Period } from "./periods";

/**
 * A period moves planned → setting → active → closing → locked. Two of them can
 * be open at once, which is what lets next quarter's OKRs be written while this
 * quarter's progress is still being finished.
 */
export const periodStatuses: AdminPeriodStatus[] = ["planned", "setting", "active", "closing", "locked"];

/** Objectives and KRs can be drafted and published. */
export function allowsOkrEdits(status: AdminPeriodStatus | undefined) {
  return status === "setting" || status === "active";
}

/** Weekly check-ins and progress values can be recorded. */
export function allowsProgressUpdates(status: AdminPeriodStatus | undefined) {
  return status === "active" || status === "closing";
}

export function isOpenPeriod(status: AdminPeriodStatus | undefined) {
  return allowsOkrEdits(status) || allowsProgressUpdates(status);
}

/** A planned period is still being prepared, so only administrators see it. */
export function visiblePeriods<T extends Pick<AdminPeriod, "status">>(periods: T[], role: AdminRole | undefined) {
  return role === "super_admin" ? periods : periods.filter((period) => period.status !== "planned");
}

/** The periods one viewer can switch between, always including the default one. */
export function periodsForViewer(config: Pick<AdminConfig, "periods" | "defaultPeriodId">, role: AdminRole | undefined): Period[] {
  return config.periods
    .filter((period) => period.id === config.defaultPeriodId || visiblePeriods([period], role).length > 0)
    .map(({ id, label, labelEn, shortLabel, status }) => ({ id, label, labelEn, shortLabel, status }));
}

/** A requested period the viewer may see, otherwise the default period. */
export function resolveViewerPeriod(requested: string | null | undefined, config: Pick<AdminConfig, "periods" | "defaultPeriodId">, role: AdminRole | undefined) {
  return periodsForViewer(config, role).some((period) => period.id === requested) ? requested! : config.defaultPeriodId;
}

/**
 * The period people land on: the one in progress, otherwise the newest open
 * one, otherwise the newest period anyone can see.
 */
export function deriveDefaultPeriodId(periods: Pick<AdminPeriod, "id" | "status">[]) {
  const newestFirst = sortNewestFirst(periods);
  return (
    newestFirst.find((period) => period.status === "active") ??
    newestFirst.find((period) => isOpenPeriod(period.status)) ??
    newestFirst.find((period) => period.status !== "planned") ??
    newestFirst[0]
  )?.id ?? "";
}

/** Quarter ids sort by date; anything else keeps the configured order, which lists the newest first. */
export function sortNewestFirst<T extends Pick<AdminPeriod, "id">>(periods: T[]) {
  return periods
    .map((period, index) => ({ period, index, quarter: quarterIndex(period.id) }))
    .sort((left, right) =>
      left.quarter !== null && right.quarter !== null ? right.quarter - left.quarter : left.index - right.index)
    .map(({ period }) => period);
}

/**
 * Moves one period to a new stage. Starting a period sends the one in progress
 * into closing rather than locking it, so its check-ins can still be finished.
 */
export function movePeriod<T extends Pick<AdminPeriod, "id" | "status">>(periods: T[], periodId: string, to: AdminPeriodStatus): T[] {
  return periods.map((period) => {
    if (period.id === periodId) return { ...period, status: to };
    if (to === "active" && period.status === "active") return { ...period, status: "closing" as const };
    return period;
  });
}

export type PeriodMove = { to: AdminPeriodStatus; blockedBy?: string };

/** The stages a period can move to next. A closing period resumes only if nothing else is in progress. */
export function allowedPeriodMoves(period: Pick<AdminPeriod, "id" | "status">, periods: Pick<AdminPeriod, "id" | "status" | "shortLabel">[]): PeriodMove[] {
  const otherActive = periods.find((item) => item.status === "active" && item.id !== period.id);
  switch (period.status) {
    case "planned": return [{ to: "setting" }, { to: "active" }];
    case "setting": return [{ to: "active" }, { to: "planned" }];
    case "active": return [{ to: "closing" }];
    case "closing": return [{ to: "locked" }, { to: "active", blockedBy: otherActive?.shortLabel }];
    case "locked": return [{ to: "closing" }];
  }
}

export function periodStageLabel(status: AdminPeriodStatus | undefined, lang: Lang) {
  const labels: Record<AdminPeriodStatus, [string, string]> = {
    planned: ["计划中", "Planned"],
    setting: ["制定中", "Drafting"],
    active: ["进行中", "In progress"],
    closing: ["收尾中", "Closing"],
    locked: ["已锁定", "Locked"]
  };
  const [zh, en] = labels[status ?? "locked"];
  return lang === "en" ? en : zh;
}

/** Why a period refuses OKR edits, phrased for the person who tried. */
export function okrEditsClosedReason(status: AdminPeriodStatus | undefined, lang: Lang) {
  if (status === "closing") return lang === "en"
    ? "This period is closing: its OKRs are frozen and only progress can still be updated."
    : "该周期处于收尾中：OKR 内容已冻结，只能更新进展。";
  if (status === "planned") return lang === "en"
    ? "This period has not opened yet."
    : "该周期尚未开放。";
  return lang === "en" ? "This period is locked and read-only." : "该周期已锁定，只能查看。";
}

/** Why a period refuses check-ins, phrased for the person who tried. */
export function progressClosedReason(status: AdminPeriodStatus | undefined, lang: Lang) {
  if (status === "setting") return lang === "en"
    ? "OKRs are still being drafted for this period; progress updates open once it starts."
    : "该周期还在制定 OKR，启动后才能更新进展。";
  if (status === "planned") return lang === "en"
    ? "This period has not opened yet."
    : "该周期尚未开放。";
  return lang === "en" ? "This period is locked; progress can no longer be updated." : "该周期已锁定，不能再更新进展。";
}

function quarterIndex(id: string) {
  const match = /^(\d{4})-q([1-4])$/i.exec(id.trim());
  return match ? Number(match[1]) * 4 + Number(match[2]) - 1 : null;
}

import { hrefWithLang, type Lang } from "./i18n";

export type Period = {
  id: string;
  label: string;
  labelEn: string;
  shortLabel: string;
};

export const periods: Period[] = [
  { id: "2026-q3", label: "2026 年 7 月 - 9 月", labelEn: "Jul - Sep 2026", shortLabel: "2026 Q3" },
  { id: "2026-q2", label: "2026 年 4 月 - 6 月", labelEn: "Apr - Jun 2026", shortLabel: "2026 Q2" }
];

export function normalizePeriod(period?: string, availablePeriods: Period[] = periods, defaultPeriodId = availablePeriods[0]?.id ?? ""): string {
  return availablePeriods.some((item) => item.id === period) ? period! : defaultPeriodId;
}

export function periodHref(period: string, team: string, lang: Lang = "zh", mode?: string, memberEmail?: string) {
  const modeQuery = mode ? `&mode=${encodeURIComponent(mode)}` : "";
  const memberQuery = memberEmail ? `&member=${encodeURIComponent(memberEmail)}` : "";
  return hrefWithLang(`/?team=${encodeURIComponent(team)}&period=${encodeURIComponent(period)}${modeQuery}${memberQuery}`, lang);
}

export function periodLabel(period: Period, lang: Lang) {
  return lang === "en" ? period.labelEn : period.label;
}

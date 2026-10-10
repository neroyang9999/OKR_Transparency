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

// The period travels with the link: OKR ids can repeat across periods, and the
// detail page otherwise shows the default period's record.
export function okrDetailHref(okrId: string, period: string, lang: Lang = "zh") {
  return hrefWithLang(`/okr/${encodeURIComponent(okrId)}?period=${encodeURIComponent(period)}`, lang);
}

export function periodLabel(period: Period, lang: Lang) {
  return lang === "en" ? period.labelEn : period.label;
}

const quarterIdPattern = /^(\d{4})-q([1-4])$/i;
const monthNamesEn = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * The quarter after the newest one configured (or the current quarter when none
 * is). Its id must be `YYYY-qN`: the action center reads the quarter's start
 * from it, and an id is permanent once anything has been stored under it.
 */
export function nextQuarterPeriod(existing: { id: string }[], today = new Date()): Period {
  const quarterIndexes = existing.flatMap((period) => {
    const match = quarterIdPattern.exec(period.id.trim());
    return match ? [Number(match[1]) * 4 + Number(match[2]) - 1] : [];
  });
  const index = quarterIndexes.length > 0
    ? Math.max(...quarterIndexes) + 1
    : today.getFullYear() * 4 + Math.floor(today.getMonth() / 3);
  const year = Math.floor(index / 4);
  const quarter = (index % 4) + 1;
  const startMonth = (quarter - 1) * 3 + 1;
  const endMonth = startMonth + 2;
  return {
    id: `${year}-q${quarter}`,
    label: `${year} 年 ${startMonth} 月 - ${endMonth} 月`,
    labelEn: `${monthNamesEn[startMonth - 1]} - ${monthNamesEn[endMonth - 1]} ${year}`,
    shortLabel: `${year} Q${quarter}`
  };
}

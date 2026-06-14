export type Period = {
  id: string;
  label: string;
  shortLabel: string;
};

export const periods: Period[] = [
  { id: "2026-q3", label: "2026 年 7 月 - 9 月", shortLabel: "2026 Q3" },
  { id: "2026-q2", label: "2026 年 4 月 - 6 月", shortLabel: "2026 Q2" }
];

export function normalizePeriod(period?: string): string {
  return periods.some((item) => item.id === period) ? period! : "2026-q3";
}

export function periodHref(period: string, team: string) {
  return `/?team=${encodeURIComponent(team)}&period=${encodeURIComponent(period)}`;
}

"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { periodHref, periodLabel, periods, type Period } from "@/lib/periods";
import { t, type Lang } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export function PeriodSwitcher({
  selectedPeriod,
  selectedTeam,
  lang
}: {
  selectedPeriod: string;
  selectedTeam: string;
  lang: Lang;
}) {
  const currentIndex = Math.max(0, periods.findIndex((period) => period.id === selectedPeriod));
  const newerPeriod = periods[currentIndex - 1];
  const olderPeriod = periods[currentIndex + 1];

  return (
    <div className="flex min-w-0 items-center">
      <div className="flex h-10 max-w-full items-center rounded-md border border-border bg-white shadow-subtle">
        <PeriodArrow
          direction="newer"
          period={newerPeriod}
          selectedTeam={selectedTeam}
          lang={lang}
        />
        {periods.map((period) => (
          <PeriodTab
            key={period.id}
            period={period}
            selected={period.id === selectedPeriod}
            selectedTeam={selectedTeam}
            lang={lang}
          />
        ))}
        <PeriodArrow
          direction="older"
          period={olderPeriod}
          selectedTeam={selectedTeam}
          lang={lang}
        />
      </div>
    </div>
  );
}

function PeriodTab({
  period,
  selected,
  selectedTeam,
  lang
}: {
  period: Period;
  selected: boolean;
  selectedTeam: string;
  lang: Lang;
}) {
  return (
    <Link
      href={periodHref(period.id, selectedTeam, lang)}
      className={cn(
        "grid h-10 min-w-40 place-items-center border-l border-border px-5 text-sm font-medium transition-colors",
        selected ? "bg-blue-50/70 text-blue-600" : "text-slate-700 hover:bg-slate-50"
      )}
      aria-current={selected ? "page" : undefined}
    >
      {periodLabel(period, lang)}
    </Link>
  );
}

function PeriodArrow({
  direction,
  period,
  selectedTeam,
  lang
}: {
  direction: "newer" | "older";
  period?: Period;
  selectedTeam: string;
  lang: Lang;
}) {
  const icon = direction === "newer"
    ? <ChevronLeft className="h-4 w-4" />
    : <ChevronRight className="h-4 w-4" />;
  const label = direction === "newer" ? t(lang, "newerPeriod") : t(lang, "olderPeriod");
  const tooltip = period ? periodLabel(period, lang) : t(lang, "noMorePeriods");
  const tooltipClassName = cn(
    "pointer-events-none absolute top-[-38px] z-40 whitespace-nowrap rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white opacity-0 shadow-lg transition group-hover:opacity-100",
    "after:absolute after:left-1/2 after:top-full after:h-0 after:w-0 after:-translate-x-1/2 after:border-x-4 after:border-t-4 after:border-x-transparent after:border-t-slate-900",
    direction === "newer" ? "left-1/2 -translate-x-1/2" : "right-1/2 translate-x-1/2"
  );

  if (!period) {
    return (
      <span
        className="group relative grid h-10 w-10 shrink-0 place-items-center text-slate-300"
        aria-label={`${label}不可用`}
      >
        {icon}
        <span className={tooltipClassName}>{tooltip}</span>
      </span>
    );
  }

  return (
    <Link
      href={periodHref(period.id, selectedTeam, lang)}
      className="group relative grid h-10 w-10 shrink-0 place-items-center border-l border-border text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-950"
      aria-label={label}
    >
      {icon}
      <span className={tooltipClassName}>{tooltip}</span>
    </Link>
  );
}

import { AppShell } from "@/components/app-shell";
import { LoginPanel } from "@/components/login-panel";
import { OkrMap } from "@/components/okr-map";
import { getPageAccess } from "@/lib/admin/page-access";
import { readPeriodRecords } from "@/lib/okr/drafts";
import { readOkrSnapshot } from "@/lib/okr/store";
import { hrefWithLang, normalizeLang, t, type Lang } from "@/lib/i18n";
import { normalizePeriod, periodLabel, periods } from "@/lib/periods";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { buildAlignmentViewModel } from "@/lib/okr/alignment-view";

export default async function MapPage({
  searchParams
}: {
  searchParams: Promise<{ lang?: string; period?: string; team?: string }>;
}) {
  const [params, pageAccess] = await Promise.all([searchParams, getPageAccess()]);
  if (!pageAccess.access) {
    return (
      <AppShell active="okrMap" hideNavigation>
        <LoginPanel variant={pageAccess.sessionUser ? "denied" : "login"} email={pageAccess.sessionUser?.email} />
      </AppShell>
    );
  }

  const lang = normalizeLang(params.lang);
  const selectedPeriod = normalizePeriod(params.period);
  const snapshot = await readOkrSnapshot();
  const periodRecords = selectedPeriod === "2026-q3"
    ? snapshot.records
    : await readPeriodRecords(selectedPeriod) ?? [];
  const teams = buildAlignmentViewModel(periodRecords).teams;
  const selectedTeam = teams.includes(params.team ?? "") ? params.team : undefined;

  return (
    <AppShell active="okrMap">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-950">{t(lang, "mapTitle")}</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
            {t(lang, "mapSubtitle")}
          </p>
        </div>
        <div className="flex h-10 items-center rounded-md border border-border bg-white shadow-subtle">
          {periods.map((period) => (
            <Link
              key={period.id}
              href={mapHref({ period: period.id, team: selectedTeam, lang })}
              className={cn(
                "grid h-10 min-w-40 place-items-center border-l border-border px-5 text-sm font-medium first:border-l-0",
                period.id === selectedPeriod ? "bg-blue-50/70 text-blue-600" : "text-slate-700 hover:bg-slate-50"
              )}
              aria-current={period.id === selectedPeriod ? "page" : undefined}
            >
              {periodLabel(period, lang)}
            </Link>
          ))}
        </div>
      </div>
      {teams.length > 0 && (
        <div className="mb-5 flex flex-wrap items-center gap-2">
          <span className="mr-1 text-sm font-medium text-muted-foreground">{lang === "en" ? "Team" : "团队"}</span>
          <Link
            href={mapHref({ period: selectedPeriod, lang })}
            className={cn(
              "rounded-full border px-3 py-1 text-sm font-medium",
              !selectedTeam ? "border-blue-200 bg-blue-50 text-blue-700" : "border-border bg-white text-slate-600 hover:bg-slate-50"
            )}
          >
            {t(lang, "all")}
          </Link>
          {teams.map((team) => (
            <Link
              key={team}
              href={mapHref({ period: selectedPeriod, team, lang })}
              className={cn(
                "rounded-full border px-3 py-1 text-sm font-medium",
                selectedTeam === team ? "border-blue-200 bg-blue-50 text-blue-700" : "border-border bg-white text-slate-600 hover:bg-slate-50"
              )}
            >
              {team}
            </Link>
          ))}
        </div>
      )}
      <OkrMap records={periodRecords} lang={lang} selectedTeam={selectedTeam} />
    </AppShell>
  );
}

function mapHref({ period, team, lang }: { period: string; team?: string; lang: Lang }) {
  const teamQuery = team ? `&team=${encodeURIComponent(team)}` : "";
  return hrefWithLang(`/map?period=${encodeURIComponent(period)}${teamQuery}`, lang);
}

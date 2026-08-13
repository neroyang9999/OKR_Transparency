import { AppShell } from "@/components/app-shell";
import { LoginPanel } from "@/components/login-panel";
import { OkrAlignmentMap } from "@/components/okr-alignment-map";
import { getPageAccess } from "@/lib/admin/page-access";
import { readPeriodRecords } from "@/lib/okr/drafts";
import { readOkrSnapshot } from "@/lib/okr/store";
import { hrefWithLang, normalizeLang, t, type Lang } from "@/lib/i18n";
import { normalizePeriod, periodLabel } from "@/lib/periods";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { buildMapTeamScope } from "@/lib/okr/map-team-scope";

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
  const configuredPeriods = pageAccess.adminConfig.periods.map(({ id, label, labelEn, shortLabel }) => ({ id, label, labelEn, shortLabel }));
  const selectedPeriod = normalizePeriod(params.period, configuredPeriods, pageAccess.adminConfig.defaultPeriodId);
  const snapshot = await readOkrSnapshot();
  const periodRecords = selectedPeriod === pageAccess.adminConfig.defaultPeriodId
    ? snapshot.records
    : await readPeriodRecords(selectedPeriod) ?? [];
  const teamScope = buildMapTeamScope(pageAccess.adminConfig.teams, periodRecords, params.team);

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
          {configuredPeriods.map((period) => (
            <Link
              key={period.id}
              href={mapHref({ period: period.id, team: teamScope.selectedTeam, lang })}
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
      {teamScope.topLevelTeams.length > 0 && (
        <div className="mb-5 space-y-2 rounded-lg border border-border bg-white p-3 shadow-subtle">
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-1 min-w-24 text-sm font-medium text-muted-foreground">{lang === "en" ? "Organization" : "一级团队"}</span>
            <Link
              href={mapHref({ period: selectedPeriod, lang })}
              className={cn(
                "rounded-full border px-3 py-1 text-sm font-medium",
                !teamScope.selectedGroup ? "border-blue-200 bg-blue-50 text-blue-700" : "border-border bg-white text-slate-600 hover:bg-slate-50"
              )}
            >
              {t(lang, "all")}
            </Link>
            {teamScope.topLevelTeams.map((team) => (
              <Link
                key={team.id}
                href={mapHref({ period: selectedPeriod, team: team.name, lang })}
                className={cn(
                  "rounded-full border px-3 py-1 text-sm font-medium",
                  teamScope.selectedGroup === team.name ? "border-blue-200 bg-blue-50 text-blue-700" : "border-border bg-white text-slate-600 hover:bg-slate-50"
                )}
              >
                {team.name}
              </Link>
            ))}
          </div>
          {teamScope.childTeams.length > 0 && teamScope.selectedGroup && (
            <div className="flex flex-wrap items-center gap-2 border-t border-border pt-2">
              <span className="mr-1 min-w-24 text-sm font-medium text-muted-foreground">
                {lang === "en" ? `${teamScope.selectedGroup} teams` : `${teamScope.selectedGroup} 子团队`}
              </span>
              <Link
                href={mapHref({ period: selectedPeriod, team: teamScope.selectedGroup, lang })}
                className={cn(
                  "rounded-full border px-3 py-1 text-sm font-medium",
                  teamScope.selectedTeam === teamScope.selectedGroup ? "border-blue-200 bg-blue-50 text-blue-700" : "border-border bg-white text-slate-600 hover:bg-slate-50"
                )}
              >
                {lang === "en" ? `All ${teamScope.selectedGroup}` : `${teamScope.selectedGroup} 全部`}
              </Link>
              {teamScope.childTeams.map((team) => (
                <Link
                  key={team.id}
                  href={mapHref({ period: selectedPeriod, team: team.name, lang })}
                  className={cn(
                    "rounded-full border px-3 py-1 text-sm font-medium",
                    teamScope.selectedTeam === team.name ? "border-blue-200 bg-blue-50 text-blue-700" : "border-border bg-white text-slate-600 hover:bg-slate-50"
                  )}
                >
                  {team.name}
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
      <OkrAlignmentMap
        records={teamScope.records}
        teams={pageAccess.adminConfig.teams}
        lang={lang}
      />
    </AppShell>
  );
}


function mapHref({ period, team, lang }: { period: string; team?: string; lang: Lang }) {
  const teamQuery = team ? `&team=${encodeURIComponent(team)}` : "";
  return hrefWithLang(`/map?period=${encodeURIComponent(period)}${teamQuery}`, lang);
}

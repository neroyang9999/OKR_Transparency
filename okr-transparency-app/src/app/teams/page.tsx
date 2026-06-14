import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { OkrRecordCard } from "@/components/okr-record-card";
import { Badge } from "@/components/ui/badge";
import { getOkrTreeResponse } from "@/lib/okr/store";
import { hrefWithLang, normalizeLang, t, type Lang } from "@/lib/i18n";

export default async function TeamsPage({
  searchParams
}: {
  searchParams: Promise<{ team?: string; lang?: string }>;
}) {
  const [{ team, lang: rawLang }, data] = await Promise.all([searchParams, getOkrTreeResponse()]);
  const lang = normalizeLang(rawLang);
  const allLabel = t(lang, "all");
  const selectedTeam = team ?? allLabel;
  const records = team ? data.records.filter((record) => record.team === team) : data.records;

  return (
    <AppShell active="teams">
      <div className="mb-5">
        <h1 className="text-2xl font-semibold text-slate-950">{t(lang, "teamView")}</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {t(lang, "teamSubtitle")}
        </p>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <TeamFilter label={allLabel} selected={!team} lang={lang} />
        {data.stats.teams.map((teamName) => (
          <TeamFilter key={teamName} label={teamName} team={teamName} selected={team === teamName} lang={lang} />
        ))}
      </div>

      <div className="mb-3 flex items-center justify-between">
        <div className="text-sm text-muted-foreground">{records.length} {t(lang, "records")}</div>
        <Badge tone="gray">{selectedTeam}</Badge>
      </div>

      <div className="grid gap-3 xl:grid-cols-2">
        {records.map((record) => <OkrRecordCard key={record.okr_id} record={record} lang={lang} />)}
      </div>
    </AppShell>
  );
}

function TeamFilter({ label, team, selected, lang }: { label: string; team?: string; selected: boolean; lang: Lang }) {
  const href = team ? `/teams?team=${encodeURIComponent(team)}` : "/teams";
  return (
    <Link
      href={hrefWithLang(href, lang)}
      className={selected
        ? "rounded-md bg-slate-950 px-3 py-1.5 text-sm font-medium text-white"
        : "rounded-md border border-border bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"}
    >
      {label}
    </Link>
  );
}

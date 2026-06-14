import { AppShell } from "@/components/app-shell";
import { OkrRecordCard } from "@/components/okr-record-card";
import { getOkrTreeResponse } from "@/lib/okr/store";
import { searchOkrs } from "@/lib/okr/search";
import { confidenceLevels, okrTypes, type ConfidenceLevel, type OkrType } from "@/lib/okr/types";
import { normalizeLang, t } from "@/lib/i18n";

export default async function SearchPage({
  searchParams
}: {
  searchParams: Promise<{ q?: string; team?: string; confidence?: string; type?: string; lang?: string }>;
}) {
  const [params, data] = await Promise.all([searchParams, getOkrTreeResponse()]);
  const lang = normalizeLang(params.lang);
  const results = searchOkrs(data.records, {
    q: params.q ?? "",
    team: params.team ?? "",
    confidence: confidenceLevels.includes(params.confidence as ConfidenceLevel) ? params.confidence as ConfidenceLevel : "",
    type: okrTypes.includes(params.type as OkrType) ? params.type as OkrType : ""
  });

  return (
    <AppShell active="search">
      <div className="mb-5">
        <h1 className="text-2xl font-semibold text-slate-950">{t(lang, "searchOkrs")}</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {t(lang, "searchSubtitle")}
        </p>
      </div>

      <form className="mb-5 grid gap-3 rounded-lg border border-border bg-white p-4 shadow-subtle md:grid-cols-[1fr_160px_160px_160px_auto]">
        {lang === "en" && <input type="hidden" name="lang" value="en" />}
        <input
          name="q"
          defaultValue={params.q ?? ""}
          placeholder={t(lang, "searchPlaceholder")}
          className="h-10 rounded-md border border-border px-3 text-sm outline-none focus:border-blue-400"
        />
        <select name="team" defaultValue={params.team ?? ""} className="h-10 rounded-md border border-border px-3 text-sm">
          <option value="">{t(lang, "allTeams")}</option>
          {data.stats.teams.map((team) => <option key={team} value={team}>{team}</option>)}
        </select>
        <select name="confidence" defaultValue={params.confidence ?? ""} className="h-10 rounded-md border border-border px-3 text-sm">
          <option value="">{t(lang, "allConfidence")}</option>
          {confidenceLevels.map((level) => <option key={level} value={level}>{level}</option>)}
        </select>
        <select name="type" defaultValue={params.type ?? ""} className="h-10 rounded-md border border-border px-3 text-sm">
          <option value="">{t(lang, "allTypes")}</option>
          {okrTypes.map((type) => <option key={type} value={type}>{type}</option>)}
        </select>
        <button className="h-10 rounded-md bg-slate-950 px-4 text-sm font-medium text-white hover:bg-slate-800">
          {t(lang, "search")}
        </button>
      </form>

      <div className="mb-3 text-sm text-muted-foreground">{results.length} {t(lang, "results")}</div>
      <div className="grid gap-3 xl:grid-cols-2">
        {results.map((record) => <OkrRecordCard key={record.okr_id} record={record} lang={lang} />)}
      </div>
    </AppShell>
  );
}

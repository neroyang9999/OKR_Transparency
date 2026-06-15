import Link from "next/link";
import { ArrowUpRight, CalendarClock, CircleAlert, GitBranch } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ConfidenceBadge, Score, TypeBadge } from "@/components/okr-status";
import { Badge } from "@/components/ui/badge";
import { hrefWithLang, normalizeLang, t, translateText, type Lang } from "@/lib/i18n";
import { readPeriodRecords } from "@/lib/okr/drafts";
import { getOkrTreeResponse } from "@/lib/okr/store";
import type { OkrRecord } from "@/lib/okr/types";
import { periodLabel, periods } from "@/lib/periods";

export default async function TeamsPage({
  searchParams
}: {
  searchParams: Promise<{ team?: string; lang?: string }>;
}) {
  const [{ team, lang: rawLang }, data] = await Promise.all([searchParams, getOkrTreeResponse()]);
  const lang = normalizeLang(rawLang);
  const allLabel = t(lang, "all");
  const selectedTeam = team ?? allLabel;
  const currentRecords = team ? data.records.filter((record) => record.team === team) : data.records;
  const teams = team ? [team] : data.stats.teams;
  const periodRows = await getPeriodRows(team, data.records, lang);
  const attentionRecords = currentRecords
    .filter((record) => record.confidence !== "Green" || record.risks || record.decisions_needed)
    .slice(0, 6);
  const objectiveGroups = groupByObjective(currentRecords);

  return (
    <AppShell active="teams">
      <div className="mb-5">
        <h1 className="text-2xl font-semibold text-slate-950">{t(lang, "teamView")}</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
          {lang === "en"
            ? "Compare each team's current OKR health, historical period trend, and the Objective/KR details behind the status."
            : "按团队查看当前 OKR 健康度、历史周期变化，以及每个 Objective 背后的 KR、风险和待决策事项。"}
        </p>
      </div>

      <div className="mb-5 flex flex-wrap gap-2">
        <TeamFilter label={allLabel} selected={!team} lang={lang} />
        {data.stats.teams.map((teamName) => (
          <TeamFilter key={teamName} label={teamName} team={teamName} selected={team === teamName} lang={lang} />
        ))}
      </div>

      <div className="mb-4 grid gap-3 lg:grid-cols-4">
        <SummaryTile
          label={lang === "en" ? "Visible teams" : "展示团队"}
          value={teams.length}
          detail={selectedTeam}
        />
        <SummaryTile
          label={lang === "en" ? "Current OKRs" : "当前 OKR"}
          value={currentRecords.length}
          detail={`${countObjectives(currentRecords)} Objective / ${countKrs(currentRecords)} KR`}
        />
        <SummaryTile
          label={lang === "en" ? "Average score" : "平均进度"}
          value={formatAverage(currentRecords)}
          detail={lang === "en" ? "current period" : "当前周期"}
        />
        <SummaryTile
          label={lang === "en" ? "Needs attention" : "需关注项"}
          value={attentionRecords.length}
          detail={lang === "en" ? "Yellow/Red, risk, or decision" : "Yellow/Red、风险或待决策"}
        />
      </div>

      <section className="mb-5 grid gap-3 xl:grid-cols-3">
        {teams.map((teamName) => (
          <TeamHealthCard key={teamName} team={teamName} records={data.records.filter((record) => record.team === teamName)} lang={lang} />
        ))}
      </section>

      <section className="mb-5 rounded-lg border border-border bg-white shadow-subtle">
        <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-slate-950">{lang === "en" ? "Period Trend" : "周期趋势"}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {lang === "en" ? "Current and historical OKR volume, score, and confidence distribution." : "展示当前和历史周期的 OKR 数量、平均进度和红黄绿分布。"}
            </p>
          </div>
          <Badge tone="gray">{selectedTeam}</Badge>
        </div>
        <div className="grid gap-px overflow-hidden bg-border md:grid-cols-2">
          {periodRows.map((row) => (
            <PeriodTrendCard key={row.periodId} row={row} lang={lang} />
          ))}
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-slate-950">{lang === "en" ? "Current Objective Structure" : "当前 Objective 结构"}</h2>
            <div className="text-sm text-muted-foreground">{currentRecords.length} {t(lang, "records")}</div>
          </div>
          {objectiveGroups.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border bg-white p-8 text-center text-sm text-muted-foreground">{t(lang, "noTeamData")}</div>
          ) : (
            objectiveGroups.map((group) => <ObjectiveGroup key={group.objective.okr_id} group={group} lang={lang} />)
          )}
        </section>

        <aside className="space-y-3">
          <h2 className="text-base font-semibold text-slate-950">{lang === "en" ? "Attention Queue" : "关注队列"}</h2>
          {attentionRecords.length === 0 ? (
            <div className="rounded-lg border border-border bg-white p-4 text-sm text-muted-foreground">{t(lang, "noHighRisk")}</div>
          ) : (
            attentionRecords.map((record) => <AttentionItem key={record.okr_id} record={record} lang={lang} />)
          )}
        </aside>
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

function SummaryTile({ label, value, detail }: { label: string; value: string | number; detail: string }) {
  return (
    <div className="rounded-lg border border-border bg-white px-4 py-3 shadow-subtle">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums text-slate-950">{value}</div>
      <div className="mt-1 truncate text-xs text-muted-foreground">{detail}</div>
    </div>
  );
}

function TeamHealthCard({ team, records, lang }: { team: string; records: OkrRecord[]; lang: Lang }) {
  const summary = summarize(records);
  return (
    <Link href={hrefWithLang(`/teams?team=${encodeURIComponent(team)}`, lang)} className="block rounded-lg border border-border bg-white p-4 shadow-subtle hover:border-blue-200 hover:bg-blue-50/30">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <TeamAvatar name={team} />
            <h2 className="truncate text-base font-semibold text-slate-950">{team}</h2>
          </div>
          <div className="mt-2 text-sm text-muted-foreground">{summary.objectives} Objective / {summary.krs} KR</div>
        </div>
        <div className="text-right">
          <div className="text-lg font-semibold tabular-nums text-slate-950">{summary.averageLabel}</div>
          <div className="text-xs text-muted-foreground">{t(lang, "score")}</div>
        </div>
      </div>
      <ConfidenceBar summary={summary} />
      <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
        <MiniMetric label={lang === "en" ? "Risk" : "风险"} value={summary.risks} />
        <MiniMetric label={lang === "en" ? "Decision" : "决策"} value={summary.decisions} />
        <MiniMetric label={lang === "en" ? "Updated" : "更新"} value={summary.lastUpdate || "-"} />
      </div>
    </Link>
  );
}

function PeriodTrendCard({ row, lang }: { row: PeriodRow; lang: Lang }) {
  return (
    <div className="bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-950">
            <CalendarClock className="h-4 w-4 text-blue-500" />
            {row.label}
          </div>
          <div className="mt-2 text-sm text-muted-foreground">{row.summary.objectives} Objective / {row.summary.krs} KR</div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-semibold tabular-nums text-slate-950">{row.summary.averageLabel}</div>
          <div className="text-xs text-muted-foreground">{t(lang, "score")}</div>
        </div>
      </div>
      <ConfidenceBar summary={row.summary} />
      <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
        <MiniMetric label="Green" value={row.summary.green} />
        <MiniMetric label="Yellow" value={row.summary.yellow} />
        <MiniMetric label="Red" value={row.summary.red} />
      </div>
    </div>
  );
}

function ObjectiveGroup({ group, lang }: { group: ObjectiveGroupData; lang: Lang }) {
  const objective = group.objective;
  return (
    <article className="rounded-lg border border-border bg-white p-4 shadow-subtle">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="blue">Objective</Badge>
        <Badge tone="gray">{objective.team}</Badge>
        <TypeBadge value={objective.type} />
        <ConfidenceBadge value={objective.confidence} />
      </div>
      <h3 className="mt-3 text-base font-semibold leading-6 text-slate-950">
        {translateText(objective.objective, lang)}
      </h3>
      <div className="mt-3 grid gap-3 text-xs text-slate-600 sm:grid-cols-3">
        <Field label={t(lang, "owner")} value={objective.owner} />
        <Field label={t(lang, "score")} value={<Score value={objective.score} />} />
        <Field label={t(lang, "updated")} value={objective.last_update} />
      </div>
      {group.krs.length > 0 && (
        <div className="mt-4 divide-y divide-border rounded-md border border-border">
          {group.krs.map((kr, index) => (
            <div key={kr.okr_id} className="p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="blue">KR {index + 1}</Badge>
                <TypeBadge value={kr.type} />
                <ConfidenceBadge value={kr.confidence} />
                <span className="text-xs text-muted-foreground">{t(lang, "score")} <Score value={kr.score} /></span>
              </div>
              <div className="mt-2 text-sm font-semibold leading-5 text-slate-900">{translateText(kr.kr || kr.objective, lang)}</div>
            </div>
          ))}
        </div>
      )}
    </article>
  );
}

function AttentionItem({ record, lang }: { record: OkrRecord; lang: Lang }) {
  return (
    <article className="rounded-lg border border-border bg-white p-4 shadow-subtle">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="blue">{record.kr ? "KR" : "Objective"}</Badge>
        <Badge tone="gray">{record.team}</Badge>
        <ConfidenceBadge value={record.confidence} />
      </div>
      <div className="mt-3 text-sm font-semibold leading-5 text-slate-950">{translateText(record.kr || record.objective, lang)}</div>
      <div className="mt-3 space-y-2 text-xs text-muted-foreground">
        {record.risks && <IconLine icon={<CircleAlert className="h-3.5 w-3.5" />} text={translateText(record.risks, lang)} />}
        {record.dependencies && <IconLine icon={<GitBranch className="h-3.5 w-3.5" />} text={translateText(record.dependencies, lang)} />}
        {record.decisions_needed && <IconLine icon={<ArrowUpRight className="h-3.5 w-3.5" />} text={translateText(record.decisions_needed, lang)} />}
      </div>
    </article>
  );
}

function ConfidenceBar({ summary }: { summary: TeamSummary }) {
  const total = Math.max(1, summary.total);
  return (
    <div className="mt-4 flex h-2 overflow-hidden rounded-full bg-slate-100">
      <div className="bg-emerald-400" style={{ width: `${summary.green / total * 100}%` }} />
      <div className="bg-amber-400" style={{ width: `${summary.yellow / total * 100}%` }} />
      <div className="bg-rose-400" style={{ width: `${summary.red / total * 100}%` }} />
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border border-border bg-slate-50 px-2 py-2">
      <div className="text-muted-foreground">{label}</div>
      <div className="mt-0.5 truncate font-semibold tabular-nums text-slate-900">{value}</div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-muted-foreground">{label}</div>
      <div className="mt-0.5 font-medium text-slate-800">{value}</div>
    </div>
  );
}

function IconLine({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className="mt-0.5 shrink-0 text-slate-400">{icon}</span>
      <span className="leading-4">{text}</span>
    </div>
  );
}

function TeamAvatar({ name }: { name: string }) {
  return (
    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-blue-500 text-xs font-semibold text-white">
      {initials(name)}
    </span>
  );
}

async function getPeriodRows(team: string | undefined, currentRecords: OkrRecord[], lang: Lang): Promise<PeriodRow[]> {
  return Promise.all(periods.map(async (period) => {
    const records = period.id === "2026-q3" ? currentRecords : await readPeriodRecords(period.id) ?? [];
    const scopedRecords = team ? records.filter((record) => record.team === team) : records;
    return {
      periodId: period.id,
      label: periodLabel(period, lang),
      summary: summarize(scopedRecords)
    };
  }));
}

function groupByObjective(records: OkrRecord[]): ObjectiveGroupData[] {
  const byId = new Map(records.map((record) => [record.okr_id, record]));
  const roots = records.filter((record) => {
    const parent = record.parent_id ? byId.get(record.parent_id) : null;
    return !record.kr && (!parent || parent.team !== record.team);
  });
  const groupedIds = new Set<string>();
  const groups = roots.map((objective) => {
    groupedIds.add(objective.okr_id);
    const krs = records.filter((record) => record.parent_id === objective.okr_id);
    krs.forEach((kr) => groupedIds.add(kr.okr_id));
    return { objective, krs };
  });

  records
    .filter((record) => !groupedIds.has(record.okr_id))
    .forEach((record) => groups.push({ objective: record, krs: [] }));

  return groups;
}

function summarize(records: OkrRecord[]): TeamSummary {
  const scores = records
    .map((record) => record.score)
    .filter((score): score is number => typeof score === "number");
  const average = scores.length ? scores.reduce((sum, score) => sum + score, 0) / scores.length : null;

  return {
    total: records.length,
    objectives: countObjectives(records),
    krs: countKrs(records),
    average,
    averageLabel: average === null ? "N/A" : `${Math.round(average * 100)}%`,
    green: records.filter((record) => record.confidence === "Green").length,
    yellow: records.filter((record) => record.confidence === "Yellow").length,
    red: records.filter((record) => record.confidence === "Red").length,
    risks: records.filter((record) => record.risks).length,
    decisions: records.filter((record) => record.decisions_needed).length,
    lastUpdate: records.map((record) => record.last_update).filter(Boolean).sort().at(-1) ?? ""
  };
}

function formatAverage(records: OkrRecord[]) {
  return summarize(records).averageLabel;
}

function countObjectives(records: OkrRecord[]) {
  return records.filter((record) => !record.kr).length;
}

function countKrs(records: OkrRecord[]) {
  return records.filter((record) => record.kr).length;
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

type TeamSummary = {
  total: number;
  objectives: number;
  krs: number;
  average: number | null;
  averageLabel: string;
  green: number;
  yellow: number;
  red: number;
  risks: number;
  decisions: number;
  lastUpdate: string;
};

type PeriodRow = {
  periodId: string;
  label: string;
  summary: TeamSummary;
};

type ObjectiveGroupData = {
  objective: OkrRecord;
  krs: OkrRecord[];
};

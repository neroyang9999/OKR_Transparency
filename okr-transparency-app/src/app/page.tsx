import Link from "next/link";
import {
  CircleDot,
  Link2,
  Users
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PeriodSwitcher } from "@/components/period-switcher";
import { ProgressNoteCard } from "@/components/progress-note-card";
import { TeamSidebar, type TeamNavItem } from "@/components/team-sidebar";
import { ConfidenceBadge, Score, TypeBadge } from "@/components/okr-status";
import { Badge } from "@/components/ui/badge";
import { OkrEditBoard, type AlignmentOption } from "@/components/okr-edit-board";
import { readAdminConfig, type AdminConfig } from "@/lib/admin/config";
import type { OkrRecord } from "@/lib/okr/types";
import { readDraft } from "@/lib/okr/drafts";
import { readPeriodRecords } from "@/lib/okr/drafts";
import { readProgressNotes, type ProgressNote } from "@/lib/okr/progress-notes";
import { getOkrTreeResponse } from "@/lib/okr/store";
import type { Period } from "@/lib/periods";
import { hrefWithLang, normalizeLang, t, translateText, type Lang } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export default async function HomePage({
  searchParams
}: {
  searchParams: Promise<{ team?: string; period?: string; lang?: string; mode?: string }>;
}) {
  const [{ team, period, lang: rawLang, mode }, data, progressNotes, adminConfig] = await Promise.all([
    searchParams,
    getOkrTreeResponse(),
    readProgressNotes(),
    readAdminConfig()
  ]);
  const lang = normalizeLang(rawLang ?? adminConfig.settings.defaultLanguage);
  const selectedTeam = normalizeTeam(team, adminConfig);
  const selectedPeriod = normalizePeriodFromConfig(period, adminConfig);
  const periods = getConfiguredPeriods(adminConfig);
  const selectedPeriodLabel = periods.find((item) => item.id === selectedPeriod)?.shortLabel ?? selectedPeriod;
  const teamNav = buildTeamNav(adminConfig);
  const draft = mode === "edit" ? await readDraft(selectedTeam, selectedPeriod) : null;
  const periodRecords = selectedPeriod === "2026-q3" ? data.records : await readPeriodRecords(selectedPeriod) ?? [];
  const selectedRecords = periodRecords.filter((record) => record.team === selectedTeam);
  const recordById = new Map(periodRecords.map((record) => [record.okr_id, record]));
  const rootObjectives = selectedRecords.filter((record) => {
    const parent = record.parent_id ? recordById.get(record.parent_id) : null;
    return !parent || parent.team !== selectedTeam;
  });
  const selectedNavItem = teamNav.find((item) => item.name === selectedTeam);
  const childTeamNames = new Set(selectedNavItem?.children.map((child) => child.name) ?? []);
  const childTeams = childTeamNames.size > 0
    ? periodRecords.filter((record) => childTeamNames.has(record.team) && isTeamRoot(record, recordById))
    : [];
  const alignmentOptions = getAlignmentOptions(periodRecords, selectedTeam, adminConfig);

  return (
    <AppShell active="overview">
      <div className="grid min-h-[calc(100vh-104px)] gap-5 lg:grid-cols-[300px_1fr]">
        <TeamSidebar items={teamNav} selectedTeam={selectedTeam} lang={lang} />

        <section className="min-w-0">
          {draft ? (
            <OkrEditBoard initialDraft={draft} lang={lang} alignmentOptions={alignmentOptions} />
          ) : (
            <>
          <div className="mb-4 flex flex-col gap-3 rounded-lg border border-border bg-white px-5 py-4 shadow-subtle md:flex-row md:items-center md:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <TeamAvatar name={selectedTeam} size="lg" />
              <div className="min-w-0">
                <h1 className="truncate text-2xl font-semibold text-slate-950">{selectedTeam} OKR</h1>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                  <span>{selectedPeriodLabel}</span>
                  <span>·</span>
                  <span>{selectedRecords.length} {t(lang, "records")}</span>
                  <span>·</span>
                  <span>{data.meta.source} {t(lang, "source")}</span>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <PeriodSwitcher selectedPeriod={selectedPeriod} selectedTeam={selectedTeam} lang={lang} periodsOverride={periods} />
              {adminConfig.settings.showEditLinks && (
                <Link
                  href={hrefWithLang(`/?team=${encodeURIComponent(selectedTeam)}&period=${encodeURIComponent(selectedPeriod)}&mode=edit`, lang)}
                  className="inline-flex h-9 items-center rounded-md bg-blue-600 px-3 text-sm font-medium text-white hover:bg-blue-700"
                >
                  {t(lang, "editOkrs")}
                </Link>
              )}
            </div>
          </div>

          {rootObjectives.length === 0 ? (
            <EmptyTeam lang={lang} />
          ) : (
            <div className="overflow-hidden rounded-lg border border-border bg-white shadow-subtle">
              {rootObjectives.map((objective, index) => (
                <ObjectiveBlock
                  key={objective.okr_id}
                  index={index}
                  objective={objective}
                  records={periodRecords}
                  selectedPeriod={selectedPeriod}
                  progressNotes={progressNotes}
                  showProgressNotes={adminConfig.settings.allowProgressNotes}
                  lang={lang}
                />
              ))}

              {childTeams.length > 0 && (
                <div className="border-t border-border bg-slate-50 px-6 py-4">
                  <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800">
                    <Users className="h-4 w-4 text-blue-500" />
                    {selectedTeam} {t(lang, "childTeams")}
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    {childTeams.map((child) => (
                      <Link
                        key={child.okr_id}
                        href={hrefWithLang(`/?team=${encodeURIComponent(child.team)}`, lang)}
                        className="rounded-md border border-border bg-white p-3 hover:border-blue-200 hover:bg-blue-50"
                      >
                        <div className="flex items-center gap-3">
                          <TeamAvatar name={child.team} />
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold text-slate-900">{child.team}</div>
                            <div className="mt-1 truncate text-xs text-muted-foreground">{translateText(child.objective, lang)}</div>
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
            </>
          )}
        </section>
      </div>
    </AppShell>
  );
}

function ObjectiveBlock({
  index,
  objective,
  records,
  selectedPeriod,
  progressNotes,
  showProgressNotes,
  lang
}: {
  index: number;
  objective: OkrRecord;
  records: OkrRecord[];
  selectedPeriod: string;
  progressNotes: ProgressNote[];
  showProgressNotes: boolean;
  lang: Lang;
}) {
  const children = records.filter((record) => record.parent_id === objective.okr_id);
  const progress = objective.score === null ? 0 : Math.round(objective.score * 100);
  const alignedRecord = objective.parent_id ? records.find((record) => record.okr_id === objective.parent_id) : null;
  const alignedParent = alignedRecord?.parent_id ? records.find((record) => record.okr_id === alignedRecord.parent_id) : null;
  const objectiveProgressNotes = progressNotes.filter((note) =>
    note.team === objective.team &&
    note.periodId === selectedPeriod &&
    note.objectiveId === objective.okr_id
  );

  return (
    <article className={cn("relative px-6 py-6", index > 0 && "border-t border-border")}>
      <div className="grid gap-4 md:grid-cols-[72px_1fr]">
        <div className="relative hidden md:block">
          <div className="absolute left-8 top-8 h-[calc(100%-32px)] w-px bg-slate-200" />
          <div className="relative z-10 grid h-12 w-12 place-items-center rounded-full bg-blue-500 text-lg font-semibold text-white shadow-sm">
            O{index + 1}
          </div>
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>{objective.owner}</span>
            <TypeBadge value={objective.type} />
            <ConfidenceBadge value={objective.confidence} />
            <span>{t(lang, "score")} <Score value={objective.score} /></span>
          </div>
          <Link
            href={hrefWithLang(`/okr/${encodeURIComponent(objective.okr_id)}`, lang)}
            className="mt-2 block text-xl font-semibold leading-8 text-slate-950 hover:text-blue-700"
          >
            {t(lang, "targetPrefix")}{translateText(objective.objective, lang)}
          </Link>
          {alignedRecord && <AlignmentPill record={alignedRecord} parent={alignedParent} lang={lang} />}
          <div className="mt-3 h-2 max-w-3xl overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-blue-500" style={{ width: `${progress}%` }} />
          </div>

          <div className="mt-5 space-y-3 border-y border-border py-3">
            {children.filter((record) => record.kr).map((kr) => (
              <KRRow key={kr.okr_id} kr={kr} lang={lang} />
            ))}
          </div>

          {showProgressNotes && (
            <ProgressNoteCard
              team={objective.team}
              periodId={selectedPeriod}
              objectiveId={objective.okr_id}
              progressNotes={objectiveProgressNotes}
              fallbackNote={translateText(objective.risks || objective.decisions_needed || t(lang, "noHighRisk"), lang)}
              defaultStatus={objective.confidence}
              fullHistoryHref={hrefWithLang(`/okr/${encodeURIComponent(objective.okr_id)}`, lang)}
              lang={lang}
            />
          )}
        </div>
      </div>
    </article>
  );
}

function KRRow({ kr, lang }: { kr: OkrRecord; lang: Lang }) {
  const progress = kr.score === null ? 0 : Math.round(kr.score * 100);
  const tone = kr.confidence === "Green" ? "bg-emerald-400" : kr.confidence === "Red" ? "bg-rose-400" : "bg-blue-400";

  return (
    <Link
      href={hrefWithLang(`/okr/${encodeURIComponent(kr.okr_id)}`, lang)}
      className="block rounded-md border border-transparent px-3 py-3 transition hover:border-blue-100 hover:bg-slate-50"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <CircleDot className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
          <span className="text-sm font-semibold leading-6 text-slate-900">{translateText(kr.kr, lang)}</span>
        </div>
        <Badge
          className="shrink-0"
          tone={kr.confidence === "Green" ? "green" : kr.confidence === "Red" ? "red" : "yellow"}
        >
          {progress}%
        </Badge>
      </div>
      <div className="mt-3 pl-7">
        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
          <div className={cn("h-full rounded-full", tone)} style={{ width: `${progress}%` }} />
        </div>
      </div>
    </Link>
  );
}

function AlignmentPill({
  record,
  parent,
  lang
}: {
  record: OkrRecord;
  parent?: OkrRecord | null;
  lang: Lang;
}) {
  const progress = record.score === null ? null : Math.round(record.score * 100);
  const title = record.kr || record.objective;
  const kind = record.kr ? "KR" : "O";

  return (
    <span className="group relative mt-2 inline-flex max-w-full items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">
      <Link2 className="h-3.5 w-3.5 shrink-0" />
      <span>{lang === "en" ? "Aligned to" : "对齐"}</span>
      <span>{record.team}</span>
      <span className="text-blue-300">/</span>
      <span>{record.owner}</span>
      <span className="rounded bg-white px-1">{kind}</span>
      <span className="max-w-[520px] truncate">{translateText(title, lang)}</span>
      <span className="pointer-events-none absolute left-4 top-full z-40 hidden w-[420px] rounded-lg border border-border bg-white p-4 text-left text-slate-700 shadow-xl group-hover:block">
        <span className="flex items-center justify-between gap-3">
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-slate-950">{record.team} / {record.owner}</span>
            <span className="mt-1 block text-xs text-slate-500">{record.okr_id} · {kind}</span>
          </span>
          <ConfidenceBadge value={record.confidence} />
        </span>
        <span className="mt-3 block text-sm font-semibold leading-6 text-slate-900">{translateText(title, lang)}</span>
        {parent && (
          <span className="mt-2 block rounded bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-500">
            {lang === "en" ? "Parent Objective" : "所属 Objective"}：{translateText(parent.objective, lang)}
          </span>
        )}
        <span className="mt-3 block text-xs text-slate-500">
          {lang === "en" ? "Progress" : "进度"}：{progress === null ? "N/A" : `${progress}%`}
        </span>
      </span>
    </span>
  );
}

function TeamAvatar({ name, size = "sm" }: { name: string; size?: "sm" | "lg" }) {
  return (
    <span className={cn(
      "grid shrink-0 place-items-center rounded-full bg-gradient-to-br from-blue-500 to-cyan-400 font-semibold text-white",
      size === "lg" ? "h-12 w-12 text-base" : "h-8 w-8 text-xs"
    )}>
      {initials(name)}
    </span>
  );
}

function EmptyTeam({ lang }: { lang: Lang }) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-white p-10 text-center text-sm text-muted-foreground">
      {t(lang, "noTeamData")}
    </div>
  );
}

function normalizeTeam(team: string | undefined, config: AdminConfig) {
  const enabledTeams = config.teams.filter((item) => item.enabled);
  const allowed = new Set(enabledTeams.map((item) => item.name));
  return team && allowed.has(team) ? team : config.defaultTeam;
}

function isTeamRoot(record: OkrRecord, recordById: Map<string, OkrRecord>) {
  const parent = record.parent_id ? recordById.get(record.parent_id) : null;
  return !parent || parent.team !== record.team;
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function getAlignmentOptions(records: OkrRecord[], team: string, config: AdminConfig): AlignmentOption[] {
  const parentTeam = parentTeamFor(team, config);
  if (!parentTeam) return [];

  const recordById = new Map(records.map((record) => [record.okr_id, record]));
  return records
    .filter((record) => record.team === parentTeam)
    .map((record) => {
      const parent = record.parent_id ? recordById.get(record.parent_id) : null;
      return {
        id: record.okr_id,
        kind: record.kr ? "KR" : "O",
        team: record.team,
        owner: record.owner,
        title: record.kr || record.objective,
        parentTitle: record.kr ? parent?.objective ?? record.objective : undefined,
        progress: record.score === null ? null : Math.round(record.score * 100),
        confidence: record.confidence
      } satisfies AlignmentOption;
    });
}

function parentTeamFor(team: string, config: AdminConfig) {
  return config.teams.find((item) => item.name === team && item.enabled)?.parentTeam || null;
}

function normalizePeriodFromConfig(period: string | undefined, config: AdminConfig) {
  return config.periods.some((item) => item.id === period) ? period! : config.defaultPeriodId;
}

function getConfiguredPeriods(config: AdminConfig): Period[] {
  return config.periods.map(({ id, label, labelEn, shortLabel }) => ({ id, label, labelEn, shortLabel }));
}

function buildTeamNav(config: AdminConfig): TeamNavItem[] {
  const enabledTeams = config.teams.filter((team) => team.enabled);
  return enabledTeams
    .filter((team) => !team.parentTeam)
    .map((team) => ({
      name: team.name,
      owner: team.owner,
      color: team.color,
      children: enabledTeams
        .filter((child) => child.parentTeam === team.name)
        .map((child) => ({ name: child.name, owner: child.owner }))
    }));
}

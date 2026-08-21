import Link from "next/link";
import {
  CircleDot,
  Link2
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { LoginPanel } from "@/components/login-panel";
import { OkrDetailDrawer, OkrDetailLink } from "@/components/okr-detail-drawer";
import { PeriodSwitcher } from "@/components/period-switcher";
import { ProgressNoteCard } from "@/components/progress-note-card";
import { TeamSidebar, type TeamNavItem } from "@/components/team-sidebar";
import { resolveTeamOwner, selectableTeamOwners } from "@/lib/admin/team-owners";
import { ConfidenceBadge, Score, TypeBadge } from "@/components/okr-status";
import { Badge } from "@/components/ui/badge";
import { OkrEditBoard } from "@/components/okr-edit-board";
import { type AdminConfig, type AdminUser } from "@/lib/admin/config";
import { getPageAccess } from "@/lib/admin/page-access";
import { getTeamEditPolicy } from "@/lib/admin/permissions";
import type { OkrRecord } from "@/lib/okr/types";
import { getOkrQualityStats } from "@/lib/okr/graph-validation";
import { filterDraftByOwner } from "@/lib/okr/edit-types";
import { getAlignmentOptions } from "@/lib/okr/alignment-candidates";
import { readDraft } from "@/lib/okr/drafts";
import { readPeriodRecords } from "@/lib/okr/drafts";
import { ownerScopeForTeam, ownerScopeForUser, teamScopedRecords } from "@/lib/okr/owner-scope";
import { readProgressNotes, type ProgressNote } from "@/lib/okr/progress-notes";
import { getOkrTreeResponse } from "@/lib/okr/store";
import type { Period } from "@/lib/periods";
import { hrefWithLang, normalizeLang, t, translateText, type Lang } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export default async function HomePage({
  searchParams
}: {
  searchParams: Promise<{ team?: string; period?: string; lang?: string; mode?: string; member?: string; detail?: string }>;
}) {
  const [{ team, period, lang: rawLang, mode, member, detail }, pageAccess] = await Promise.all([
    searchParams,
    getPageAccess()
  ]);
  const { adminConfig, sessionUser, access } = pageAccess;
  const lang = normalizeLang(rawLang ?? adminConfig.settings.defaultLanguage);
  const selectedTeam = normalizeTeam(team, adminConfig);
  const selectedPeriod = normalizePeriodFromConfig(period, adminConfig);
  const periods = getConfiguredPeriods(adminConfig);
  const selectedPeriodLabel = periods.find((item) => item.id === selectedPeriod)?.shortLabel ?? selectedPeriod;
  const teamNav = buildTeamNav(adminConfig);
  const selectedMember = normalizeMember(member, selectedTeam, adminConfig);
  const selectedTeamOwner = adminConfig.teams.find((item) => item.name === selectedTeam && item.enabled)?.owner ?? selectedTeam;
  const selectedOwnerScope = selectedMember
    ? ownerScopeForUser(selectedMember)
    : ownerScopeForTeam(adminConfig, selectedTeam) ?? { owner: selectedTeamOwner, aliases: [selectedTeamOwner], objectiveScope: "team" as const };
  const selectedOwner = selectedOwnerScope.owner;
  const selectedOwnerAliases = selectedOwnerScope.aliases;

  if (!access) {
    return (
      <AppShell active="overview" hideNavigation compactOnLaptop>
        <LoginPanel variant={sessionUser ? "denied" : "login"} email={sessionUser?.email} />
      </AppShell>
    );
  }

  const [data, progressNotes] = await Promise.all([
    getOkrTreeResponse(),
    adminConfig.settings.allowProgressNotes ? readProgressNotes() : Promise.resolve([])
  ]);
  const editPolicy = getTeamEditPolicy(adminConfig, selectedTeam, access);
  const baseDraft = mode === "edit" && editPolicy.canEdit ? await readDraft(selectedTeam, selectedPeriod) : null;
  const draft = baseDraft ? filterDraftByOwner(baseDraft, selectedOwnerAliases, selectedOwner, selectedOwnerScope) : null;
  const periodRecords = selectedPeriod === adminConfig.defaultPeriodId ? data.records : await readPeriodRecords(selectedPeriod) ?? [];
  const teamRecords = periodRecords.filter((record) => record.team === selectedTeam);
  const selectedRecords = selectedMember
    ? buildOwnerScopedRecords(teamRecords, selectedOwnerAliases)
    : teamScopedRecords(teamRecords);
  const qualityStats = getOkrQualityStats(selectedRecords);
  const displayRecordCount = selectedMember
    ? selectedRecords.filter((record) => ownerMatches(record.owner, selectedOwnerAliases)).length
    : selectedRecords.length;
  const recordById = new Map(periodRecords.map((record) => [record.okr_id, record]));
  const rootObjectives = selectedMember
    ? selectedRecords.filter((record) => !record.kr && ownerMatches(record.owner, selectedOwnerAliases))
    : selectedRecords.filter((record) => {
        const parent = record.parent_id ? recordById.get(record.parent_id) : null;
        return !parent || parent.team !== selectedTeam;
      });
  const alignmentOptions = getAlignmentOptions(periodRecords, selectedTeam, adminConfig, selectedMember ? "member" : "team");
  const detailHref = (okrId: string) => hrefWithLang(
    buildOverviewHref({
      team: selectedTeam,
      period: selectedPeriod,
      member: selectedMember?.email,
      detail: okrId
    }),
    lang
  );

  return (
    <AppShell active="overview" compactOnLaptop>
      <div className="grid min-h-[calc(100vh-104px)] gap-5 lg:grid-cols-[300px_1fr]">
        <TeamSidebar items={teamNav} selectedTeam={selectedTeam} selectedMemberEmail={selectedMember?.email} lang={lang} />

        <section className="min-w-0">
          {draft ? (
            <OkrEditBoard
              initialDraft={draft}
              lang={lang}
              alignmentOptions={alignmentOptions}
              teamOwner={selectedOwner}
              policy={editPolicy}
              ownerEmail={selectedMember?.email}
              title={selectedMember ? `${selectedMember.displayName} OKR` : `${selectedTeam} OKR`}
              periods={periods}
            />
          ) : (
            <>
          <div className="mb-4 flex flex-col gap-3 rounded-lg border border-border bg-white px-5 py-4 shadow-subtle md:flex-row md:items-center md:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <TeamAvatar name={selectedTeam} size="lg" />
              <div className="min-w-0">
                <h1 className="truncate text-2xl font-semibold text-slate-950">{selectedMember ? `${selectedMember.displayName} OKR` : `${selectedTeam} OKR`}</h1>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                  {selectedMember && (
                    <>
                      <span>{selectedTeam}</span>
                      <span>·</span>
                    </>
                  )}
                  <span>{selectedPeriodLabel}</span>
                  <span>·</span>
                  <span>{displayRecordCount} {t(lang, "records")}</span>
                  <span>·</span>
                  <span>{data.meta.source} {t(lang, "source")}</span>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <PeriodSwitcher selectedPeriod={selectedPeriod} selectedTeam={selectedTeam} selectedMemberEmail={selectedMember?.email} lang={lang} periodsOverride={periods} />
              {adminConfig.settings.showEditLinks && editPolicy.canEdit && (
                <Link
                  href={hrefWithLang(buildOverviewHref({
                    team: selectedTeam,
                    period: selectedPeriod,
                    member: selectedMember?.email,
                    detail: "",
                    mode: "edit"
                  }), lang)}
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
            /* A column, never a grid: each Objective keeps the full width even on a wide monitor,
               so two of them are never set side by side. */
            <div className="flex flex-col gap-4">
              {rootObjectives.map((objective, index) => (
                <ObjectiveBlock
                  key={objective.okr_id}
                  index={index}
                  objective={objective}
                  records={selectedRecords}
                  alignmentRecords={periodRecords}
                  selectedPeriod={selectedPeriod}
                  progressNotes={progressNotes}
                  showProgressNotes={adminConfig.settings.allowProgressNotes}
                  detailHref={detailHref}
                  displayOwner={selectedOwner}
                  lang={lang}
                />
              ))}
            </div>
          )}
          {(qualityStats.missingOwnerCount > 0 || (adminConfig.settings.allowProgressNotes && qualityStats.staleCount > 0)) && (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <span className="font-semibold">{lang === "en" ? "Data quality attention" : "数据质量待处理"}</span>
              <span className="ml-2">
                {lang === "en"
                  ? [
                      qualityStats.missingOwnerCount > 0 ? `${qualityStats.missingOwnerCount} KRs missing an owner` : "",
                      adminConfig.settings.allowProgressNotes && qualityStats.staleCount > 0 ? `${qualityStats.staleCount} stale` : ""
                    ].filter(Boolean).join(", ") + "."
                  : [
                      qualityStats.missingOwnerCount > 0 ? `${qualityStats.missingOwnerCount} 个 KR 缺少负责人` : "",
                      adminConfig.settings.allowProgressNotes && qualityStats.staleCount > 0 ? `${qualityStats.staleCount} 个超过 14 天未更新` : ""
                    ].filter(Boolean).join("，") + "。"}
              </span>
            </div>
          )}
          <OkrDetailDrawer
            records={periodRecords}
            progressNotes={progressNotes}
            showProgressNotes={adminConfig.settings.allowProgressNotes}
            selectedPeriod={selectedPeriod}
            selectedDetailId={detail}
            lang={lang}
          />
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
  alignmentRecords,
  selectedPeriod,
  progressNotes,
  showProgressNotes,
  detailHref,
  displayOwner,
  lang
}: {
  index: number;
  objective: OkrRecord;
  records: OkrRecord[];
  alignmentRecords: OkrRecord[];
  selectedPeriod: string;
  progressNotes: ProgressNote[];
  showProgressNotes: boolean;
  detailHref: (okrId: string) => string;
  displayOwner: string;
  lang: Lang;
}) {
  const children = records.filter((record) => record.parent_id === objective.okr_id);
  const progress = objective.score === null ? 0 : Math.round(objective.score * 100);
  const alignmentChain = buildAlignmentChain(objective, alignmentRecords);
  const objectiveProgressNotes = progressNotes.filter((note) =>
    note.team === objective.team &&
    note.periodId === selectedPeriod &&
    note.objectiveId === objective.okr_id
  );

  return (
    <article className="relative rounded-lg border border-border bg-white px-6 py-6 shadow-subtle">
      <div className="grid gap-4 md:grid-cols-[72px_1fr]">
        <div className="relative hidden md:block">
          <div className="absolute left-8 top-8 h-[calc(100%-32px)] w-px bg-slate-200" />
          <div className="relative z-10 grid h-12 w-12 place-items-center rounded-full bg-blue-500 text-lg font-semibold text-white shadow-sm">
            O{index + 1}
          </div>
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>{displayOwner}</span>
            <TypeBadge value={objective.type} />
            <ConfidenceBadge value={objective.confidence} />
            <span>{t(lang, "score")} <Score value={objective.score} /></span>
          </div>
          <OkrDetailLink
            href={detailHref(objective.okr_id)}
            className="mt-2 block text-xl font-semibold leading-8 text-slate-950 hover:text-blue-700"
          >
            {t(lang, "targetPrefix")}{translateText(objective.objective, lang, objective.localized?.objective)}
          </OkrDetailLink>
          {alignmentChain.length > 0 && <AlignmentPill chain={alignmentChain} lang={lang} />}
          <div className="mt-3 flex items-center gap-3">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-blue-500" style={{ width: `${progress}%` }} />
            </div>
            <span className="flex-none text-sm font-bold tabular-nums text-slate-700">{progress}%</span>
          </div>

          <div className="mt-5 flex flex-col gap-2.5">
            {children.filter((record) => record.kr).map((kr) => (
              <KRRow key={kr.okr_id} kr={kr} detailHref={detailHref(kr.okr_id)} lang={lang} />
            ))}
          </div>

          {showProgressNotes && (
            <ProgressNoteCard
              team={objective.team}
              periodId={selectedPeriod}
              objectiveId={objective.okr_id}
              progressNotes={objectiveProgressNotes}
              fallbackNote={objective.risks
                ? translateText(objective.risks, lang, objective.localized?.risks)
                : objective.decisions_needed
                  ? translateText(objective.decisions_needed, lang, objective.localized?.decisionsNeeded)
                  : t(lang, "noHighRisk")}
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

function KRRow({ kr, detailHref, lang }: { kr: OkrRecord; detailHref: string; lang: Lang }) {
  const progress = kr.score === null ? 0 : Math.round(kr.score * 100);
  const tone = kr.confidence === "Green" ? "bg-emerald-400" : kr.confidence === "Red" ? "bg-rose-400" : "bg-blue-400";

  return (
    <OkrDetailLink
      href={detailHref}
      className="block rounded-[9px] border border-[#eceff3] bg-[#fbfcfd] px-[13px] py-[11px] transition hover:border-blue-200 hover:bg-slate-50"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <CircleDot className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
          <span className="text-sm font-semibold leading-6 text-slate-900">{translateText(kr.kr, lang, kr.localized?.kr)}</span>
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
    </OkrDetailLink>
  );
}

function AlignmentPill({ chain, lang }: { chain: OkrRecord[]; lang: Lang }) {
  const primary = chain[0];
  const primaryKind = primary.kr ? "KR" : "O";

  return (
    <span className="group relative mt-2 inline-flex max-w-full flex-wrap items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">
      <Link2 className="h-3.5 w-3.5 shrink-0" />
      <span>{lang === "en" ? "Aligned to" : "对齐"}</span>
      <span>{primary.team}</span>
      <span className="text-blue-300">/</span>
      <span>{primary.owner}</span>
      <span className="rounded bg-white px-1">{primaryKind}</span>
      <span className="max-w-[360px] truncate">{translateText(primary.kr || primary.objective, lang, primary.kr ? primary.localized?.kr : primary.localized?.objective)}</span>
      {chain.slice(1).map((record) => {
        const kind = record.kr ? "KR" : "O";
        return (
          <span key={record.okr_id} className="inline-flex min-w-0 items-center gap-1.5">
            <span className="text-blue-300">→</span>
            <span>{record.team}</span>
            <span className="text-blue-300">/</span>
            <span>{record.owner}</span>
            <span className="rounded bg-white px-1">{kind}</span>
            <span className="max-w-[260px] truncate">{translateText(record.kr || record.objective, lang, record.kr ? record.localized?.kr : record.localized?.objective)}</span>
          </span>
        );
      })}
      <span className="pointer-events-none absolute left-4 top-full z-40 hidden w-[520px] rounded-lg border border-border bg-white p-4 text-left text-slate-700 shadow-xl group-hover:block">
        <span className="block text-xs font-semibold uppercase tracking-wide text-blue-500">
          {lang === "en" ? "Alignment Path" : "对齐路径"}
        </span>
        <span className="mt-3 block space-y-3">
          {chain.map((record, index) => {
            const progress = record.score === null ? null : Math.round(record.score * 100);
            const kind = record.kr ? "KR" : "O";
            const parent = record.kr && record.parent_id ? chain.find((item) => item.okr_id === record.parent_id) : null;
            return (
              <span key={record.okr_id} className="block rounded-md bg-slate-50 px-3 py-2">
                <span className="flex items-center justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-slate-950">
                      {index + 1}. {record.team} / {record.owner}
                    </span>
                    <span className="mt-1 block text-xs text-slate-500">{record.okr_id} · {kind}</span>
                  </span>
                  <ConfidenceBadge value={record.confidence} />
                </span>
                <span className="mt-2 block text-sm font-semibold leading-6 text-slate-900">{translateText(record.kr || record.objective, lang, record.kr ? record.localized?.kr : record.localized?.objective)}</span>
                {parent && (
                  <span className="mt-2 block text-xs leading-5 text-slate-500">
                    {lang === "en" ? "Parent Objective" : "所属 Objective"}：{translateText(parent.objective, lang, parent.localized?.objective)}
                  </span>
                )}
                <span className="mt-2 block text-xs text-slate-500">
                  {lang === "en" ? "Progress" : "进度"}：{progress === null ? "N/A" : `${progress}%`}
                </span>
              </span>
            );
          })}
        </span>
      </span>
    </span>
  );
}

function buildAlignmentChain(objective: OkrRecord, records: OkrRecord[]) {
  const recordById = new Map(records.map((record) => [record.okr_id, record]));
  const chain: OkrRecord[] = [];
  const visited = new Set<string>();
  let currentId = objective.aligned_to_id;

  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    const current = recordById.get(currentId);
    if (!current) break;

    chain.push(current);
    if (!current.kr) {
      currentId = current.aligned_to_id;
      continue;
    }

    const parentObjective = current.parent_id ? recordById.get(current.parent_id) : null;
    currentId = parentObjective?.aligned_to_id ?? "";
  }

  return chain;
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

function normalizeMember(member: string | undefined, team: string, config: AdminConfig) {
  const email = (member ?? "").trim().toLowerCase();
  if (!email) return null;
  return config.users.find((user) =>
    user.enabled &&
    user.email.toLowerCase() === email &&
    user.teams.includes(team)
  ) ?? null;
}

function buildOwnerScopedRecords(teamRecords: OkrRecord[], ownerAliases: string[]) {
  const aliases = ownerAliases.map(normalizeToken);
  const recordsById = new Map(teamRecords.map((record) => [record.okr_id, record]));
  const visibleIds = new Set<string>();

  function addParentChain(record: OkrRecord) {
    let current: OkrRecord | undefined = record;
    while (current) {
      visibleIds.add(current.okr_id);
      current = current.parent_id ? recordsById.get(current.parent_id) : undefined;
    }
  }

  teamRecords.forEach((record) => {
    if (!aliases.includes(normalizeToken(record.owner))) return;
    visibleIds.add(record.okr_id);
    addParentChain(record);
    if (!record.kr) {
      teamRecords
        .filter((candidate) => candidate.parent_id === record.okr_id)
        .forEach((child) => visibleIds.add(child.okr_id));
    }
  });

  return teamRecords.filter((record) => visibleIds.has(record.okr_id));
}

function ownerMatches(owner: string, aliases: string[]) {
  const normalizedOwner = normalizeToken(owner);
  return Boolean(normalizedOwner) && aliases.some((alias) => normalizeToken(alias) === normalizedOwner);
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function normalizePeriodFromConfig(period: string | undefined, config: AdminConfig) {
  return config.periods.some((item) => item.id === period) ? period! : config.defaultPeriodId;
}

function getConfiguredPeriods(config: AdminConfig): Period[] {
  return config.periods.map(({ id, label, labelEn, shortLabel }) => ({ id, label, labelEn, shortLabel }));
}

function buildOverviewHref({
  team,
  period,
  member,
  detail,
  mode
}: {
  team: string;
  period: string;
  member?: string;
  detail?: string;
  mode?: string;
}) {
  const params = new URLSearchParams({
    team,
    period
  });
  if (detail) params.set("detail", detail);
  if (member) params.set("member", member);
  if (mode) params.set("mode", mode);
  return `/?${params.toString()}`;
}

function buildTeamNav(config: AdminConfig): TeamNavItem[] {
  const enabledTeams = config.teams.filter((team) => team.enabled);
  const membersByTeam = new Map<string, ReturnType<typeof membersForTeam>>();
  enabledTeams.forEach((team) => membersByTeam.set(team.name, membersForTeam(config.users, team.name)));

  return enabledTeams
    .filter((team) => !team.parentTeam)
    .map((team) => ({
      name: team.name,
      owner: resolveTeamOwner(config.users, team)?.displayName ?? "",
      color: team.color,
      members: membersByTeam.get(team.name) ?? [],
      children: enabledTeams
        .filter((child) => child.parentTeam === team.name)
        .map((child) => ({
          name: child.name,
          owner: resolveTeamOwner(config.users, child)?.displayName ?? "",
          color: child.color,
          members: membersByTeam.get(child.name) ?? []
        }))
    }));
}

function membersForTeam(users: AdminUser[], team: string) {
  return selectableTeamOwners(users)
    .filter((user) => user.teams.includes(team) && user.role !== "team_leader" && !(user.leaderTeams ?? []).includes(team))
    .map((user) => ({
      email: user.email,
      displayName: user.displayName || user.email,
      role: user.role
    }))
    .sort((left, right) => left.displayName.localeCompare(right.displayName));
}

function normalizeToken(value: string) {
  return value.trim().toLowerCase();
}

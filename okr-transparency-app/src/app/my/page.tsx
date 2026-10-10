import Link from "next/link";
import { AlertTriangle, ArrowRight, BriefcaseBusiness, CalendarClock, CheckCircle2, ClipboardCheck, GitBranch, PenLine, Target } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { LoginPanel } from "@/components/login-panel";
import { ConfidenceBadge } from "@/components/okr-status";
import { Badge } from "@/components/ui/badge";
import { buildActionCenter, type ActionCenterData, type ActionCenterKr, type AlignmentUpdate, type PendingReview } from "@/lib/action-center";
import { buildMyKrEntryTeams } from "@/lib/action-center-entry";
import { getPageAccess } from "@/lib/admin/page-access";
import { getTeamEditPolicy } from "@/lib/admin/permissions";
import { hrefWithLang, normalizeLang, translateText, type Lang } from "@/lib/i18n";
import { readDraft, readPeriodRecords } from "@/lib/okr/drafts";
import { readProgressNotes } from "@/lib/okr/progress-notes";
import { allowsOkrEdits, allowsProgressUpdates, isOpenPeriod, periodsForViewer, periodStageLabel, sortNewestFirst } from "@/lib/period-stages";
import { okrDetailHref, type Period } from "@/lib/periods";

/** One open period's slice of the action center. */
type PeriodSection = {
  period: Period;
  data: ActionCenterData;
  priorityKrs: ActionCenterKr[];
  updateDueIds: Set<string>;
  attentionIds: Set<string>;
  /** The period takes OKRs and nothing of this person's is in it yet. */
  needsOkrs: boolean;
};

export default async function MyActionsPage({
  searchParams
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const [query, pageAccess] = await Promise.all([searchParams, getPageAccess()]);
  const lang = normalizeLang(query.lang ?? pageAccess.adminConfig.settings.defaultLanguage);
  if (!pageAccess.access) {
    return (
      <AppShell active="myActions" hideNavigation>
        <LoginPanel variant={pageAccess.sessionUser ? "denied" : "login"} email={pageAccess.sessionUser?.email} />
      </AppShell>
    );
  }

  const { adminConfig, access } = pageAccess;
  const viewerPeriods = periodsForViewer(adminConfig, access.role);
  // While one quarter closes and the next is drafted, both have work in them.
  const openPeriods = sortNewestFirst(viewerPeriods.filter((period) => isOpenPeriod(period.status)));
  const periods = openPeriods.length > 0 ? openPeriods : viewerPeriods.filter((period) => period.id === adminConfig.defaultPeriodId);
  const reviewTeams = adminConfig.teams.filter((team) =>
    team.enabled && getTeamEditPolicy(adminConfig, team.name, access).canPublish
  );
  const canEnterKrs = buildMyKrEntryTeams(adminConfig, access).length > 0;
  const progressNotes = adminConfig.settings.allowProgressNotes ? await readProgressNotes() : [];
  const sections: PeriodSection[] = await Promise.all(periods.map(async (period) => {
    const okrOpen = allowsOkrEdits(period.status);
    const [records, drafts] = await Promise.all([
      readPeriodRecords(period.id),
      okrOpen ? Promise.all(reviewTeams.map((team) => readDraft(team.name, period.id))) : Promise.resolve([])
    ]);
    const data = buildActionCenter({
      config: adminConfig,
      access,
      periodId: period.id,
      records: records ?? [],
      progressNotes,
      drafts,
      okrOpen,
      progressOpen: allowsProgressUpdates(period.status)
    });
    const attentionIds = new Set(data.attentionKrs.map((item) => item.record.okr_id));
    const updateDueIds = new Set(data.updateDueKrs.map((item) => item.record.okr_id));
    return {
      period,
      data,
      attentionIds,
      updateDueIds,
      priorityKrs: data.ownedKrs.filter((item) => updateDueIds.has(item.record.okr_id) || attentionIds.has(item.record.okr_id)),
      needsOkrs: okrOpen && canEnterKrs && data.ownedKrs.length === 0
    };
  }));

  const copy = copies[lang];
  const total = (count: (section: PeriodSection) => number) => sections.reduce((sum, section) => sum + count(section), 0);
  const actionCount = total((section) => section.priorityKrs.length + section.data.pendingReviews.length + (section.needsOkrs ? 1 : 0));
  const updateDueCount = total((section) => section.data.updateDueKrs.length);
  const attentionCount = total((section) => section.data.attentionKrs.length);
  const reviewCount = total((section) => section.data.pendingReviews.length);
  const fillCount = total((section) => section.needsOkrs ? 1 : 0);
  const alignmentUpdates = sections.flatMap((section) => section.data.alignmentUpdates.map((item) => ({ item, period: section.period })));
  const hasMappedKrs = sections.some((section) => section.data.ownedKrs.length > 0);
  const multiplePeriods = sections.length > 1;

  return (
    <AppShell active="myActions">
      <section className="overflow-hidden rounded-xl border border-blue-100 bg-gradient-to-br from-white via-white to-blue-50 shadow-subtle">
        <div className="px-5 py-5 md:px-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm font-medium text-blue-700">
              <BriefcaseBusiness className="h-4 w-4" />
              {copy.eyebrow}
            </div>
            <h1 className="mt-2 text-2xl font-semibold text-slate-950">{copy.title}</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{copy.subtitle}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {sections.map(({ period }) => <Badge key={period.id} tone="blue">{periodBadge(period, multiplePeriods, lang)}</Badge>)}
          </div>
        </div>

        <div className="mt-5 flex flex-col gap-4 rounded-lg border border-slate-200/80 bg-white/90 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <div className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full ${actionCount > 0 ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}>
              {actionCount > 0 ? <CalendarClock className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
            </div>
            <div>
              <div className="font-semibold text-slate-950">
                {actionCount > 0 ? copy.actionHeadline(actionCount) : copy.clearHeadline}
              </div>
              <p className="mt-1 text-sm leading-5 text-muted-foreground">
                {actionCount > 0
                  ? copy.actionSummary(updateDueCount, attentionCount, reviewCount, fillCount)
                  : hasMappedKrs ? copy.clearSummary : copy.noOwnedSummary}
              </p>
            </div>
          </div>
          {actionCount > 0 && (
            <a href="#todo" className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-md bg-slate-950 px-4 text-sm font-medium text-white hover:bg-slate-800">
              {copy.viewTodo}<ArrowRight className="h-4 w-4" />
            </a>
          )}
        </div>
        </div>
      </section>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryTile icon={CalendarClock} label={copy.stale} value={updateDueCount} tone={updateDueCount > 0 ? "amber" : "slate"} />
        <SummaryTile icon={AlertTriangle} label={copy.attention} value={attentionCount} tone={attentionCount > 0 ? "rose" : "slate"} />
        <SummaryTile icon={GitBranch} label={copy.alignedWithMe} value={alignmentUpdates.length} />
        <SummaryTile icon={ClipboardCheck} label={copy.review} value={reviewCount} tone={reviewCount > 0 ? "blue" : "slate"} />
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.7fr)]">
        <section id="todo" className="scroll-mt-24 rounded-lg border border-border bg-white shadow-subtle">
          <SectionHeader title={copy.todo} description={copy.todoDescription} count={actionCount} />
          {actionCount === 0 ? <EmptyState text={copy.noTodo} /> : (
            <div className="divide-y divide-border">
              {sections.map((section) => {
                const itemCount = section.priorityKrs.length + section.data.pendingReviews.length + (section.needsOkrs ? 1 : 0);
                if (itemCount === 0) return null;
                return (
                  <div key={section.period.id} className="divide-y divide-border">
                    {multiplePeriods && <PeriodGroupHeader period={section.period} lang={lang} />}
                    {section.needsOkrs && <FillOkrsRow period={section.period} lang={lang} />}
                    {section.priorityKrs.map((item) => (
                      <KrActionRow
                        key={item.record.okr_id}
                        item={item}
                        accessEmail={access.email}
                        period={section.period}
                        lang={lang}
                        emphasizeUpdate={section.updateDueIds.has(item.record.okr_id)}
                        showUpdateDue={section.updateDueIds.has(item.record.okr_id)}
                        showContext={section.attentionIds.has(item.record.okr_id)}
                      />
                    ))}
                    {section.data.pendingReviews.map((review) => (
                      <ReviewActionRow key={review.team} review={review} periodId={section.period.id} lang={lang} />
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="rounded-lg border border-border bg-white shadow-subtle">
          <SectionHeader title={copy.alignmentUpdates} description={copy.alignmentDescription} count={alignmentUpdates.length} />
          {alignmentUpdates.length === 0 ? <EmptyState text={copy.noAlignment} /> : (
            <div className="divide-y divide-border">
              {alignmentUpdates.map(({ item, period }) => (
                <AlignmentRow key={`${period.id}:${item.source.okr_id}`} item={item} period={period} showPeriod={multiplePeriods} lang={lang} />
              ))}
            </div>
          )}
        </section>
      </div>

      <section className="mt-5 rounded-lg border border-border bg-white shadow-subtle">
        <SectionHeader title={copy.myKrs} description={copy.myKrsDescription} count={total((section) => section.data.ownedKrs.length)} />
        {!hasMappedKrs ? <EmptyState text={copy.noOwnedKrs} /> : (
          <div className="divide-y divide-border">
            {sections.filter((section) => section.data.ownedKrs.length > 0).map((section) => (
              <div key={section.period.id} className="divide-y divide-border">
                {multiplePeriods && <PeriodGroupHeader period={section.period} lang={lang} />}
                {section.data.ownedKrs.map((item) => (
                  <KrActionRow key={item.record.okr_id} item={item} accessEmail={access.email} period={section.period} lang={lang} showUpdateDue={section.updateDueIds.has(item.record.okr_id)} />
                ))}
              </div>
            ))}
          </div>
        )}
      </section>
    </AppShell>
  );
}

function periodBadge(period: Period, withStage: boolean, lang: Lang) {
  return withStage ? `${period.shortLabel} · ${periodStageLabel(period.status, lang)}` : period.shortLabel;
}

function PeriodGroupHeader({ period, lang }: { period: Period; lang: Lang }) {
  const copy = copies[lang];
  const hint = period.status === "setting" ? copy.settingHint : period.status === "closing" ? copy.closingHint : "";
  return (
    <div className="flex flex-wrap items-center gap-2 bg-slate-50 px-5 py-2 text-xs">
      <span className="font-semibold text-slate-700">{periodBadge(period, true, lang)}</span>
      {hint && <span className="text-slate-500">{hint}</span>}
    </div>
  );
}

function FillOkrsRow({ period, lang }: { period: Period; lang: Lang }) {
  const copy = copies[lang];
  return (
    <div className="flex items-center justify-between gap-4 px-5 py-4">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <Badge tone="yellow">{copy.fillBadge}</Badge>
          <div className="truncate text-sm font-semibold text-slate-950">{copy.fillTitle(period.shortLabel)}</div>
        </div>
        <div className="mt-1.5 text-xs text-muted-foreground">{copy.fillDescription}</div>
      </div>
      <Link
        href={hrefWithLang(`/my/setup?period=${encodeURIComponent(period.id)}`, lang)}
        className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md bg-slate-950 px-3 text-sm font-medium text-white hover:bg-slate-800"
      >
        <PenLine className="h-4 w-4" />{copy.fillAction}
      </Link>
    </div>
  );
}

function SummaryTile({ icon: Icon, label, value, tone = "blue" }: { icon: typeof Target; label: string; value: number; tone?: "blue" | "amber" | "rose" | "slate" }) {
  const toneClass = {
    blue: "bg-blue-50 text-blue-700",
    amber: "bg-amber-50 text-amber-700",
    rose: "bg-rose-50 text-rose-700",
    slate: "bg-slate-100 text-slate-600"
  }[tone];
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-white px-4 py-4 shadow-subtle">
      <div className={`grid h-10 w-10 place-items-center rounded-md ${toneClass}`}><Icon className="h-5 w-5" /></div>
      <div><div className="text-2xl font-semibold text-slate-950">{value}</div><div className="text-xs text-muted-foreground">{label}</div></div>
    </div>
  );
}

function SectionHeader({ title, description, count }: { title: string; description: string; count: number }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
      <div><h2 className="font-semibold text-slate-950">{title}</h2><p className="mt-1 text-sm text-muted-foreground">{description}</p></div>
      <Badge>{count}</Badge>
    </div>
  );
}

function ReviewActionRow({ review, periodId, lang }: { review: PendingReview; periodId: string; lang: Lang }) {
  const copy = copies[lang];
  return (
    <div className="flex items-center justify-between gap-4 px-5 py-4">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <Badge tone="blue">{copy.reviewBadge}</Badge>
          <div className="truncate text-sm font-semibold text-slate-950">{review.team}</div>
        </div>
        <div className="mt-1.5 text-xs text-muted-foreground">
          {copy.draftObjectives(review.draftObjectiveCount)} · {formatDate(review.updatedAt, lang)}
        </div>
      </div>
      <Link
        href={teamEditHref(review.team, periodId, lang)}
        className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md border border-border px-3 text-sm font-medium text-slate-700 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
      >
        {copy.reviewAction}<ArrowRight className="h-4 w-4" />
      </Link>
    </div>
  );
}

function AlignmentRow({ item, period, showPeriod, lang }: { item: AlignmentUpdate; period: Period; showPeriod: boolean; lang: Lang }) {
  const copy = copies[lang];
  const sourceTitle = translateText(item.source.objective, lang, item.source.localized?.objective);
  const targetTitle = item.target.kr
    ? translateText(item.target.kr, lang, item.target.localized?.kr)
    : translateText(item.target.objective, lang, item.target.localized?.objective);
  return (
    <article className="px-5 py-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="blue">{item.source.team}</Badge>
          {showPeriod && <Badge tone="gray">{period.shortLabel}</Badge>}
        </div>
        <span className="shrink-0 text-xs text-muted-foreground">{item.lastActivityAt ? formatDate(item.lastActivityAt, lang) : ""}</span>
      </div>
      <p className="mt-2 text-sm font-semibold leading-6 text-slate-950">{sourceTitle}</p>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">{copy.alignedTo(targetTitle)}</p>
      <Link
        href={alignmentHref(item.source.team, period.id, lang)}
        className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:text-blue-900"
      >
        {copy.viewAlignment}<ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </article>
  );
}

function KrActionRow({ item, accessEmail, period, lang, emphasizeUpdate = false, showContext = false, showUpdateDue = false }: {
  item: ActionCenterKr;
  accessEmail: string;
  period: Period;
  lang: Lang;
  emphasizeUpdate?: boolean;
  showContext?: boolean;
  showUpdateDue?: boolean;
}) {
  const copy = copies[lang];
  const record = item.record;
  const action = krAction(record.team, record.okr_id, period, accessEmail, lang);
  return (
    <article className="px-5 py-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="gray">{record.team}</Badge>
        <ConfidenceBadge value={record.confidence} />
        {showUpdateDue && <Badge tone="yellow">{copy.overdue}</Badge>}
      </div>
      <Link href={okrDetailHref(record.okr_id, period.id, lang)} className="mt-2 block text-sm font-semibold leading-6 text-slate-950 hover:text-blue-700">
        {translateText(record.kr, lang, record.localized?.kr)}
      </Link>
      <div className="mt-1 text-xs text-muted-foreground">
        {copy.lastActivity}: {item.lastActivityAt ? formatDate(item.lastActivityAt, lang) : copy.neverUpdated}
        {record.score !== null ? ` · ${Math.round(record.score * 100)}%` : ""}
      </div>
      {showContext && (record.risks || record.decisions_needed) && (
        <div className="mt-3 space-y-1 rounded-md bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-700">
          {record.risks && <div><span className="font-semibold">{copy.riskLabel}：</span>{translateText(record.risks, lang, record.localized?.risks)}</div>}
          {record.decisions_needed && <div><span className="font-semibold">{copy.decisionLabel}：</span>{translateText(record.decisions_needed, lang, record.localized?.decisionsNeeded)}</div>}
        </div>
      )}
      {action && (
        <div className="mt-3 flex items-center gap-3">
          <Link
            href={action.href}
            className={emphasizeUpdate
              ? "inline-flex h-8 items-center gap-1 rounded-md bg-blue-600 px-3 text-xs font-medium text-white hover:bg-blue-700"
              : "inline-flex h-8 items-center gap-1 rounded-md border border-border px-3 text-xs font-medium text-slate-700 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"}
          >
            {action.label}<ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      )}
    </article>
  );
}

/**
 * Where a KR's button leads depends on what its period takes: the editor while
 * OKRs can change, the KR's own check-in once they are frozen.
 */
function krAction(team: string, okrId: string, period: Period, email: string, lang: Lang) {
  const copy = copies[lang];
  if (period.status === "active") return { href: memberEditHref(team, period.id, email, lang), label: copy.updateAction };
  if (period.status === "setting") return { href: memberEditHref(team, period.id, email, lang), label: copy.editAction };
  if (period.status === "closing") {
    const params = new URLSearchParams({ team, period: period.id, member: email, detail: okrId });
    return { href: hrefWithLang(`/?${params.toString()}`, lang), label: copy.updateAction };
  }
  return null;
}

function EmptyState({ text }: { text: string }) {
  return <div className="px-5 py-10 text-center text-sm text-muted-foreground">{text}</div>;
}

function memberEditHref(team: string, periodId: string, email: string, lang: Lang) {
  return hrefWithLang(`/?team=${encodeURIComponent(team)}&period=${encodeURIComponent(periodId)}&member=${encodeURIComponent(email)}&mode=edit`, lang);
}

function teamEditHref(team: string, periodId: string, lang: Lang) {
  return hrefWithLang(`/?team=${encodeURIComponent(team)}&period=${encodeURIComponent(periodId)}&mode=edit`, lang);
}

function alignmentHref(team: string, periodId: string, lang: Lang) {
  return hrefWithLang(`/map?team=${encodeURIComponent(team)}&period=${encodeURIComponent(periodId)}`, lang);
}

function formatDate(value: string, lang: Lang) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(lang === "en" ? "en-US" : "zh-CN", { month: "short", day: "numeric" }).format(date);
}

const copies = {
  zh: {
    eyebrow: "个人行动视图",
    title: "我的行动中心",
    subtitle: "先处理开放周期里该更新、该填写和该审核的事项，再了解哪些团队正在与你对齐。",
    actionHeadline: (count: number) => `有 ${count} 项需要你处理`,
    actionSummary: (stale: number, attention: number, reviews: number, toFill: number) =>
      [toFill > 0 ? `${toFill} 个周期待填写 KR` : "", `${stale} 个 KR 待更新`, `${attention} 个风险或决策`, `${reviews} 个草稿待审核`].filter(Boolean).join(" · "),
    clearHeadline: "暂时没有待办",
    clearSummary: "你的更新、风险决策和审核事项都已处理。",
    noOwnedSummary: "暂未匹配到你负责的 KR；仍会展示你权限范围内的审核事项。",
    viewTodo: "查看待办",
    myKrs: "我的 KR",
    myKrsDescription: "开放周期中由你负责的关键结果，作为快速参考保留在这里。",
    stale: "待更新",
    attention: "风险与决策",
    alignedWithMe: "与我对齐",
    review: "待审核",
    todo: "优先待办",
    todoDescription: "按周期合并更新、填写、风险决策和审核，同一个 KR 不会重复出现。",
    noTodo: "当前没有需要你处理的事项。",
    alignmentUpdates: "对齐动态",
    alignmentDescription: "其他团队当前对齐到你负责或所在团队目标的 Objective。",
    noAlignment: "当前没有其他团队对齐到你的目标。",
    alignedTo: (target: string) => `对齐到你的「${target}」`,
    viewAlignment: "查看对齐关系",
    noOwnedKrs: "开放周期中没有匹配到你负责的 KR。",
    overdue: "超过 7 天",
    lastActivity: "最近活动",
    neverUpdated: "尚未更新",
    riskLabel: "风险",
    decisionLabel: "待决策",
    updateAction: "更新进展",
    editAction: "编辑 KR",
    reviewBadge: "待审核",
    reviewAction: "查看草稿",
    draftObjectives: (count: number) => `${count} 个草稿 Objective`,
    settingHint: "填写并发布 OKR，启动后才开始更新进展",
    closingHint: "补齐进展和打分，OKR 内容已冻结",
    fillBadge: "待填写",
    fillTitle: (period: string) => `填写 ${period} 的 KR`,
    fillDescription: "这个周期里还没有你负责的 KR。",
    fillAction: "去填写"
  },
  en: {
    eyebrow: "Personal action view",
    title: "My Action Center",
    subtitle: "Handle updates, OKRs to write, decisions, and reviews in open periods first, then see which teams are aligned with your goals.",
    actionHeadline: (count: number) => `${count} item${count === 1 ? "" : "s"} need your attention`,
    actionSummary: (stale: number, attention: number, reviews: number, toFill: number) =>
      [toFill > 0 ? `${toFill} period${toFill === 1 ? "" : "s"} need your KRs` : "", `${stale} KRs need updates`, `${attention} risks or decisions`, `${reviews} draft reviews`].filter(Boolean).join(" · "),
    clearHeadline: "Nothing needs your attention",
    clearSummary: "Your updates, risks, decisions, and reviews are clear for now.",
    noOwnedSummary: "No owned KRs were matched; reviews inside your permission scope are still shown.",
    viewTodo: "View to-do",
    myKrs: "My KRs",
    myKrsDescription: "Key results you own in open periods, kept here as a quick reference.",
    stale: "Update due",
    attention: "Risks & decisions",
    alignedWithMe: "Aligned with me",
    review: "Review queue",
    todo: "Priority to-do",
    todoDescription: "Updates, OKRs to write, risks, decisions, and reviews grouped by period, without duplicate KRs.",
    noTodo: "Nothing currently needs your attention.",
    alignmentUpdates: "Alignment updates",
    alignmentDescription: "Objectives from other teams currently aligned to goals you own or your team owns.",
    noAlignment: "No other teams are currently aligned to your goals.",
    alignedTo: (target: string) => `Aligned to your “${target}”`,
    viewAlignment: "View alignment",
    noOwnedKrs: "No owned KRs were found in open periods.",
    overdue: "Over 7 days",
    lastActivity: "Last activity",
    neverUpdated: "Never updated",
    riskLabel: "Risk",
    decisionLabel: "Decision",
    updateAction: "Update progress",
    editAction: "Edit KRs",
    reviewBadge: "Review",
    reviewAction: "Review draft",
    draftObjectives: (count: number) => `${count} draft Objective${count === 1 ? "" : "s"}`,
    settingHint: "Write and publish OKRs; check-ins open once the period starts",
    closingHint: "Finish check-ins and scores; OKRs are frozen",
    fillBadge: "To write",
    fillTitle: (period: string) => `Add your ${period} KRs`,
    fillDescription: "You do not own any KRs in this period yet.",
    fillAction: "Add KRs"
  }
} as const;

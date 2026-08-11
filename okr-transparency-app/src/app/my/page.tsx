import Link from "next/link";
import { AlertTriangle, ArrowRight, BriefcaseBusiness, CalendarClock, CheckCircle2, ClipboardCheck, GitBranch, Target } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { LoginPanel } from "@/components/login-panel";
import { ConfidenceBadge } from "@/components/okr-status";
import { Badge } from "@/components/ui/badge";
import { buildActionCenter, type ActionCenterKr, type AlignmentUpdate, type PendingReview } from "@/lib/action-center";
import { getPageAccess } from "@/lib/admin/page-access";
import { getTeamEditPolicy } from "@/lib/admin/permissions";
import { hrefWithLang, normalizeLang, translateText, type Lang } from "@/lib/i18n";
import { readDraft, readPeriodRecords } from "@/lib/okr/drafts";
import { readProgressNotes } from "@/lib/okr/progress-notes";
import { readOkrSnapshot } from "@/lib/okr/store";

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
  const periodId = adminConfig.defaultPeriodId;
  const reviewTeams = adminConfig.teams.filter((team) =>
    team.enabled && getTeamEditPolicy(adminConfig, team.name, access).canPublish
  );
  const [storedPeriodRecords, snapshot, progressNotes, drafts] = await Promise.all([
    readPeriodRecords(periodId),
    readOkrSnapshot(),
    adminConfig.settings.allowProgressNotes ? readProgressNotes() : Promise.resolve([]),
    Promise.all(reviewTeams.map((team) => readDraft(team.name, periodId)))
  ]);
  const data = buildActionCenter({
    config: adminConfig,
    access,
    periodId,
    records: storedPeriodRecords ?? snapshot.records,
    progressNotes,
    drafts
  });
  const copy = copies[lang];
  const periodLabel = adminConfig.periods.find((period) => period.id === periodId)?.shortLabel ?? periodId;
  const attentionIds = new Set(data.attentionKrs.map((item) => item.record.okr_id));
  const updateDueIds = new Set(data.updateDueKrs.map((item) => item.record.okr_id));
  const priorityKrs = data.ownedKrs.filter((item) => updateDueIds.has(item.record.okr_id) || attentionIds.has(item.record.okr_id));
  const actionCount = priorityKrs.length + data.pendingReviews.length;
  const hasMappedKrs = data.ownedKrs.length > 0;

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
          <Badge tone="blue">{periodLabel}</Badge>
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
                  ? copy.actionSummary(data.updateDueKrs.length, data.attentionKrs.length, data.pendingReviews.length)
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
        <SummaryTile icon={CalendarClock} label={copy.stale} value={data.updateDueKrs.length} tone={data.updateDueKrs.length > 0 ? "amber" : "slate"} />
        <SummaryTile icon={AlertTriangle} label={copy.attention} value={data.attentionKrs.length} tone={data.attentionKrs.length > 0 ? "rose" : "slate"} />
        <SummaryTile icon={GitBranch} label={copy.alignedWithMe} value={data.alignmentUpdates.length} />
        <SummaryTile icon={ClipboardCheck} label={copy.review} value={data.pendingReviews.length} tone={data.pendingReviews.length > 0 ? "blue" : "slate"} />
      </div>

      {!hasMappedKrs && (
        <div className="mt-5 flex flex-col gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
            <div><span className="font-semibold">{copy.mappingTitle}</span><span className="ml-1">{copy.mappingDescription}</span></div>
          </div>
          <Link
            href={hrefWithLang("/my/setup", lang)}
            className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-md bg-amber-950 px-3 text-sm font-medium text-white hover:bg-amber-900"
          >
            {copy.mappingAction}<ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      )}

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.7fr)]">
        <section id="todo" className="scroll-mt-24 rounded-lg border border-border bg-white shadow-subtle">
          <SectionHeader title={copy.todo} description={copy.todoDescription} count={actionCount} />
          {actionCount === 0 ? <EmptyState text={copy.noTodo} /> : (
            <div className="divide-y divide-border">
              {priorityKrs.map((item) => (
                <KrActionRow
                  key={item.record.okr_id}
                  item={item}
                  accessEmail={access.email}
                  periodId={periodId}
                  lang={lang}
                  emphasizeUpdate={updateDueIds.has(item.record.okr_id)}
                  showUpdateDue={updateDueIds.has(item.record.okr_id)}
                  showContext={attentionIds.has(item.record.okr_id)}
                />
              ))}
              {data.pendingReviews.map((review) => (
                <ReviewActionRow key={review.team} review={review} periodId={periodId} lang={lang} />
              ))}
            </div>
          )}
        </section>

        <section className="rounded-lg border border-border bg-white shadow-subtle">
          <SectionHeader title={copy.alignmentUpdates} description={copy.alignmentDescription} count={data.alignmentUpdates.length} />
          {data.alignmentUpdates.length === 0 ? <EmptyState text={copy.noAlignment} /> : (
            <div className="divide-y divide-border">
              {data.alignmentUpdates.map((item) => <AlignmentRow key={item.source.okr_id} item={item} lang={lang} />)}
            </div>
          )}
        </section>
      </div>

      <div className="mt-5">
        <ActionSection title={copy.myKrs} description={copy.myKrsDescription} empty={copy.noOwnedKrs} items={data.ownedKrs}>
          {(item) => <KrActionRow key={item.record.okr_id} item={item} accessEmail={access.email} periodId={periodId} lang={lang} showUpdateDue={updateDueIds.has(item.record.okr_id)} />}
        </ActionSection>
      </div>
    </AppShell>
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

function ActionSection({ title, description, empty, items, children }: {
  title: string;
  description: string;
  empty: string;
  items: ActionCenterKr[];
  children: (item: ActionCenterKr) => React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border bg-white shadow-subtle">
      <SectionHeader title={title} description={description} count={items.length} />
      {items.length === 0 ? <EmptyState text={empty} /> : <div className="divide-y divide-border">{items.map(children)}</div>}
    </section>
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

function AlignmentRow({ item, lang }: { item: AlignmentUpdate; lang: Lang }) {
  const copy = copies[lang];
  const sourceTitle = translateText(item.source.objective, lang, item.source.localized?.objective);
  const targetTitle = item.target.kr
    ? translateText(item.target.kr, lang, item.target.localized?.kr)
    : translateText(item.target.objective, lang, item.target.localized?.objective);
  return (
    <article className="px-5 py-4">
      <div className="flex items-center justify-between gap-3">
        <Badge tone="blue">{item.source.team}</Badge>
        <span className="shrink-0 text-xs text-muted-foreground">{item.lastActivityAt ? formatDate(item.lastActivityAt, lang) : ""}</span>
      </div>
      <p className="mt-2 text-sm font-semibold leading-6 text-slate-950">{sourceTitle}</p>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">{copy.alignedTo(targetTitle)}</p>
      <Link
        href={alignmentHref(item.source.team, lang)}
        className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:text-blue-900"
      >
        {copy.viewAlignment}<ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </article>
  );
}

function KrActionRow({ item, accessEmail, periodId, lang, emphasizeUpdate = false, showContext = false, showUpdateDue = false }: {
  item: ActionCenterKr;
  accessEmail: string;
  periodId: string;
  lang: Lang;
  emphasizeUpdate?: boolean;
  showContext?: boolean;
  showUpdateDue?: boolean;
}) {
  const copy = copies[lang];
  const record = item.record;
  return (
    <article className="px-5 py-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="gray">{record.team}</Badge>
        <ConfidenceBadge value={record.confidence} />
        {showUpdateDue && <Badge tone="yellow">{copy.overdue}</Badge>}
      </div>
      <Link href={hrefWithLang(`/okr/${encodeURIComponent(record.okr_id)}`, lang)} className="mt-2 block text-sm font-semibold leading-6 text-slate-950 hover:text-blue-700">
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
      <div className="mt-3 flex items-center gap-3">
        <Link
          href={memberEditHref(record.team, periodId, accessEmail, lang)}
          className={emphasizeUpdate
            ? "inline-flex h-8 items-center gap-1 rounded-md bg-blue-600 px-3 text-xs font-medium text-white hover:bg-blue-700"
            : "inline-flex h-8 items-center gap-1 rounded-md border border-border px-3 text-xs font-medium text-slate-700 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"}
        >
          {copy.updateAction}<ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </article>
  );
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

function alignmentHref(team: string, lang: Lang) {
  return hrefWithLang(`/map?team=${encodeURIComponent(team)}`, lang);
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
    subtitle: "先处理本周期该更新、该确认和该审核的事项，再了解哪些团队正在与你对齐。",
    actionHeadline: (count: number) => `本周期有 ${count} 项需要你处理`,
    actionSummary: (stale: number, attention: number, reviews: number) => `${stale} 个 KR 待更新 · ${attention} 个风险或决策 · ${reviews} 个草稿待审核`,
    clearHeadline: "本周期暂时没有待办",
    clearSummary: "你的更新、风险决策和审核事项都已处理。",
    noOwnedSummary: "暂未匹配到你负责的 KR；仍会展示你权限范围内的审核事项。",
    viewTodo: "查看待办",
    myKrs: "我的 KR",
    myKrsDescription: "当前周期由你负责的关键结果，作为快速参考保留在这里。",
    stale: "待更新",
    attention: "风险与决策",
    alignedWithMe: "与我对齐",
    review: "待审核",
    todo: "优先待办",
    todoDescription: "合并更新、风险决策和审核，避免同一个 KR 在多个区域重复出现。",
    noTodo: "当前没有需要你处理的事项。",
    alignmentUpdates: "对齐动态",
    alignmentDescription: "其他团队当前对齐到你负责或所在团队目标的 Objective。",
    noAlignment: "当前没有其他团队对齐到你的目标。",
    alignedTo: (target: string) => `对齐到你的「${target}」`,
    viewAlignment: "查看对齐关系",
    mappingTitle: "未识别到你的 KR。",
    mappingDescription: "你可以前往填写入口，选择有权限的团队建立本人 KR。",
    mappingAction: "去填写 KR",
    noOwnedKrs: "当前周期没有匹配到你负责的 KR。",
    overdue: "超过 7 天",
    lastActivity: "最近活动",
    neverUpdated: "尚未更新",
    riskLabel: "风险",
    decisionLabel: "待决策",
    updateAction: "更新进展",
    reviewBadge: "待审核",
    reviewAction: "查看草稿",
    draftObjectives: (count: number) => `${count} 个草稿 Objective`
  },
  en: {
    eyebrow: "Personal action view",
    title: "My Action Center",
    subtitle: "Handle updates, decisions, and reviews first, then see which teams are aligned with your goals.",
    actionHeadline: (count: number) => `${count} item${count === 1 ? "" : "s"} need your attention`,
    actionSummary: (stale: number, attention: number, reviews: number) => `${stale} KRs need updates · ${attention} risks or decisions · ${reviews} draft reviews`,
    clearHeadline: "Nothing needs your attention",
    clearSummary: "Your updates, risks, decisions, and reviews are clear for now.",
    noOwnedSummary: "No owned KRs were matched; reviews inside your permission scope are still shown.",
    viewTodo: "View to-do",
    myKrs: "My KRs",
    myKrsDescription: "Key results you own in the active period, kept here as a quick reference.",
    stale: "Update due",
    attention: "Risks & decisions",
    alignedWithMe: "Aligned with me",
    review: "Review queue",
    todo: "Priority to-do",
    todoDescription: "Updates, risks, decisions, and reviews in one queue without duplicate KRs.",
    noTodo: "Nothing currently needs your attention.",
    alignmentUpdates: "Alignment updates",
    alignmentDescription: "Objectives from other teams currently aligned to goals you own or your team owns.",
    noAlignment: "No other teams are currently aligned to your goals.",
    alignedTo: (target: string) => `Aligned to your “${target}”`,
    viewAlignment: "View alignment",
    mappingTitle: "No owned KRs were identified.",
    mappingDescription: "Open the KR entry page and choose a team you can edit to add your KRs.",
    mappingAction: "Add KRs",
    noOwnedKrs: "No owned KRs were found in the active period.",
    overdue: "Over 7 days",
    lastActivity: "Last activity",
    neverUpdated: "Never updated",
    riskLabel: "Risk",
    decisionLabel: "Decision",
    updateAction: "Update progress",
    reviewBadge: "Review",
    reviewAction: "Review draft",
    draftObjectives: (count: number) => `${count} draft Objective${count === 1 ? "" : "s"}`
  }
} as const;

import Link from "next/link";
import { AlertTriangle, ArrowRight, BriefcaseBusiness, CalendarClock, ClipboardCheck, Target } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { LoginPanel } from "@/components/login-panel";
import { ConfidenceBadge } from "@/components/okr-status";
import { Badge } from "@/components/ui/badge";
import { buildActionCenter, type ActionCenterKr } from "@/lib/action-center";
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
    readProgressNotes(),
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

  return (
    <AppShell active="myActions">
      <section className="rounded-lg border border-border bg-white px-5 py-5 shadow-subtle">
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
      </section>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryTile icon={Target} label={copy.myKrs} value={data.ownedKrs.length} />
        <SummaryTile icon={CalendarClock} label={copy.stale} value={data.staleKrs.length} tone={data.staleKrs.length > 0 ? "amber" : "slate"} />
        <SummaryTile icon={AlertTriangle} label={copy.attention} value={data.attentionKrs.length} tone={data.attentionKrs.length > 0 ? "rose" : "slate"} />
        <SummaryTile icon={ClipboardCheck} label={copy.review} value={data.pendingReviews.length} />
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <ActionSection title={copy.myKrs} description={copy.myKrsDescription} empty={copy.noOwnedKrs} items={data.ownedKrs}>
          {(item) => <KrActionRow key={item.record.okr_id} item={item} accessEmail={access.email} periodId={periodId} lang={lang} />}
        </ActionSection>

        <ActionSection title={copy.stale} description={copy.staleDescription} empty={copy.noStale} items={data.staleKrs}>
          {(item) => <KrActionRow key={item.record.okr_id} item={item} accessEmail={access.email} periodId={periodId} lang={lang} emphasizeUpdate />}
        </ActionSection>

        <ActionSection title={copy.attention} description={copy.attentionDescription} empty={copy.noAttention} items={data.attentionKrs}>
          {(item) => <KrActionRow key={item.record.okr_id} item={item} accessEmail={access.email} periodId={periodId} lang={lang} showContext />}
        </ActionSection>

        <section className="rounded-lg border border-border bg-white shadow-subtle">
          <SectionHeader title={copy.review} description={copy.reviewDescription} count={data.pendingReviews.length} />
          {data.pendingReviews.length === 0 ? (
            <EmptyState text={copy.noReview} />
          ) : (
            <div className="divide-y divide-border">
              {data.pendingReviews.map((review) => (
                <div key={review.team} className="flex items-center justify-between gap-4 px-5 py-4">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-slate-950">{review.team}</div>
                    <div className="mt-1 text-xs text-muted-foreground">
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
              ))}
            </div>
          )}
        </section>
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

function KrActionRow({ item, accessEmail, periodId, lang, emphasizeUpdate = false, showContext = false }: {
  item: ActionCenterKr;
  accessEmail: string;
  periodId: string;
  lang: Lang;
  emphasizeUpdate?: boolean;
  showContext?: boolean;
}) {
  const copy = copies[lang];
  const record = item.record;
  return (
    <article className="px-5 py-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="gray">{record.team}</Badge>
        <ConfidenceBadge value={record.confidence} />
        {item.isStale && <Badge tone="yellow">{copy.overdue}</Badge>}
      </div>
      <Link href={hrefWithLang(`/okr/${encodeURIComponent(record.okr_id)}`, lang)} className="mt-2 block text-sm font-semibold leading-6 text-slate-950 hover:text-blue-700">
        {translateText(record.kr, lang)}
      </Link>
      <div className="mt-1 text-xs text-muted-foreground">
        {copy.lastActivity}: {item.lastActivityAt ? formatDate(item.lastActivityAt, lang) : copy.neverUpdated}
        {record.score !== null ? ` · ${Math.round(record.score * 100)}%` : ""}
      </div>
      {showContext && (record.risks || record.decisions_needed) && (
        <div className="mt-3 space-y-1 rounded-md bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-700">
          {record.risks && <div><span className="font-semibold">{copy.riskLabel}：</span>{translateText(record.risks, lang)}</div>}
          {record.decisions_needed && <div><span className="font-semibold">{copy.decisionLabel}：</span>{translateText(record.decisions_needed, lang)}</div>}
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

function formatDate(value: string, lang: Lang) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(lang === "en" ? "en-US" : "zh-CN", { month: "short", day: "numeric" }).format(date);
}

const copies = {
  zh: {
    eyebrow: "个人行动视图",
    title: "我的行动中心",
    subtitle: "只聚合与你直接相关的 KR、超期更新、风险决策和待审核草稿，减少在多个团队页面之间查找。",
    myKrs: "我的 KR",
    myKrsDescription: "当前周期由你负责的关键结果。",
    stale: "待更新",
    staleDescription: "超过 7 天没有记录活动的 KR。",
    attention: "风险与决策",
    attentionDescription: "Yellow/Red 或仍有风险、待决策事项的 KR。",
    review: "待审核",
    reviewDescription: "你有发布权限且存在未发布草稿的团队。",
    noOwnedKrs: "当前周期没有匹配到你负责的 KR。",
    noStale: "很好，当前没有超过 7 天未更新的 KR。",
    noAttention: "当前没有需要你处理的风险或决策事项。",
    noReview: "当前没有待审核草稿。",
    overdue: "超过 7 天",
    lastActivity: "最近活动",
    neverUpdated: "尚未更新",
    riskLabel: "风险",
    decisionLabel: "待决策",
    updateAction: "更新进展",
    reviewAction: "查看草稿",
    draftObjectives: (count: number) => `${count} 个草稿 Objective`
  },
  en: {
    eyebrow: "Personal action view",
    title: "My Action Center",
    subtitle: "See only the KRs, overdue updates, risks, decisions, and draft reviews that need your attention.",
    myKrs: "My KRs",
    myKrsDescription: "Key results you own in the active period.",
    stale: "Update due",
    staleDescription: "KRs with no recorded activity for more than 7 days.",
    attention: "Risks & decisions",
    attentionDescription: "Yellow/Red KRs or KRs with open risks and decisions.",
    review: "Review queue",
    reviewDescription: "Unpublished drafts inside your publish scope.",
    noOwnedKrs: "No owned KRs were found in the active period.",
    noStale: "All owned KRs have been updated within 7 days.",
    noAttention: "No risks or decisions currently need your attention.",
    noReview: "No drafts are waiting for review.",
    overdue: "Over 7 days",
    lastActivity: "Last activity",
    neverUpdated: "Never updated",
    riskLabel: "Risk",
    decisionLabel: "Decision",
    updateAction: "Update progress",
    reviewAction: "Review draft",
    draftObjectives: (count: number) => `${count} draft Objective${count === 1 ? "" : "s"}`
  }
} as const;

"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CalendarDays, Check, ChevronDown, ExternalLink, Link2, X } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { ConfidenceBadge, Score, TypeBadge } from "@/components/okr-status";
import { hrefWithLang, t, translateText, type Lang } from "@/lib/i18n";
import type { ProgressNote } from "@/lib/okr/progress-notes";
import type { ConfidenceLevel, OkrRecord } from "@/lib/okr/types";
import { cn } from "@/lib/utils";

type OkrDetailDrawerProps = {
  records: OkrRecord[];
  progressNotes: ProgressNote[];
  selectedPeriod: string;
  selectedDetailId?: string;
  lang: Lang;
};

export function OkrDetailDrawer({
  records,
  progressNotes,
  selectedPeriod,
  selectedDetailId,
  lang
}: OkrDetailDrawerProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [fieldsOpen, setFieldsOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const copy = lang === "en" ? en : zh;
  const record = records.find((item) => item.okr_id === selectedDetailId);
  const recordById = useMemo(() => new Map(records.map((item) => [item.okr_id, item])), [records]);

  useEffect(() => {
    if (!record) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [record]);

  if (!record) return null;

  const parent = record.parent_id ? recordById.get(record.parent_id) : null;
  const children = records.filter((item) => item.parent_id === record.okr_id);
  const noteTarget = record.kr && parent ? parent : record;
  const notes = progressNotes.filter((note) =>
    note.team === noteTarget.team &&
    note.periodId === selectedPeriod &&
    note.objectiveId === noteTarget.okr_id
  );
  const title = record.kr || record.objective;
  const fullHref = hrefWithLang(`/okr/${encodeURIComponent(record.okr_id)}`, lang);

  function close() {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("detail");
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  async function copyLink() {
    try {
      const url = new URL(fullHref, window.location.origin);
      await navigator.clipboard.writeText(url.toString());
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  return (
    <>
      <button
        type="button"
        aria-label={copy.close}
        className="fixed inset-0 z-40 cursor-default bg-slate-950/20"
        onClick={close}
      />
      <aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[560px] flex-col border-l border-border bg-white shadow-2xl sm:w-[560px]">
        <header className="shrink-0 border-b border-border px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <Badge tone="blue">{record.kr ? "KR" : "Objective"}</Badge>
                <Badge tone="gray">{record.team}</Badge>
                <TypeBadge value={record.type} />
                <ConfidenceBadge value={record.confidence} />
              </div>
              <h2 className="text-lg font-semibold leading-7 text-slate-950">{translateText(title, lang)}</h2>
            </div>
            <button
              type="button"
              onClick={close}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-950"
              aria-label={copy.close}
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
            <Metric label={t(lang, "owner")} value={record.owner} />
            <Metric label={t(lang, "score")} value={<Score value={record.score} />} />
            <Metric label={t(lang, "updated")} value={record.last_update || t(lang, "notUpdated")} />
            <Metric label="OKR ID" value={record.okr_id} />
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href={fullHref}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              {copy.openFullPage}
            </Link>
            <button
              type="button"
              onClick={() => void copyLink()}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Link2 className="h-3.5 w-3.5" />}
              {copied ? copy.copied : copy.copyLink}
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <SectionTitle
            title={record.kr && parent ? copy.parentWeeklyHistory : copy.weeklyHistory}
            count={notes.length}
          />
          {notes.length === 0 ? (
            <div className="rounded-md border border-dashed border-border px-4 py-5 text-sm text-muted-foreground">
              {copy.noNotes}
            </div>
          ) : (
            <div className="space-y-3">
              {notes.map((note) => (
                <article key={`${note.objectiveId}-${note.weekStart}`} className="rounded-md border border-border bg-white p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="inline-flex items-center gap-2 text-sm font-semibold text-slate-950">
                      <CalendarDays className="h-4 w-4 text-blue-500" />
                      {copy.weekOf} {note.weekStart}
                    </div>
                    <StatusPill status={note.status} lang={lang} />
                  </div>
                  <p className="mt-3 text-sm leading-6 text-slate-800">{note.summary}</p>
                  {(note.risks || note.nextSteps) && (
                    <div className="mt-3 grid gap-2 text-sm md:grid-cols-2">
                      {note.risks && <CompactField label={copy.risks} value={note.risks} lang={lang} />}
                      {note.nextSteps && <CompactField label={copy.nextSteps} value={note.nextSteps} lang={lang} />}
                    </div>
                  )}
                  <div className="mt-3 text-xs text-muted-foreground">
                    {note.updatedBy} · {note.updatedAt.slice(0, 10)}
                  </div>
                </article>
              ))}
            </div>
          )}

          <div className="mt-5 rounded-md border border-border">
            <button
              type="button"
              onClick={() => setFieldsOpen((current) => !current)}
              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm font-semibold text-slate-950 hover:bg-slate-50"
            >
              {copy.currentFields}
              <ChevronDown className={cn("h-4 w-4 text-slate-500 transition", fieldsOpen && "rotate-180")} />
            </button>
            {fieldsOpen && (
              <div className="grid gap-3 border-t border-border p-4 text-sm md:grid-cols-2">
                <CompactField label={t(lang, "baseline")} value={record.baseline} lang={lang} />
                <CompactField label={t(lang, "target")} value={record.target} lang={lang} />
                <CompactField label={t(lang, "actual")} value={record.actual} lang={lang} />
                <CompactField label={t(lang, "dependencies")} value={record.dependencies} lang={lang} />
                <CompactField label={t(lang, "risks")} value={record.risks} lang={lang} />
                <CompactField label={t(lang, "decisionsNeeded")} value={record.decisions_needed} lang={lang} />
              </div>
            )}
          </div>

          <div className="mt-5">
            {record.kr ? (
              parent && (
                <>
                  <SectionTitle title={copy.parentObjective} />
                  <RelatedRecord record={parent} lang={lang} />
                </>
              )
            ) : (
              <>
                <SectionTitle title="KR" count={children.length} />
                {children.length === 0 ? (
                  <div className="rounded-md border border-dashed border-border px-4 py-4 text-sm text-muted-foreground">
                    {copy.noRelated}
                  </div>
                ) : (
                  <div className="divide-y divide-border rounded-md border border-border">
                    {children.map((child) => <RelatedRecord key={child.okr_id} record={child} lang={lang} />)}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}

export function OkrDetailLink({
  href,
  children,
  className
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Link href={href} scroll={false} className={className}>
      {children}
    </Link>
  );
}

function Metric({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0 rounded-md bg-slate-50 px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 truncate text-sm font-medium text-slate-900">{value}</div>
    </div>
  );
}

function SectionTitle({ title, count }: { title: string; count?: number }) {
  return (
    <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-950">
      <span>{title}</span>
      {typeof count === "number" && <span className="text-xs font-medium text-muted-foreground">{count}</span>}
    </div>
  );
}

function CompactField({ label, value, lang }: { label: string; value: string; lang: Lang }) {
  return (
    <div className="min-w-0">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm leading-5 text-slate-800">{translateText(value, lang) || t(lang, "noneListed")}</div>
    </div>
  );
}

function RelatedRecord({ record, lang }: { record: OkrRecord; lang: Lang }) {
  return (
    <Link href={hrefWithLang(`/okr/${encodeURIComponent(record.okr_id)}`, lang)} className="block px-3 py-3 hover:bg-slate-50">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="blue">{record.kr ? "KR" : "Objective"}</Badge>
        <ConfidenceBadge value={record.confidence} />
        <span className="text-xs text-muted-foreground">{t(lang, "score")} <Score value={record.score} /></span>
      </div>
      <div className="mt-2 text-sm font-semibold leading-5 text-slate-900">
        {translateText(record.kr || record.objective, lang)}
      </div>
    </Link>
  );
}

function StatusPill({ status, lang }: { status: ConfidenceLevel; lang: Lang }) {
  return (
    <span className={cn(
      "inline-flex h-6 items-center rounded-full px-2.5 text-xs font-semibold",
      status === "Green" && "bg-emerald-50 text-emerald-700",
      status === "Yellow" && "bg-amber-50 text-amber-700",
      status === "Red" && "bg-rose-50 text-rose-700"
    )}>
      {statusLabel(status, lang)}
    </span>
  );
}

function statusLabel(status: ConfidenceLevel, lang: Lang) {
  if (lang === "en") return status;
  if (status === "Green") return "正常";
  if (status === "Red") return "风险";
  return "关注";
}

const zh = {
  close: "关闭详情",
  openFullPage: "打开完整页",
  copyLink: "复制链接",
  copied: "已复制",
  weeklyHistory: "周进展历史",
  parentWeeklyHistory: "所属 Objective 周进展",
  noNotes: "还没有周进展记录。",
  weekOf: "周起始",
  risks: "风险 / Blocker",
  nextSteps: "下周计划",
  currentFields: "当前字段",
  parentObjective: "所属 Objective",
  noRelated: "暂无关联项"
};

const en = {
  close: "Close details",
  openFullPage: "Open full page",
  copyLink: "Copy link",
  copied: "Copied",
  weeklyHistory: "Weekly Progress History",
  parentWeeklyHistory: "Parent Objective Progress",
  noNotes: "No weekly progress records yet.",
  weekOf: "Week of",
  risks: "Risks / blockers",
  nextSteps: "Next steps",
  currentFields: "Current Fields",
  parentObjective: "Parent Objective",
  noRelated: "No related items"
};

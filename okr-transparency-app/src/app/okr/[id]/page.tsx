import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, CalendarDays } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ConfidenceBadge, Score, TypeBadge } from "@/components/okr-status";
import { Badge } from "@/components/ui/badge";
import { readAdminConfig } from "@/lib/admin/config";
import { hrefWithLang, normalizeLang, t, translateText, type Lang } from "@/lib/i18n";
import { readProgressNotesForObjective, type ProgressNote } from "@/lib/okr/progress-notes";
import { readOkrSnapshot } from "@/lib/okr/store";
import type { ConfidenceLevel } from "@/lib/okr/types";

export default async function OkrDetailPage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ lang?: string }>;
}) {
  const [{ id }, query, snapshot, adminConfig] = await Promise.all([
    params,
    searchParams,
    readOkrSnapshot(),
    readAdminConfig()
  ]);
  const lang = normalizeLang(query.lang);
  const record = snapshot.records.find((item) => item.okr_id === decodeURIComponent(id));

  if (!record) redirect(hrefWithLang("/teams", lang));

  const parent = record.parent_id ? snapshot.records.find((item) => item.okr_id === record.parent_id) : null;
  const children = snapshot.records.filter((item) => item.parent_id === record.okr_id);
  const progressNotes = await readProgressNotesForObjective(record.team, adminConfig.defaultPeriodId, record.okr_id);
  const title = record.kr || record.objective;

  return (
    <AppShell active="teams">
      <div className="mb-4">
        <Link
          href={hrefWithLang(`/?team=${encodeURIComponent(record.team)}`, lang)}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-blue-700"
        >
          <ArrowLeft className="h-4 w-4" />
          {lang === "en" ? "Back to team overview" : "返回团队概览"}
        </Link>
      </div>

      <section className="rounded-lg border border-border bg-white p-5 shadow-subtle">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="blue">{record.kr ? "KR" : "Objective"}</Badge>
          <Badge tone="gray">{record.team}</Badge>
          <TypeBadge value={record.type} />
          <ConfidenceBadge value={record.confidence} />
        </div>
        <h1 className="mt-4 text-2xl font-semibold leading-9 text-slate-950">{translateText(title, lang)}</h1>
        <div className="mt-4 grid gap-3 text-sm text-slate-600 md:grid-cols-4">
          <Field label={t(lang, "owner")} value={record.owner} />
          <Field label={t(lang, "score")} value={<Score value={record.score} />} />
          <Field label={t(lang, "updated")} value={record.last_update || t(lang, "notUpdated")} />
          <Field label={lang === "en" ? "OKR ID" : "OKR ID"} value={record.okr_id} />
        </div>
        {parent && (
          <div className="mt-4 rounded-md border border-border bg-slate-50 px-3 py-2 text-sm text-slate-600">
            <span className="font-medium text-slate-900">{t(lang, "parent")}：</span>
            <Link href={hrefWithLang(`/okr/${encodeURIComponent(parent.okr_id)}`, lang)} className="hover:text-blue-700">
              {translateText(parent.kr || parent.objective, lang)}
            </Link>
          </div>
        )}
      </section>

      <div className="mt-5 grid gap-5 xl:grid-cols-[1fr_360px]">
        <section className="space-y-5">
          <DetailSection title={lang === "en" ? "Weekly Progress History" : "周进展完整历史"}>
            {progressNotes.length === 0 ? (
              <div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                {lang === "en" ? "No weekly progress records yet." : "还没有周进展记录。"}
              </div>
            ) : (
              <WeeklyHistory notes={progressNotes} lang={lang} />
            )}
          </DetailSection>

          {children.length > 0 && (
            <DetailSection title={record.kr ? (lang === "en" ? "Linked Items" : "关联项") : "KR"}>
              <div className="divide-y divide-border rounded-md border border-border">
                {children.map((child, index) => (
                  <Link
                    key={child.okr_id}
                    href={hrefWithLang(`/okr/${encodeURIComponent(child.okr_id)}`, lang)}
                    className="block p-3 hover:bg-slate-50"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="blue">KR {index + 1}</Badge>
                      <ConfidenceBadge value={child.confidence} />
                      <span className="text-xs text-muted-foreground">{t(lang, "score")} <Score value={child.score} /></span>
                    </div>
                    <div className="mt-2 text-sm font-semibold leading-5 text-slate-900">
                      {translateText(child.kr || child.objective, lang)}
                    </div>
                  </Link>
                ))}
              </div>
            </DetailSection>
          )}
        </section>

        <aside className="space-y-5">
          <DetailSection title={lang === "en" ? "Current Fields" : "当前字段"}>
            <div className="space-y-3 text-sm">
              <SideField label={t(lang, "baseline")} value={record.baseline} lang={lang} />
              <SideField label={t(lang, "target")} value={record.target} lang={lang} />
              <SideField label={t(lang, "actual")} value={record.actual} lang={lang} />
              <SideField label={t(lang, "dependencies")} value={record.dependencies} lang={lang} />
              <SideField label={t(lang, "risks")} value={record.risks} lang={lang} />
              <SideField label={t(lang, "decisionsNeeded")} value={record.decisions_needed} lang={lang} />
            </div>
          </DetailSection>
        </aside>
      </div>
    </AppShell>
  );
}

function WeeklyHistory({ notes, lang }: { notes: ProgressNote[]; lang: Lang }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 rounded-md border border-border bg-slate-50 px-3 py-2">
        <CalendarDays className="h-4 w-4 text-blue-500" />
        <span className="text-sm font-medium text-slate-700">{lang === "en" ? "Status trend" : "状态趋势"}</span>
        <div className="flex items-center gap-1">
          {[...notes].reverse().map((note) => (
            <span
              key={note.weekStart}
              title={`${note.weekStart} ${statusLabel(note.status, lang)}`}
              className={statusDotClass(note.status)}
            />
          ))}
        </div>
      </div>

      {notes.map((note) => (
        <article key={note.weekStart} className="rounded-md border border-border bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm font-semibold text-slate-950">
              {lang === "en" ? "Week of" : "周起始"} {note.weekStart}
            </div>
            <StatusPill status={note.status} lang={lang} />
          </div>
          <p className="mt-3 text-sm leading-6 text-slate-700">{note.summary}</p>
          <div className="mt-3 grid gap-3 text-sm md:grid-cols-2">
            {note.risks && <SideField label={lang === "en" ? "Risks / blockers" : "风险 / Blocker"} value={note.risks} lang={lang} />}
            {note.nextSteps && <SideField label={lang === "en" ? "Next steps" : "下周计划"} value={note.nextSteps} lang={lang} />}
          </div>
          <div className="mt-3 text-xs text-muted-foreground">
            {note.updatedBy} · {note.updatedAt.slice(0, 10)}
          </div>
        </article>
      ))}
    </div>
  );
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-white p-5 shadow-subtle">
      <h2 className="text-base font-semibold text-slate-950">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 font-medium text-slate-900">{value}</div>
    </div>
  );
}

function SideField({ label, value, lang }: { label: string; value: string; lang: Lang }) {
  return (
    <div>
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="mt-1 leading-5 text-slate-800">{translateText(value, lang) || t(lang, "noneListed")}</div>
    </div>
  );
}

function StatusPill({ status, lang }: { status: ConfidenceLevel; lang: Lang }) {
  return (
    <span className={[
      "inline-flex h-6 items-center rounded-full px-2.5 text-xs font-semibold",
      status === "Green" ? "bg-emerald-50 text-emerald-700" : "",
      status === "Yellow" ? "bg-amber-50 text-amber-700" : "",
      status === "Red" ? "bg-rose-50 text-rose-700" : ""
    ].join(" ")}>
      {statusLabel(status, lang)}
    </span>
  );
}

function statusDotClass(status: ConfidenceLevel) {
  return [
    "h-2.5 w-2.5 rounded-full",
    status === "Green" ? "bg-emerald-400" : "",
    status === "Yellow" ? "bg-amber-400" : "",
    status === "Red" ? "bg-rose-400" : ""
  ].join(" ");
}

function statusLabel(status: ConfidenceLevel, lang: Lang) {
  if (lang === "en") return status;
  if (status === "Green") return "正常";
  if (status === "Red") return "风险";
  return "关注";
}

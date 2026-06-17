"use client";

import { useState } from "react";
import { AlertTriangle, CalendarDays, Check, ChevronDown, FileText, Save, X } from "lucide-react";
import Link from "next/link";
import type { Lang } from "@/lib/i18n";
import type { ProgressNote } from "@/lib/okr/progress-notes";
import type { ConfidenceLevel } from "@/lib/okr/types";
import { cn } from "@/lib/utils";

type ProgressNoteCardProps = {
  team: string;
  periodId: string;
  objectiveId: string;
  progressNotes: ProgressNote[];
  fallbackNote: string;
  defaultStatus: ConfidenceLevel;
  fullHistoryHref: string;
  lang: Lang;
};

const recentHistoryLimit = 4;

export function ProgressNoteCard({
  team,
  periodId,
  objectiveId,
  progressNotes,
  fallbackNote,
  defaultStatus,
  fullHistoryHref,
  lang
}: ProgressNoteCardProps) {
  const copy = lang === "en" ? en : zh;
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState(() => sortNotes(progressNotes));
  const [currentWeekStart] = useState(() => getCurrentWeekStart());
  const currentNote = notes.find((note) => note.weekStart === currentWeekStart);
  const latestNote = notes[0];
  const recentNotes = notes.slice(0, recentHistoryLimit);
  const [draftSummary, setDraftSummary] = useState(currentNote?.summary ?? "");
  const [draftStatus, setDraftStatus] = useState<ConfidenceLevel>(currentNote?.status ?? defaultStatus);
  const [draftRisks, setDraftRisks] = useState(currentNote?.risks ?? "");
  const [draftNextSteps, setDraftNextSteps] = useState(currentNote?.nextSteps ?? "");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const displayNote = latestNote?.summary || fallbackNote;

  function resetDraft() {
    const nextCurrentNote = notes.find((note) => note.weekStart === currentWeekStart);
    setDraftSummary(nextCurrentNote?.summary ?? "");
    setDraftStatus(nextCurrentNote?.status ?? defaultStatus);
    setDraftRisks(nextCurrentNote?.risks ?? "");
    setDraftNextSteps(nextCurrentNote?.nextSteps ?? "");
    setSaveState("idle");
  }

  async function saveNote() {
    if (!draftSummary.trim()) {
      setSaveState("error");
      return;
    }

    setSaveState("saving");
    const response = await fetch("/api/progress-notes", {
      method: "PUT",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        team,
        periodId,
        objectiveId,
        weekStart: currentWeekStart,
        summary: draftSummary,
        status: draftStatus,
        risks: draftRisks,
        nextSteps: draftNextSteps
      })
    });

    if (!response.ok) {
      setSaveState("error");
      return;
    }

    const body = await response.json() as { note: ProgressNote };
    setNotes((current) => sortNotes([
      body.note,
      ...current.filter((note) => note.weekStart !== body.note.weekStart)
    ]));
    setSaveState("saved");
    setOpen(false);
  }

  return (
    <div className={cn("mt-5 rounded-md bg-slate-50 transition", open && "bg-blue-50/70")}>
      <button
        type="button"
        onClick={() => {
          resetDraft();
          setOpen((current) => !current);
        }}
        className="flex w-full gap-3 rounded-md p-3 text-left transition hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2"
      >
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white text-slate-500 shadow-subtle">
          <FileText className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-900">
            <span>{copy.title}</span>
            {latestNote && <StatusPill status={latestNote.status} lang={lang} />}
            <ChevronDown className={cn("h-3.5 w-3.5 text-blue-500 transition", open && "rotate-180")} />
          </div>
          <div className="mt-1 text-sm leading-5 text-muted-foreground">{displayNote}</div>
          {latestNote && (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-400">
              <span>{copy.weekOf} {latestNote.weekStart}</span>
              <span>{latestNote.updatedBy || copy.defaultLead} · {latestNote.updatedAt.slice(0, 10)}</span>
            </div>
          )}
          {recentNotes.length > 1 && <StatusTrend notes={recentNotes} lang={lang} />}
        </div>
      </button>

      {open && (
        <div className="border-t border-blue-100 px-3 pb-3">
          <div className="grid gap-3 pt-3 md:grid-cols-[1fr_160px]">
            <label className="block">
              <span className="text-xs font-medium text-slate-500">{copy.summaryLabel}</span>
              <textarea
                value={draftSummary}
                onChange={(event) => {
                  setDraftSummary(event.target.value);
                  setSaveState("idle");
                }}
                rows={3}
                placeholder={copy.summaryPlaceholder}
                className="mt-1 w-full resize-y rounded-md border border-blue-100 bg-white px-3 py-2 text-sm leading-5 text-slate-900 outline-none focus:border-blue-400"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-slate-500">{copy.statusLabel}</span>
              <select
                value={draftStatus}
                onChange={(event) => {
                  setDraftStatus(event.target.value as ConfidenceLevel);
                  setSaveState("idle");
                }}
                className="mt-1 h-9 w-full rounded-md border border-blue-100 bg-white px-2 text-sm text-slate-900 outline-none focus:border-blue-400"
              >
                <option value="Green">{copy.green}</option>
                <option value="Yellow">{copy.yellow}</option>
                <option value="Red">{copy.red}</option>
              </select>
            </label>
          </div>

          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <label className="block">
              <span className="text-xs font-medium text-slate-500">{copy.risksLabel}</span>
              <textarea
                value={draftRisks}
                onChange={(event) => {
                  setDraftRisks(event.target.value);
                  setSaveState("idle");
                }}
                rows={2}
                placeholder={copy.risksPlaceholder}
                className="mt-1 w-full resize-y rounded-md border border-blue-100 bg-white px-3 py-2 text-sm leading-5 text-slate-900 outline-none focus:border-blue-400"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-slate-500">{copy.nextStepsLabel}</span>
              <textarea
                value={draftNextSteps}
                onChange={(event) => {
                  setDraftNextSteps(event.target.value);
                  setSaveState("idle");
                }}
                rows={2}
                placeholder={copy.nextStepsPlaceholder}
                className="mt-1 w-full resize-y rounded-md border border-blue-100 bg-white px-3 py-2 text-sm leading-5 text-slate-900 outline-none focus:border-blue-400"
              />
            </label>
          </div>

          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <div className={cn(
              "text-xs",
              saveState === "error" ? "text-rose-600" : "text-slate-400"
            )}>
              {saveState === "idle" && `${copy.currentWeek}: ${currentWeekStart}`}
              {saveState === "saving" && copy.saving}
              {saveState === "saved" && copy.saved}
              {saveState === "error" && copy.saveError}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  resetDraft();
                  setOpen(false);
                }}
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-white px-3 text-xs font-medium text-slate-600 hover:bg-slate-50"
              >
                <X className="h-3.5 w-3.5" />
                {copy.cancel}
              </button>
              <button
                type="button"
                onClick={saveNote}
                disabled={saveState === "saving" || !draftSummary.trim()}
                className="inline-flex h-8 items-center gap-1.5 rounded-md bg-blue-600 px-3 text-xs font-medium text-white hover:bg-blue-700 disabled:bg-slate-300"
              >
                {saveState === "saved" ? <Check className="h-3.5 w-3.5" /> : <Save className="h-3.5 w-3.5" />}
                {copy.save}
              </button>
            </div>
          </div>

          {notes.length > 0 && (
            <div className="mt-4 border-t border-blue-100 pt-3">
              <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-slate-600">
                <CalendarDays className="h-3.5 w-3.5" />
                {copy.recentHistoryTitle}
              </div>
              <div className="space-y-2">
                {recentNotes.map((note) => (
                  <div key={note.weekStart} className="rounded-md border border-blue-100 bg-white px-3 py-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-xs font-semibold text-slate-700">{copy.weekOf} {note.weekStart}</div>
                      <StatusPill status={note.status} lang={lang} />
                    </div>
                    <div className="mt-1 text-sm leading-5 text-slate-700">{note.summary}</div>
                    {(note.risks || note.nextSteps) && (
                      <div className="mt-2 grid gap-2 text-xs leading-5 text-slate-500 md:grid-cols-2">
                        {note.risks && <HistoryField icon="risk" label={copy.risksLabel} value={note.risks} />}
                        {note.nextSteps && <HistoryField icon="next" label={copy.nextStepsLabel} value={note.nextSteps} />}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              {notes.length > recentHistoryLimit && (
                <Link
                  href={fullHistoryHref}
                  className="mt-3 inline-flex text-xs font-semibold text-blue-700 hover:text-blue-800"
                >
                  {copy.viewFullHistory}
                </Link>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StatusTrend({ notes, lang }: { notes: ProgressNote[]; lang: Lang }) {
  return (
    <div className="mt-3 flex items-center gap-1.5">
      <span className="text-xs text-slate-400">{lang === "en" ? "Trend" : "趋势"}</span>
      <div className="flex items-center gap-1">
        {[...notes].reverse().map((note) => (
          <span
            key={note.weekStart}
            title={`${note.weekStart} ${statusLabel(note.status, lang)}`}
            className={cn(
              "h-2.5 w-2.5 rounded-full",
              note.status === "Green" && "bg-emerald-400",
              note.status === "Yellow" && "bg-amber-400",
              note.status === "Red" && "bg-rose-400"
            )}
          />
        ))}
      </div>
    </div>
  );
}

function StatusPill({ status, lang }: { status: ConfidenceLevel; lang: Lang }) {
  const label = statusLabel(status, lang);
  return (
    <span className={cn(
      "inline-flex h-5 items-center rounded-full px-2 text-[11px] font-semibold",
      status === "Green" && "bg-emerald-50 text-emerald-700",
      status === "Yellow" && "bg-amber-50 text-amber-700",
      status === "Red" && "bg-rose-50 text-rose-700"
    )}>
      {label}
    </span>
  );
}

function HistoryField({ icon, label, value }: { icon: "risk" | "next"; label: string; value: string }) {
  return (
    <div className="flex gap-1.5">
      {icon === "risk" ? <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
      <div className="min-w-0">
        <div className="font-medium text-slate-600">{label}</div>
        <div>{value}</div>
      </div>
    </div>
  );
}

function sortNotes(notes: ProgressNote[]) {
  return [...notes].sort((left, right) =>
    right.weekStart.localeCompare(left.weekStart) || right.updatedAt.localeCompare(left.updatedAt)
  );
}

function getCurrentWeekStart() {
  const date = new Date();
  const localDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = localDate.getDay();
  const daysSinceMonday = day === 0 ? 6 : day - 1;
  localDate.setDate(localDate.getDate() - daysSinceMonday);
  const year = localDate.getFullYear();
  const month = String(localDate.getMonth() + 1).padStart(2, "0");
  const dateOfMonth = String(localDate.getDate()).padStart(2, "0");
  return `${year}-${month}-${dateOfMonth}`;
}

function statusLabel(status: ConfidenceLevel, lang: Lang) {
  if (lang === "en") return status;
  if (status === "Green") return "正常";
  if (status === "Red") return "风险";
  return "关注";
}

const zh = {
  title: "周进展记录",
  weekOf: "周起始",
  currentWeek: "本周",
  summaryLabel: "本周进展",
  summaryPlaceholder: "填写本周完成了什么、进度变化或关键结论。",
  statusLabel: "状态",
  risksLabel: "风险 / Blocker",
  risksPlaceholder: "填写当前风险、阻塞或需要升级的问题。",
  nextStepsLabel: "下周计划",
  nextStepsPlaceholder: "填写下一步动作、owner 或需要决策的事项。",
  recentHistoryTitle: "最近周记录",
  viewFullHistory: "查看全部历史",
  save: "保存本周",
  cancel: "取消",
  saving: "保存中...",
  saved: "已保存",
  saveError: "请填写本周进展，或稍后重试。",
  defaultLead: "Lead",
  green: "正常",
  yellow: "关注",
  red: "风险"
};

const en: typeof zh = {
  title: "Weekly progress",
  weekOf: "Week of",
  currentWeek: "Current week",
  summaryLabel: "Weekly update",
  summaryPlaceholder: "Summarize progress, movement, or key outcomes this week.",
  statusLabel: "Status",
  risksLabel: "Risks / blockers",
  risksPlaceholder: "Capture active risks, blockers, or escalations.",
  nextStepsLabel: "Next steps",
  nextStepsPlaceholder: "Capture next actions, owners, or decisions needed.",
  recentHistoryTitle: "Recent weeks",
  viewFullHistory: "View full history",
  save: "Save week",
  cancel: "Cancel",
  saving: "Saving...",
  saved: "Saved",
  saveError: "Add a weekly update, or try again later.",
  defaultLead: "Lead",
  green: "Green",
  yellow: "Yellow",
  red: "Red"
};

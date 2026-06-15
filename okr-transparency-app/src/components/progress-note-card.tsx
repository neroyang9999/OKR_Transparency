"use client";

import { useState } from "react";
import { Check, FileText, PencilLine, Save, X } from "lucide-react";
import type { Lang } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type ProgressNoteCardProps = {
  team: string;
  periodId: string;
  objectiveId: string;
  initialNote: string;
  fallbackNote: string;
  updatedBy?: string;
  updatedAt?: string;
  lang: Lang;
};

const adminToken = "dev-admin-token";

export function ProgressNoteCard({
  team,
  periodId,
  objectiveId,
  initialNote,
  fallbackNote,
  updatedBy,
  updatedAt,
  lang
}: ProgressNoteCardProps) {
  const copy = lang === "en" ? en : zh;
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState(initialNote);
  const [draft, setDraft] = useState(initialNote);
  const [savedBy, setSavedBy] = useState(updatedBy);
  const [savedAt, setSavedAt] = useState(updatedAt);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const displayNote = note || fallbackNote;

  async function saveNote() {
    setSaveState("saving");
    const response = await fetch("/api/progress-notes", {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        "x-admin-token": adminToken
      },
      body: JSON.stringify({ team, periodId, objectiveId, note: draft, updatedBy: copy.defaultLead })
    });

    if (!response.ok) {
      setSaveState("error");
      return;
    }

    const body = await response.json() as { note: { note: string; updatedBy: string; updatedAt: string } };
    setNote(body.note.note);
    setDraft(body.note.note);
    setSavedBy(body.note.updatedBy);
    setSavedAt(body.note.updatedAt);
    setSaveState("saved");
    setOpen(false);
  }

  return (
    <div className={cn("mt-5 rounded-md bg-slate-50 transition", open && "bg-blue-50/70")}>
      <button
        type="button"
        onClick={() => {
          setDraft(note);
          setOpen((current) => !current);
        }}
        className="flex w-full gap-3 rounded-md p-3 text-left transition hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2"
      >
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white text-slate-500 shadow-subtle">
          <FileText className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <span>{copy.title}</span>
            <PencilLine className="h-3.5 w-3.5 text-blue-500" />
          </div>
          <div className="mt-1 text-sm leading-5 text-muted-foreground">{displayNote}</div>
          {(savedBy || savedAt) && (
            <div className="mt-2 text-xs text-slate-400">
              {savedBy || copy.defaultLead}{savedAt ? ` · ${savedAt.slice(0, 10)}` : ""}
            </div>
          )}
        </div>
      </button>

      {open && (
        <div className="border-t border-blue-100 px-3 pb-3">
          <label className="block pt-3">
            <span className="text-xs font-medium text-slate-500">{copy.inputLabel}</span>
            <textarea
              value={draft}
              onChange={(event) => {
                setDraft(event.target.value);
                setSaveState("idle");
              }}
              rows={3}
              placeholder={copy.placeholder}
              className="mt-1 w-full resize-y rounded-md border border-blue-100 bg-white px-3 py-2 text-sm leading-5 text-slate-900 outline-none focus:border-blue-400"
            />
          </label>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <div className={cn(
              "text-xs",
              saveState === "error" ? "text-rose-600" : "text-slate-400"
            )}>
              {saveState === "saving" && copy.saving}
              {saveState === "saved" && copy.saved}
              {saveState === "error" && copy.saveError}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setDraft(note);
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
                disabled={saveState === "saving"}
                className="inline-flex h-8 items-center gap-1.5 rounded-md bg-blue-600 px-3 text-xs font-medium text-white hover:bg-blue-700 disabled:bg-slate-300"
              >
                {saveState === "saved" ? <Check className="h-3.5 w-3.5" /> : <Save className="h-3.5 w-3.5" />}
                {copy.save}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const zh = {
  title: "进度记录",
  inputLabel: "Lead 阶段性进展",
  placeholder: "填写本阶段完成了什么、当前风险、下一步计划。",
  save: "保存",
  cancel: "取消",
  saving: "保存中...",
  saved: "已保存",
  saveError: "保存失败",
  defaultLead: "Lead"
};

const en: typeof zh = {
  title: "Progress notes",
  inputLabel: "Lead progress update",
  placeholder: "Summarize phase progress, current risks, and next steps.",
  save: "Save",
  cancel: "Cancel",
  saving: "Saving...",
  saved: "Saved",
  saveError: "Save failed",
  defaultLead: "Lead"
};

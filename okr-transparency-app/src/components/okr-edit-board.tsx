"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Check, CircleAlert, Link2, Lock, Plus, Save, Search, Send, Trash2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { PeriodSwitcher } from "@/components/period-switcher";
import { calculateObjectiveProgress, createEmptyKr, createEmptyObjective, normalizeDraft, validateDraft, type EditableKr, type EditableObjective, type OkrDraft } from "@/lib/okr/edit-types";
import type { ConfidenceLevel, OkrType } from "@/lib/okr/types";
import { hrefWithLang, type Lang } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type OkrEditBoardProps = {
  initialDraft: OkrDraft;
  lang: Lang;
  alignmentOptions: AlignmentOption[];
  teamOwner: string;
};

export type AlignmentOption = {
  id: string;
  kind: "O" | "KR";
  team: string;
  owner: string;
  title: string;
  parentTitle?: string;
  progress: number | null;
  confidence: string;
};

const adminToken = "dev-admin-token";
const confidenceOptions: ConfidenceLevel[] = ["Green", "Yellow", "Red"];
const typeOptions: OkrType[] = ["Committed", "Aspirational", "Learning"];

export function OkrEditBoard({ initialDraft, lang, alignmentOptions, teamOwner }: OkrEditBoardProps) {
  const router = useRouter();
  const [draft, setDraft] = useState(() => normalizeDraft(initialDraft, teamOwner));
  const [saveState, setSaveState] = useState<"saved" | "saving" | "dirty" | "error">("saved");
  const [message, setMessage] = useState("");
  const validation = useMemo(() => validateDraft(draft), [draft]);
  const copy = lang === "en" ? en : zh;
  const showAlignment = draft.team !== "Software";

  useEffect(() => {
    if (saveState !== "dirty") return;
    const timer = window.setTimeout(() => {
      void saveDraft(draft, setSaveState, setMessage, copy.saved);
    }, 900);
    return () => window.clearTimeout(timer);
  }, [draft, saveState, copy.saved]);

  function changeDraft(updater: (current: OkrDraft) => OkrDraft) {
    setSaveState("dirty");
    setDraft(updater);
  }

  function updateObjective(objectiveId: string, patch: Partial<EditableObjective>) {
    changeDraft((current) => ({
      ...current,
      objectives: current.objectives.map((objective) =>
        objective.id === objectiveId ? { ...objective, ...patch, owner: teamOwner } : objective
      )
    }));
  }

  function updateKr(objectiveId: string, krId: string, patch: Partial<EditableKr>) {
    changeDraft((current) => ({
      ...current,
      objectives: current.objectives.map((objective) =>
        objective.id === objectiveId
          ? {
              ...objective,
              keyResults: objective.keyResults.map((kr) => kr.id === krId ? { ...kr, ...patch, owner: teamOwner } : kr)
            }
          : objective
      )
    }));
  }

  function addObjective() {
    changeDraft((current) => ({
      ...current,
      objectives: [...current.objectives, createEmptyObjective(current.team, current.periodId, teamOwner)]
    }));
  }

  function removeObjective(objectiveId: string) {
    changeDraft((current) => ({
      ...current,
      objectives: current.objectives.filter((objective) => objective.id !== objectiveId)
    }));
  }

  function addKr(objectiveId: string) {
    changeDraft((current) => ({
      ...current,
      objectives: current.objectives.map((objective) => {
        if (objective.id !== objectiveId) return objective;
        const nextKrs = [
          ...objective.keyResults,
          createEmptyKr(objective.id, objective.keyResults.length, teamOwner, objective.keyResults.length + 1)
        ];
        return { ...objective, keyResults: redistributeWeights(nextKrs) };
      })
    }));
  }

  function removeKr(objectiveId: string, krId: string) {
    changeDraft((current) => ({
      ...current,
      objectives: current.objectives.map((objective) => {
        if (objective.id !== objectiveId) return objective;
        return { ...objective, keyResults: redistributeWeights(objective.keyResults.filter((kr) => kr.id !== krId)) };
      })
    }));
  }

  async function publish() {
    setSaveState("saving");
    const saved = await saveDraft(draft, setSaveState, setMessage, copy.saved);
    if (!saved) return;

    const response = await fetch("/api/okrs/publish", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-admin-token": adminToken
      },
      body: JSON.stringify({ team: draft.team, periodId: draft.periodId })
    });
    const body = await response.json() as { errors?: string[]; warnings?: string[]; error?: string };
    if (!response.ok) {
      setSaveState("error");
      setMessage(body.error ?? body.errors?.[0] ?? copy.publishFailed);
      return;
    }

    setSaveState("saved");
    setMessage(copy.published);
    router.push(hrefWithLang(`/?team=${encodeURIComponent(draft.team)}&period=${encodeURIComponent(draft.periodId)}`, lang));
  }

  return (
    <div className="min-w-0">
      <div className="mb-4 flex flex-col gap-3 rounded-lg border border-border bg-white px-5 py-4 shadow-subtle md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-950">{draft.team} OKR</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <Badge tone="blue">{copy.editing}</Badge>
            <span>{draft.periodId.toUpperCase()}</span>
            <span>{draft.objectives.length} {copy.objectives}</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <PeriodSwitcher selectedPeriod={draft.periodId} selectedTeam={draft.team} lang={lang} mode="edit" />
          <StatusPill state={saveState} copy={copy} />
          <Link
            href={hrefWithLang(`/?team=${encodeURIComponent(draft.team)}&period=${encodeURIComponent(draft.periodId)}`, lang)}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <X className="h-4 w-4" />
            {copy.exit}
          </Link>
          <button
            type="button"
            onClick={() => saveDraft(draft, setSaveState, setMessage, copy.saved)}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <Save className="h-4 w-4" />
            {copy.save}
          </button>
          <button
            type="button"
            onClick={publish}
            disabled={saveState === "saving" || validation.errors.length > 0}
            className="inline-flex h-9 items-center gap-2 rounded-md bg-blue-600 px-3 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            <Send className="h-4 w-4" />
            {copy.publish}
          </button>
        </div>
      </div>

      {(validation.errors.length > 0 || validation.warnings.length > 0 || message) && (
        <div className="mb-4 rounded-lg border border-border bg-white px-4 py-3 shadow-subtle">
          {message && <div className="text-sm font-medium text-slate-800">{message}</div>}
          <MessageList title={copy.errors} items={validation.errors} tone="red" />
          <MessageList title={copy.warnings} items={validation.warnings} tone="yellow" />
        </div>
      )}

      <div className="space-y-5">
        {draft.objectives.map((objective, objectiveIndex) => {
          const objectiveProgress = calculateObjectiveProgress(objective.keyResults);
          return (
          <article key={objective.id} className="overflow-hidden rounded-lg border border-blue-400 bg-white shadow-subtle">
            <div className="grid gap-3 px-5 py-5 lg:grid-cols-[1fr_120px_120px_44px]">
              <div className="min-w-0">
                {showAlignment && (
                  <AlignmentPicker
                    value={objective.alignedToId}
                    options={alignmentOptions}
                    copy={copy}
                    onChange={(alignedToId) => updateObjective(objective.id, { alignedToId })}
                  />
                )}
                <div className="flex items-start gap-3">
                  <span className="mt-1 rounded-full bg-blue-500 px-3 py-1 text-sm font-semibold text-white">O{objectiveIndex + 1}</span>
                  <Textarea
                    value={objective.title}
                    onChange={(value) => updateObjective(objective.id, { title: value })}
                    placeholder={copy.objectivePlaceholder}
                    className="text-xl font-semibold"
                  />
                </div>
                <div className="mt-3 grid gap-2 md:grid-cols-3">
                  <ReadOnlyField label={copy.owner} value={teamOwner} />
                  <Select label={copy.type} value={objective.type} options={typeOptions} onChange={(value) => updateObjective(objective.id, { type: value as OkrType })} />
                  <Select label={copy.confidence} value={objective.confidence} options={confidenceOptions} onChange={(value) => updateObjective(objective.id, { confidence: value as ConfidenceLevel })} />
                </div>
              </div>
              <ReadOnlyField label={copy.progress} value={objectiveProgress === null ? "N/A" : `${objectiveProgress}%`} />
              <NumberInput label={copy.weight} value={objective.weight} onChange={(value) => updateObjective(objective.id, { weight: value ?? 100 })} />
              <button
                type="button"
                onClick={() => removeObjective(objective.id)}
                className="mt-7 grid h-9 w-9 place-items-center rounded-md text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                aria-label={copy.deleteObjective}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>

            <div className="border-y border-border">
              {objective.keyResults.map((kr, krIndex) => (
                <div key={kr.id} className="border-t border-border first:border-t-0">
                  <div className="grid gap-3 px-5 py-4 lg:grid-cols-[1fr_120px_120px_44px]">
                    <div className="min-w-0">
                      <div className="flex items-start gap-3">
                        <span className="mt-1 rounded-full bg-blue-50 px-3 py-1 text-sm font-semibold text-blue-600">KR{krIndex + 1}</span>
                        <div className="min-w-0 flex-1">
                          <Textarea
                            value={kr.title}
                            onChange={(value) => updateKr(objective.id, kr.id, { title: value })}
                            placeholder={copy.krPlaceholder}
                            className="font-medium"
                          />
                        </div>
                      </div>
                    </div>
                    <NumberInput label={copy.progress} value={kr.progress} onChange={(value) => updateKr(objective.id, kr.id, { progress: value })} />
                    <NumberInput label={copy.weight} value={kr.weight} onChange={(value) => updateKr(objective.id, kr.id, { weight: value ?? 0 })} />
                    <button
                      type="button"
                      onClick={() => removeKr(objective.id, kr.id)}
                      className="mt-7 grid h-9 w-9 place-items-center rounded-md text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                      aria-label={copy.deleteKr}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
              <button
                type="button"
                onClick={() => addKr(objective.id)}
                className="inline-flex h-14 items-center gap-2 px-20 text-sm font-semibold text-slate-600 hover:text-blue-700"
              >
                <Plus className="h-4 w-4" />
                {copy.addKr}
              </button>
            </div>

            <div className="flex items-center justify-between bg-blue-50 px-5 py-3">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Lock className="h-4 w-4" />
                {copy.draftOnly}
              </div>
              <div className="text-sm font-medium text-slate-500">{saveState === "saved" ? copy.saved : copy.autoSaving}</div>
            </div>
          </article>
          );
        })}

        <button
          type="button"
          onClick={addObjective}
          className="flex h-20 w-full items-center gap-4 rounded-lg border border-border bg-white px-7 text-lg font-semibold text-slate-500 shadow-subtle hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
        >
          <span className="grid h-10 w-10 place-items-center rounded-full bg-slate-100">
            <Plus className="h-5 w-5" />
          </span>
          {copy.addObjective}
        </button>
      </div>
    </div>
  );
}

function AlignmentPicker({
  value,
  options,
  copy,
  onChange
}: {
  value?: string;
  options: AlignmentOption[];
  copy: typeof zh;
  onChange: (value?: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.id === value);
  const normalizedQuery = query.trim().toLowerCase();
  const filtered = normalizedQuery
    ? options.filter((option) =>
        [option.id, option.kind, option.team, option.owner, option.title, option.parentTitle ?? ""]
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery)
      )
    : options;

  return (
    <div className="mb-3 max-w-3xl">
      <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
        <span className="inline-flex items-center gap-1 font-medium text-slate-500">
          <Link2 className="h-4 w-4" />
          {copy.addAlignment}
        </span>
        {selected ? (
          <span className="group relative inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 font-medium text-blue-700">
            <span>{selected.team}</span>
            <span className="text-blue-300">/</span>
            <span>{selected.owner}</span>
            <span className="rounded bg-white px-1.5 py-0.5 text-xs">{selected.kind}</span>
            <span className="max-w-80 truncate">{selected.title}</span>
            <button
              type="button"
              onClick={() => onChange(undefined)}
              className="ml-1 rounded-full text-blue-400 hover:text-blue-700"
              aria-label={copy.clearAlignment}
            >
              <X className="h-3 w-3" />
            </button>
            <AlignmentCard option={selected} copy={copy} />
          </span>
        ) : (
          <span className="text-slate-400">{copy.noAlignment}</span>
        )}
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
        <input
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder={copy.searchAlignment}
          className="h-10 w-full rounded-md border border-border bg-white pl-9 pr-3 text-sm outline-none focus:border-blue-400"
        />
        {open && (
          <div className="absolute z-30 mt-2 max-h-72 w-full overflow-auto rounded-md border border-border bg-white p-1 shadow-lg">
            <button
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onChange(undefined);
                setQuery("");
                setOpen(false);
              }}
              className="flex w-full items-center rounded px-3 py-2 text-left text-sm text-slate-500 hover:bg-slate-50"
            >
              {copy.noAlignment}
            </button>
            {filtered.length === 0 ? (
              <div className="px-3 py-4 text-sm text-slate-400">{copy.noAlignmentResults}</div>
            ) : (
              filtered.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    onChange(option.id);
                    setQuery("");
                    setOpen(false);
                  }}
                  className="group relative flex w-full items-start gap-3 rounded px-3 py-2 text-left hover:bg-blue-50"
                >
                  <span className="mt-0.5 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700">{option.kind}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-slate-900">{option.title}</span>
                    <span className="mt-1 block truncate text-xs text-slate-500">{option.team} / {option.owner} · {option.id}</span>
                  </span>
                  <AlignmentCard option={option} copy={copy} compact />
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function AlignmentCard({ option, copy, compact = false }: { option: AlignmentOption; copy: typeof zh; compact?: boolean }) {
  return (
    <span className={cn(
      "pointer-events-none absolute left-8 top-full z-40 hidden w-[420px] rounded-lg border border-border bg-white p-4 text-left text-slate-700 shadow-xl group-hover:block",
      compact && "left-16 top-10"
    )}>
      <span className="flex items-center justify-between gap-3">
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-slate-950">{option.team} / {option.owner}</span>
          <span className="mt-1 block text-xs text-slate-500">{option.id} · {option.kind}</span>
        </span>
        <Badge tone={option.confidence === "Green" ? "green" : option.confidence === "Red" ? "red" : "yellow"}>{option.confidence}</Badge>
      </span>
      <span className="mt-3 block text-sm font-semibold leading-6 text-slate-900">{option.title}</span>
      {option.parentTitle && (
        <span className="mt-2 block rounded bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-500">
          {copy.parentObjective}: {option.parentTitle}
        </span>
      )}
      <span className="mt-3 flex items-center gap-3 text-xs text-slate-500">
        <span>{copy.progress}: {option.progress === null ? "N/A" : `${option.progress}%`}</span>
      </span>
    </span>
  );
}

async function saveDraft(
  draft: OkrDraft,
  setSaveState: (state: "saved" | "saving" | "dirty" | "error") => void,
  setMessage: (message: string) => void,
  savedMessage: string
): Promise<boolean> {
  setSaveState("saving");
  const response = await fetch("/api/okrs/draft", {
    method: "PUT",
    headers: {
      "content-type": "application/json",
      "x-admin-token": adminToken
    },
    body: JSON.stringify(draft)
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: string };
    setSaveState("error");
    setMessage(body.error ?? "Save failed");
    return false;
  }

  setSaveState("saved");
  setMessage(savedMessage);
  return true;
}

function redistributeWeights(keyResults: EditableKr[]) {
  if (keyResults.length === 0) return [];
  const base = Math.floor((100 / keyResults.length) * 10) / 10;
  return keyResults.map((kr, index) => ({
    ...kr,
    weight: index === keyResults.length - 1 ? Math.round((100 - base * (keyResults.length - 1)) * 10) / 10 : base
  }));
}

function StatusPill({ state, copy }: { state: "saved" | "saving" | "dirty" | "error"; copy: typeof zh }) {
  if (state === "error") return <Badge tone="red"><CircleAlert className="mr-1 h-3 w-3" />{copy.saveError}</Badge>;
  if (state === "saving") return <Badge tone="yellow">{copy.autoSaving}</Badge>;
  if (state === "dirty") return <Badge>{copy.unsaved}</Badge>;
  return <Badge tone="green"><Check className="mr-1 h-3 w-3" />{copy.saved}</Badge>;
}

function MessageList({ title, items, tone }: { title: string; items: string[]; tone: "red" | "yellow" }) {
  if (items.length === 0) return null;
  return (
    <div className={cn("mt-2 text-sm", tone === "red" ? "text-rose-700" : "text-amber-700")}>
      <div className="font-semibold">{title}</div>
      <ul className="mt-1 list-disc space-y-1 pl-5">
        {items.slice(0, 5).map((item) => <li key={item}>{item}</li>)}
      </ul>
    </div>
  );
}

function Textarea({ value, onChange, placeholder, className }: { value: string; onChange: (value: string) => void; placeholder: string; className?: string }) {
  return (
    <textarea
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      rows={2}
      className={cn("min-h-12 w-full resize-y rounded-md border border-transparent bg-transparent px-2 py-1 text-slate-900 outline-none placeholder:text-slate-400 focus:border-blue-200 focus:bg-blue-50", className)}
    />
  );
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-slate-500">{label}</span>
      <span className="mt-1 flex h-9 w-full items-center rounded-md border border-border bg-slate-50 px-3 text-sm font-medium text-slate-700">
        {value}
      </span>
    </label>
  );
}

function NumberInput({ label, value, onChange }: { label: string; value: number | null; onChange: (value: number | null) => void }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-slate-500">{label}</span>
      <input
        type="number"
        min={0}
        max={100}
        step={0.1}
        value={value ?? ""}
        onChange={(event) => {
          const nextValue = parsePercentInput(event.target.value);
          if (nextValue !== undefined) onChange(nextValue);
        }}
        placeholder="暂无"
        className="mt-1 h-10 w-full rounded-md border border-border bg-white px-3 text-sm tabular-nums outline-none focus:border-blue-400"
      />
    </label>
  );
}

function parsePercentInput(value: string) {
  if (value === "") return null;
  const number = Number(value);
  if (!Number.isFinite(number)) return undefined;
  return Math.min(100, Math.max(0, number));
}

function Select({ label, value, options, onChange }: { label: string; value: string; options: readonly string[]; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-slate-500">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 h-9 w-full rounded-md border border-border bg-white px-3 text-sm outline-none focus:border-blue-400"
      >
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  );
}

const zh = {
  editing: "编辑模式",
  objectives: "个 Objective",
  exit: "退出编辑",
  save: "保存",
  publish: "发布",
  addAlignment: "添加对齐",
  noAlignment: "不对齐上级 OKR",
  clearAlignment: "清除对齐",
  searchAlignment: "搜索上级团队的 Objective 或 KR",
  noAlignmentResults: "没有匹配的 OKR",
  parentObjective: "所属 Objective",
  alignedTo: "对齐",
  objectivePlaceholder: "添加 Objective：写清楚本周期最重要的目标",
  krPlaceholder: "添加 Key Result：写一个清晰、可衡量的结果",
  owner: "Owner",
  type: "Type",
  confidence: "Confidence",
  progress: "进度",
  weight: "权重",
  addKr: "添加 Key Result",
  addObjective: "添加 Objective",
  deleteObjective: "删除 Objective",
  deleteKr: "删除 KR",
  draftOnly: "草稿会自动保存，发布后才会影响公开 OKR 页面。",
  saved: "已保存",
  autoSaving: "保存中",
  unsaved: "未保存",
  saveError: "保存失败",
  errors: "必须修复",
  warnings: "建议检查",
  published: "已发布到 OKR 页面",
  publishFailed: "发布失败"
};

const en: typeof zh = {
  editing: "Edit mode",
  objectives: "Objectives",
  exit: "Exit edit",
  save: "Save",
  publish: "Publish",
  addAlignment: "Add alignment",
  noAlignment: "No upper-level alignment",
  clearAlignment: "Clear alignment",
  searchAlignment: "Search upper-level Objective or KR",
  noAlignmentResults: "No matching OKR",
  parentObjective: "Parent Objective",
  alignedTo: "Aligned to",
  objectivePlaceholder: "Add Objective: describe the most important goal for this period",
  krPlaceholder: "Add Key Result: write a clear and measurable result",
  owner: "Owner",
  type: "Type",
  confidence: "Confidence",
  progress: "Progress",
  weight: "Weight",
  addKr: "Add Key Result",
  addObjective: "Add Objective",
  deleteObjective: "Delete Objective",
  deleteKr: "Delete KR",
  draftOnly: "Drafts are auto-saved. Publishing updates the public OKR page.",
  saved: "Saved",
  autoSaving: "Saving",
  unsaved: "Unsaved",
  saveError: "Save failed",
  errors: "Must fix",
  warnings: "Check",
  published: "Published to OKR page",
  publishFailed: "Publish failed"
};

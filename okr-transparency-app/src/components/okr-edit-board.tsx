"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState, useTransition } from "react";
import { ArrowDown, Check, CircleAlert, ClipboardPaste, Link2, Loader2, Lock, Plus, Save, Search, Send, Trash2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { PeriodSwitcher } from "@/components/period-switcher";
import { applyDraftObjectiveScope, calculateObjectiveProgress, createEmptyKr, createEmptyObjective, localizeDraftForLanguage, normalizeDraft, validateDraft, type EditableKr, type EditableObjective, type OkrDraft } from "@/lib/okr/edit-types";
import type { TeamEditPolicy } from "@/lib/admin/permissions";
import type { ConfidenceLevel, OkrType } from "@/lib/okr/types";
import { confidenceChoices, confidenceHelper, typeChoices, typeHelper, type FieldChoice } from "@/lib/okr/field-copy";
import { alignmentOptionMatchesQuery, filterAlignmentOptionGroups, flattenAlignmentOptionGroups, type AlignmentOption } from "@/lib/okr/alignment-options";
import { hrefWithLang, type Lang } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { Period } from "@/lib/periods";
import { applyPastedOkrs, parsePastedOkrs, type PastedOkrApplyMode, type PastedOkrObjective } from "@/lib/okr/paste-import";

type OkrEditBoardProps = {
  initialDraft: OkrDraft;
  lang: Lang;
  alignmentOptions: AlignmentOption[];
  teamOwner: string;
  policy: TeamEditPolicy;
  ownerEmail?: string;
  title?: string;
  periods: Period[];
};


export function OkrEditBoard({ initialDraft, lang, alignmentOptions, teamOwner, policy, ownerEmail, title, periods }: OkrEditBoardProps) {
  const router = useRouter();
  const boardRef = useRef<HTMLDivElement>(null);
  const fixedOwner = teamOwner.trim() || initialDraft.team;
  const ownerScoped = Boolean(ownerEmail);
  const canEditDraft = ownerScoped ? policy.canEdit : policy.canPublish;
  const canPublishDraft = ownerScoped ? canEditDraft : policy.canPublish;
  const defaultAlignmentId = ownerScoped ? alignmentOptions[0]?.id : undefined;
  const objectiveScope = ownerScoped
    ? { objectiveScope: "member" as const, ownerEmail }
    : { objectiveScope: "team" as const };
  const [draft, setDraft] = useState(() => withDefaultAlignment(
    applyDraftObjectiveScope(normalizeDraft(localizeDraftForLanguage(initialDraft, lang), fixedOwner, true), objectiveScope),
    defaultAlignmentId
  ));
  const [saveState, setSaveState] = useState<"saved" | "saving" | "dirty" | "error">("saved");
  const [message, setMessage] = useState("");
  const [publishConfirmOpen, setPublishConfirmOpen] = useState(false);
  const [publishAttempted, setPublishAttempted] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [navigating, startNavigation] = useTransition();
  // Publish runs save → publish → navigate. saveState flips back to "saved" halfway
  // through, so the confirm dialog tracks this instead and stays up until the
  // destination page has actually rendered.
  const publishInFlight = publishing || navigating;
  const [touchedFields, setTouchedFields] = useState<Set<string>>(() => new Set());
  const validation = useMemo(() => validateDraft(draft), [draft]);
  const copy = lang === "en" ? en : zh;
  const typeOptions = useMemo(() => typeChoices(lang), [lang]);
  const confidenceOptions = useMemo(() => confidenceChoices(lang), [lang]);
  const showAlignment = ownerScoped || draft.team !== "Software";

  useEffect(() => {
    if (saveState !== "dirty") return;
    const timer = window.setTimeout(() => {
      void saveDraft(draft, fixedOwner, ownerEmail, setSaveState, setMessage, copy.saved, copy.translationFailed);
    }, 900);
    return () => window.clearTimeout(timer);
  }, [draft, fixedOwner, ownerEmail, saveState, copy.saved, copy.translationFailed]);

  function changeDraft(updater: (current: OkrDraft) => OkrDraft) {
    setSaveState("dirty");
    setDraft(updater);
  }

  function markFieldTouched(fieldKey: string) {
    setTouchedFields((current) => {
      if (current.has(fieldKey)) return current;
      const next = new Set(current);
      next.add(fieldKey);
      return next;
    });
  }

  function requestPublish() {
    setPublishAttempted(true);
    setMessage("");
    if (validation.errors.length > 0) {
      window.requestAnimationFrame(() => {
        const firstError = boardRef.current?.querySelector<HTMLElement>('[data-validation-error="true"]');
        firstError?.scrollIntoView({ behavior: "smooth", block: "center" });
        firstError?.focus({ preventScroll: true });
      });
      return;
    }
    setPublishConfirmOpen(true);
  }

  function updateObjective(objectiveId: string, patch: Partial<EditableObjective>) {
    changeDraft((current) => ({
      ...current,
      objectives: current.objectives.map((objective) =>
        objective.id === objectiveId ? { ...objective, ...patch } : objective
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
              keyResults: objective.keyResults.map((kr) => kr.id === krId ? { ...kr, ...patch } : kr)
            }
          : objective
      )
    }));
  }

  function addObjective() {
    changeDraft((current) => ({
      ...current,
      objectives: [
        ...current.objectives,
        {
          ...createEmptyObjective(current.team, current.periodId, fixedOwner),
          ...objectiveScope,
          alignedToId: defaultAlignmentId
        }
      ]
    }));
  }

  function removeObjective(objectiveId: string) {
    if (!window.confirm(copy.confirmDeleteObjective)) return;
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
          createEmptyKr(objective.id, objective.keyResults.length, fixedOwner, objective.keyResults.length + 1)
        ];
        return { ...objective, keyResults: redistributeWeights(nextKrs) };
      })
    }));
  }

  function removeKr(objectiveId: string, krId: string) {
    if (!window.confirm(copy.confirmDeleteKr)) return;
    changeDraft((current) => ({
      ...current,
      objectives: current.objectives.map((objective) => {
        if (objective.id !== objectiveId) return objective;
        return { ...objective, keyResults: redistributeWeights(objective.keyResults.filter((kr) => kr.id !== krId)) };
      })
    }));
  }

  function importPastedObjectives(objectives: PastedOkrObjective[], mode: PastedOkrApplyMode) {
    changeDraft((current) => withDefaultAlignment(
      applyPastedOkrs(current, objectives, fixedOwner, mode, undefined, objectiveScope),
      defaultAlignmentId
    ));
    setPublishAttempted(false);
    setTouchedFields(new Set());
    setMessage(copy.importApplied(objectives.length));
  }

  function stopPublishing() {
    setPublishing(false);
    setPublishConfirmOpen(false);
  }

  async function publish() {
    setPublishing(true);
    const saveResult = await saveDraft(draft, fixedOwner, ownerEmail, setSaveState, setMessage, copy.saved, copy.translationFailed);
    if (!saveResult.ok) {
      stopPublishing();
      return;
    }

    const response = await fetch("/api/okrs/publish", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ team: draft.team, periodId: draft.periodId, ownerEmail })
    });
    const body = await response.json() as { errors?: string[]; warnings?: string[]; error?: string };
    if (!response.ok) {
      setSaveState("error");
      setMessage(body.error ?? body.errors?.[0] ?? copy.publishFailed);
      stopPublishing();
      return;
    }

    setSaveState("saved");
    setMessage(saveResult.translationWarnings.length > 0 ? `${copy.published} · ${copy.translationFailed}` : copy.published);
    if (saveResult.translationWarnings.length > 0) {
      stopPublishing();
      router.refresh();
      return;
    }
    // Batched with the transition below, so publishInFlight never dips to false:
    // the dialog keeps its spinner until the destination page has rendered.
    setPublishing(false);
    startNavigation(() => {
      router.push(hrefWithLang(overviewHref(draft.team, draft.periodId, ownerEmail), lang));
    });
  }

  return (
    <div ref={boardRef} className="min-w-0">
      <div className="mb-4 flex flex-col gap-3 rounded-lg border border-border bg-white px-5 py-4 shadow-subtle md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-950">{title ?? `${draft.team} OKR`}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <Badge tone="blue">{copy.editing}</Badge>
            <span>{draft.periodId.toUpperCase()}</span>
            <span>{draft.objectives.length} {copy.objectives}</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <PeriodSwitcher selectedPeriod={draft.periodId} selectedTeam={draft.team} selectedMemberEmail={ownerEmail} lang={lang} mode="edit" periodsOverride={periods} />
          <StatusPill state={saveState} copy={copy} />
          <Link
            href={hrefWithLang(overviewHref(draft.team, draft.periodId, ownerEmail), lang)}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <X className="h-4 w-4" />
            {copy.exit}
          </Link>
          <PasteImportButton
            copy={copy}
            disabled={!canEditDraft}
            existingObjectiveCount={draft.objectives.length}
            onApply={importPastedObjectives}
          />
          <button
            type="button"
            onClick={() => saveDraft(draft, fixedOwner, ownerEmail, setSaveState, setMessage, copy.saved, copy.translationFailed)}
            disabled={publishInFlight}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
          >
            <Save className="h-4 w-4" />
            {copy.save}
          </button>
          <button
            type="button"
            onClick={requestPublish}
            disabled={publishInFlight || saveState === "saving" || !canPublishDraft}
            className="inline-flex h-9 items-center gap-2 rounded-md bg-blue-600 px-3 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {publishInFlight ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {publishInFlight ? copy.publishing : copy.publish}
          </button>
        </div>
      </div>

      {(message || (publishAttempted && validation.errors.length > 0)) && (
        <div className="mb-4 rounded-lg border border-border bg-white px-4 py-3 shadow-subtle">
          {message && <div className="text-sm font-medium text-slate-800">{message}</div>}
          {publishAttempted && validation.errors.length > 0 && (
            <>
              <div className="text-sm font-semibold text-rose-700">{copy.fixBeforePublish(validation.errors.length)}</div>
              <div className="mt-1 text-xs text-slate-500">{copy.firstIssueFocused}</div>
              <MessageList items={validation.errors.map((item) => localizeValidationItem(item, copy))} tone="red" />
            </>
          )}
        </div>
      )}

      <div className="space-y-5">
        {draft.objectives.map((objective, objectiveIndex) => {
          const objectiveProgress = calculateObjectiveProgress(objective.keyResults);
          const objectiveLocked = !canEditDraft;
          const objectiveTitleKey = `${objective.id}:title`;
          const objectiveTitleError = !objective.title.trim() && (publishAttempted || touchedFields.has(objectiveTitleKey))
            ? copy.requiredObjective
            : undefined;
          const hasNoKrs = objective.keyResults.length === 0;
          const hasIncompleteTitles = !objective.title.trim() || hasNoKrs || objective.keyResults.some((kr) => !kr.title.trim());
          const krWeightTotal = objective.keyResults.reduce((sum, kr) => sum + (Number.isFinite(kr.weight) ? kr.weight : 0), 0);
          const hasKrWeightError = objective.keyResults.length > 0 && Math.abs(krWeightTotal - 100) > 0.2;
          const alignmentWarning = Boolean(
            objective.title.trim()
            && validation.warnings.some((warning) => warning.startsWith(`O${objectiveIndex + 1}:`) && warning.includes("alignment"))
          );
          return (
          <article key={objective.id} className="overflow-hidden rounded-lg border border-blue-400 bg-white shadow-subtle">
            <div className="grid gap-3 px-5 py-5 lg:grid-cols-[1fr_120px_120px_44px]">
              <div className="min-w-0">
                {showAlignment && (
                  <AlignmentPicker
                    value={objective.alignedToId}
                    options={alignmentOptions}
                    copy={copy}
                    sourceLabel={`O${objectiveIndex + 1}`}
                    onChange={(alignedToId) => updateObjective(objective.id, { alignedToId })}
                    disabled={objectiveLocked}
                    warning={alignmentWarning ? copy.alignmentSuggestion : undefined}
                  />
                )}
                <div className="flex items-start gap-3">
                  <span className="mt-1 rounded-full bg-blue-500 px-3 py-1 text-sm font-semibold text-white">O{objectiveIndex + 1}</span>
                  <Textarea
                    value={objective.title}
                    onChange={(value) => updateObjective(objective.id, { title: value })}
                    onBlur={() => markFieldTouched(objectiveTitleKey)}
                    placeholder={copy.objectivePlaceholder}
                    className="text-xl font-semibold"
                    disabled={objectiveLocked}
                    error={objectiveTitleError}
                  />
                </div>
                {/* Four across only once there is room: beside the 300px sidebar a quarter of this
                    row is 50px, which truncated even a bare "Aspirational" long before it had a gloss. */}
                <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                  <ReadOnlyField label={copy.owner} value={fixedOwner} />
                  <ReadOnlyField label={lang === "en" ? "Scope" : "目标范围"} value={ownerScoped ? (lang === "en" ? "Member Objective" : "成员 Objective") : (lang === "en" ? "Team Objective" : "团队 Objective")} />
                  <Select label={copy.type} value={objective.type} options={typeOptions} onChange={(value) => updateObjective(objective.id, { type: value as OkrType })} disabled={objectiveLocked} helper={typeHelper(objective.type, lang)} />
                  <Select label={copy.confidence} value={objective.confidence} options={confidenceOptions} onChange={(value) => updateObjective(objective.id, { confidence: value as ConfidenceLevel })} disabled={objectiveLocked} helper={confidenceHelper(objective.confidence, lang)} />
                </div>
              </div>
              <ReadOnlyField label={copy.progressPercent} value={objectiveProgress === null ? "N/A" : `${objectiveProgress}%`} />
              <NumberInput label={copy.weight} value={objective.weight} onChange={(value) => updateObjective(objective.id, { weight: value ?? 100 })} disabled={objectiveLocked} />
              <button
                type="button"
                onClick={() => removeObjective(objective.id)}
                disabled={objectiveLocked}
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
                            onBlur={() => markFieldTouched(`${kr.id}:title`)}
                            placeholder={copy.krPlaceholder}
                            className="font-medium"
                            disabled={!canEditDraft && !isEditableOwner(kr.owner, policy.editableOwnerAliases)}
                            error={!kr.title.trim() && (publishAttempted || touchedFields.has(`${kr.id}:title`)) ? copy.requiredKr : undefined}
                          />
                        </div>
                      </div>
                    </div>
                    <NumberInput label={copy.progressPercent} value={kr.progress} onChange={(value) => updateKr(objective.id, kr.id, { progress: value })} disabled={!canEditDraft && !isEditableOwner(kr.owner, policy.editableOwnerAliases)} step={1} placeholder="0–100" />
                    <NumberInput label={copy.weight} value={kr.weight} onChange={(value) => updateKr(objective.id, kr.id, { weight: value ?? 0 })} disabled={!canEditDraft} />
                    <button
                      type="button"
                      onClick={() => removeKr(objective.id, kr.id)}
                      disabled={!canEditDraft}
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
                disabled={!canEditDraft}
                className="inline-flex h-14 items-center gap-2 px-20 text-sm font-semibold text-slate-600 hover:text-blue-700"
              >
                <Plus className="h-4 w-4" />
                {copy.addKr}
              </button>
              {publishAttempted && hasNoKrs && (
                <div
                  tabIndex={-1}
                  data-validation-error="true"
                  className="mx-5 mb-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 outline-none focus:ring-2 focus:ring-rose-200"
                >
                  {copy.atLeastOneKr}
                </div>
              )}
              {publishAttempted && hasKrWeightError && (
                <div
                  tabIndex={-1}
                  data-validation-error="true"
                  className="mx-5 mb-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 outline-none focus:ring-2 focus:ring-rose-200"
                >
                  {copy.krWeightTotal(krWeightTotal)}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between bg-blue-50 px-5 py-3">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Lock className="h-4 w-4" />
                {!publishAttempted && hasIncompleteTitles ? copy.completeToPublish : copy.draftOnly}
              </div>
              <div className="text-sm font-medium text-slate-500">{saveState === "saved" ? copy.saved : copy.autoSaving}</div>
            </div>
          </article>
          );
        })}

        <button
          type="button"
          onClick={addObjective}
          disabled={!canEditDraft}
          className="flex h-20 w-full items-center gap-4 rounded-lg border border-border bg-white px-7 text-lg font-semibold text-slate-500 shadow-subtle hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
        >
          <span className="grid h-10 w-10 place-items-center rounded-full bg-slate-100">
            <Plus className="h-5 w-5" />
          </span>
          {copy.addObjective}
        </button>
      </div>

      {publishConfirmOpen && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-slate-950/35 p-4"
          role="dialog"
          aria-modal="true"
          aria-busy={publishInFlight}
          aria-labelledby="publish-confirm-title"
        >
          <button
            type="button"
            className="absolute inset-0"
            onClick={() => setPublishConfirmOpen(false)}
            disabled={publishInFlight}
            aria-label={copy.cancel}
          />
          <div className="relative w-full max-w-sm rounded-xl border border-border bg-white p-5 shadow-2xl">
            <h2 id="publish-confirm-title" className="text-lg font-semibold text-slate-950">
              {copy.confirmPublishTitle}
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {publishInFlight ? copy.publishingDescription : copy.confirmPublishDescription}
            </p>
            {validation.warnings.length > 0 && (
              <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
                <div className="text-sm font-semibold text-amber-800">{copy.warnings}</div>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-amber-700">
                  {validation.warnings.map((item) => <li key={item}>{localizeValidationItem(item, copy)}</li>)}
                </ul>
              </div>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPublishConfirmOpen(false)}
                disabled={publishInFlight}
                className="h-9 rounded-md px-3 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-400 disabled:hover:bg-transparent"
              >
                {copy.cancel}
              </button>
              <button
                type="button"
                onClick={() => void publish()}
                disabled={publishInFlight}
                className="inline-flex h-9 items-center gap-2 rounded-md bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-400"
              >
                {publishInFlight ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {publishInFlight ? copy.publishing : copy.confirmPublishAction}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PasteImportButton({
  copy,
  disabled,
  existingObjectiveCount,
  onApply
}: {
  copy: typeof zh;
  disabled: boolean;
  existingObjectiveCount: number;
  onApply: (objectives: PastedOkrObjective[], mode: PastedOkrApplyMode) => void;
}) {
  const [open, setOpen] = useState(false);
  const [sourceText, setSourceText] = useState("");
  const [preview, setPreview] = useState<PastedOkrObjective[]>([]);
  const [ignoredLines, setIgnoredLines] = useState<string[]>([]);
  const [mode, setMode] = useState<PastedOkrApplyMode>("append");
  const [error, setError] = useState("");

  const krCount = preview.reduce((total, objective) => total + objective.keyResults.length, 0);
  const previewIsComplete = preview.length > 0 && preview.every((objective) => (
    objective.title.trim() && objective.keyResults.length > 0 && objective.keyResults.every((kr) => kr.trim())
  ));

  function close() {
    setOpen(false);
    setSourceText("");
    setPreview([]);
    setIgnoredLines([]);
    setMode("append");
    setError("");
  }

  function analyze() {
    const result = parsePastedOkrs(sourceText);
    setIgnoredLines(result.ignoredLines);
    setPreview(result.objectives);
    setError(result.objectives.length > 0 ? "" : copy.noObjectivesFound);
  }

  function updateObjectiveTitle(objectiveIndex: number, title: string) {
    setPreview((current) => current.map((objective, index) => (
      index === objectiveIndex ? { ...objective, title } : objective
    )));
  }

  function updateKrTitle(objectiveIndex: number, krIndex: number, title: string) {
    setPreview((current) => current.map((objective, index) => (
      index === objectiveIndex
        ? { ...objective, keyResults: objective.keyResults.map((kr, itemIndex) => itemIndex === krIndex ? title : kr) }
        : objective
    )));
  }

  function apply() {
    if (!previewIsComplete) {
      setError(copy.completeImportPreview);
      return;
    }
    if (mode === "replace" && existingObjectiveCount > 0 && !window.confirm(copy.confirmReplaceDraft)) return;
    onApply(preview, mode);
    close();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={disabled}
        className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
      >
        <ClipboardPaste className="h-4 w-4" />
        {copy.pasteImport}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-slate-950/35 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="paste-import-title"
        >
          <button type="button" className="absolute inset-0" onClick={close} aria-label={copy.cancel} />
          <div className="relative max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-xl border border-border bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="paste-import-title" className="text-lg font-semibold text-slate-950">{copy.pasteImportTitle}</h2>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">{copy.pasteImportDescription}</p>
              </div>
              <button type="button" onClick={close} className="grid h-8 w-8 place-items-center rounded-md text-slate-400 hover:bg-slate-100" aria-label={copy.cancel}>
                <X className="h-4 w-4" />
              </button>
            </div>

            <label className="mt-5 block text-sm font-semibold text-slate-700">
              {copy.sourceText}
              <textarea
                value={sourceText}
                onChange={(event) => setSourceText(event.target.value)}
                rows={9}
                placeholder={copy.pastePlaceholder}
                className="mt-2 w-full resize-y rounded-md border border-border px-3 py-2 font-mono text-sm leading-6 text-slate-900 outline-none placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
            </label>
            <div className="mt-3 flex justify-end">
              <button
                type="button"
                onClick={analyze}
                disabled={!sourceText.trim()}
                className="inline-flex h-9 items-center gap-2 rounded-md bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                <Search className="h-4 w-4" />
                {copy.analyzeText}
              </button>
            </div>

            {error && <div className="mt-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}

            {preview.length > 0 && (
              <div className="mt-5 border-t border-border pt-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="font-semibold text-slate-950">{copy.importPreview}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">{copy.importSummary(preview.length, krCount)}</p>
                  </div>
                  {ignoredLines.length > 0 && (
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-500" title={ignoredLines.join("\n")}>
                      {copy.ignoredLines(ignoredLines.length)}
                    </span>
                  )}
                </div>

                <div className="mt-4 space-y-4">
                  {preview.map((objective, objectiveIndex) => (
                    <div key={objectiveIndex} className="rounded-lg border border-blue-200 bg-blue-50/40 p-4">
                      <div className="flex items-start gap-3">
                        <span className="mt-2 rounded-full bg-blue-500 px-2.5 py-1 text-xs font-semibold text-white">O{objectiveIndex + 1}</span>
                        <textarea
                          value={objective.title}
                          onChange={(event) => updateObjectiveTitle(objectiveIndex, event.target.value)}
                          rows={2}
                          className="min-h-12 flex-1 resize-y rounded-md border border-blue-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 outline-none focus:border-blue-400"
                        />
                      </div>
                      <div className="mt-3 space-y-2 pl-10">
                        {objective.keyResults.map((kr, krIndex) => (
                          <div key={krIndex} className="flex items-start gap-3">
                            <span className="mt-2 min-w-10 text-xs font-semibold text-blue-700">KR{krIndex + 1}</span>
                            <textarea
                              value={kr}
                              onChange={(event) => updateKrTitle(objectiveIndex, krIndex, event.target.value)}
                              rows={2}
                              className="min-h-12 flex-1 resize-y rounded-md border border-border bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-400"
                            />
                          </div>
                        ))}
                        {objective.keyResults.length === 0 && <div className="text-sm text-rose-700">{copy.atLeastOneKr}</div>}
                      </div>
                    </div>
                  ))}
                </div>

                {existingObjectiveCount > 0 && (
                  <fieldset className="mt-5 rounded-lg border border-border p-4">
                    <legend className="px-1 text-sm font-semibold text-slate-700">{copy.importMode}</legend>
                    <label className="flex cursor-pointer items-start gap-3 text-sm text-slate-700">
                      <input type="radio" name="paste-import-mode" value="append" checked={mode === "append"} onChange={() => setMode("append")} className="mt-1" />
                      <span><strong>{copy.appendDraft}</strong><span className="mt-0.5 block text-xs text-slate-500">{copy.appendDraftDescription}</span></span>
                    </label>
                    <label className="mt-3 flex cursor-pointer items-start gap-3 text-sm text-slate-700">
                      <input type="radio" name="paste-import-mode" value="replace" checked={mode === "replace"} onChange={() => setMode("replace")} className="mt-1" />
                      <span><strong>{copy.replaceDraft}</strong><span className="mt-0.5 block text-xs text-rose-600">{copy.replaceDraftDescription}</span></span>
                    </label>
                  </fieldset>
                )}
              </div>
            )}

            <div className="mt-5 flex justify-end gap-2 border-t border-border pt-4">
              <button type="button" onClick={close} className="h-9 rounded-md px-3 text-sm font-medium text-slate-600 hover:bg-slate-100">{copy.cancel}</button>
              <button
                type="button"
                onClick={apply}
                disabled={!previewIsComplete}
                className="inline-flex h-9 items-center gap-2 rounded-md bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                <ClipboardPaste className="h-4 w-4" />
                {copy.applyToDraft}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function AlignmentPicker({
  value,
  options,
  copy,
  sourceLabel,
  onChange,
  disabled = false,
  warning
}: {
  value?: string;
  options: AlignmentOption[];
  copy: typeof zh;
  sourceLabel: string;
  onChange: (value?: string) => void;
  disabled?: boolean;
  warning?: string;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const pickerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const listboxId = useId();
  const selected = options.find((option) => option.id === value);
  const groups = useMemo(() => filterAlignmentOptionGroups(options, query), [options, query]);
  const visibleOptions = useMemo(() => flattenAlignmentOptionGroups(groups), [groups]);
  const optionIndexById = new Map(visibleOptions.map((option, index) => [option.id, index]));
  const activeOptionId = activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined;

  useEffect(() => {
    if (!open) return;
    searchInputRef.current?.focus();
    const handlePointerDown = (event: MouseEvent) => {
      if (!pickerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  function openPicker() {
    const initialOptions = flattenAlignmentOptionGroups(filterAlignmentOptionGroups(options));
    const selectedIndex = initialOptions.findIndex((option) => option.id === value);
    setQuery("");
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : initialOptions.length > 0 ? 0 : -1);
    setOpen(true);
  }

  function updateQuery(nextQuery: string) {
    const nextOptions = flattenAlignmentOptionGroups(filterAlignmentOptionGroups(options, nextQuery));
    const selectedIndex = nextOptions.findIndex((option) => option.id === value);
    const matchingIndex = nextOptions.findIndex((option) => alignmentOptionMatchesQuery(option, nextQuery));
    setQuery(nextQuery);
    setActiveIndex(nextQuery.trim() && matchingIndex >= 0
      ? matchingIndex
      : selectedIndex >= 0 ? selectedIndex : nextOptions.length > 0 ? 0 : -1);
  }

  function choose(option?: AlignmentOption) {
    onChange(option?.id);
    setQuery("");
    setOpen(false);
  }

  function handleSearchKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      return;
    }
    if (visibleOptions.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) => current < 0 ? 0 : (current + 1) % visibleOptions.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => current <= 0 ? visibleOptions.length - 1 : current - 1);
    } else if (event.key === "Enter" && activeIndex >= 0) {
      event.preventDefault();
      choose(visibleOptions[activeIndex]);
    }
  }

  return (
    <div ref={pickerRef} className="mb-4 max-w-3xl rounded-lg border border-blue-200 bg-blue-50/40 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-blue-600">
          <Link2 className="h-4 w-4" />
          {copy.alignmentLabel}
        </span>
        <div className="ml-auto flex items-center gap-2">
          {selected && !disabled && (
            <button
              type="button"
              onClick={() => choose(undefined)}
              className="text-xs font-medium text-slate-500 hover:text-slate-800"
              aria-label={copy.clearAlignment}
            >
              {copy.clearAlignment}
            </button>
          )}
          <button
            type="button"
            onClick={() => open ? setOpen(false) : openPicker()}
            disabled={disabled}
            aria-expanded={open}
            className="inline-flex h-8 items-center gap-1 rounded-md border border-blue-200 bg-white px-2.5 text-xs font-medium text-blue-700 shadow-sm hover:bg-blue-50 disabled:cursor-not-allowed disabled:text-slate-300"
          >
            <Search className="h-3.5 w-3.5" />
            {selected ? copy.changeAlignment : copy.chooseAlignment}
          </button>
        </div>
      </div>

      {selected ? (
        <AlignmentSelectionCard option={selected} copy={copy} />
      ) : (
        <div className="mt-2 rounded-md border border-dashed border-blue-200 bg-white/70 px-3 py-2">
          <div className="text-sm font-medium text-slate-700">{copy.unalignedState}</div>
          <div className="mt-0.5 text-xs text-slate-500">{copy.alignmentOptional}</div>
        </div>
      )}

      {warning && !selected && <div className="mt-2 text-xs font-medium text-amber-700">{warning}</div>}

      {open && (
        <div className="mt-3 rounded-lg border border-blue-200 bg-white p-3 shadow-lg">
          <div className="mb-2">
            <div className="text-sm font-semibold text-slate-900">{copy.chooseFor(sourceLabel)}</div>
            <div className="mt-0.5 text-xs text-slate-500">{copy.hierarchyHint}</div>
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              ref={searchInputRef}
              value={query}
              onChange={(event) => updateQuery(event.target.value)}
              onKeyDown={handleSearchKeyDown}
              disabled={disabled}
              placeholder={copy.searchAlignment}
              role="combobox"
              aria-label={copy.searchAlignment}
              aria-expanded={open}
              aria-controls={listboxId}
              aria-activedescendant={activeOptionId}
              aria-autocomplete="list"
              className="h-10 w-full rounded-md border border-border bg-white pl-9 pr-3 text-sm outline-none focus:border-blue-400"
            />
          </div>
          <div id={listboxId} role="listbox" aria-label={copy.alignmentListLabel} className="mt-2 max-h-80 overflow-auto rounded-md border border-slate-100">
            {visibleOptions.length === 0 ? (
              <div className="px-3 py-4 text-sm text-slate-400">{copy.noAlignmentResults}</div>
            ) : (
              groups.map((group) => {
                const groupLabel = group.objective?.title ?? group.parentTitle ?? copy.otherKeyResults;
                return (
                  <div key={group.key} role="group" aria-label={groupLabel} className="border-b border-slate-100 last:border-b-0">
                    {group.objective && (
                      <AlignmentOptionRow
                        option={group.objective}
                        copy={copy}
                        optionIndex={optionIndexById.get(group.objective.id) ?? -1}
                        listboxId={listboxId}
                        activeIndex={activeIndex}
                        selectedId={value}
                        onActivate={setActiveIndex}
                        onChoose={choose}
                      />
                    )}
                    {group.keyResults.length > 0 && (
                      <div className="ml-6 border-l-2 border-blue-100 bg-slate-50/40 pl-2">
                        {!group.objective && group.parentTitle && (
                          <div className="px-3 pb-1 pt-2 text-xs font-medium text-slate-500">{copy.parentObjective}: {group.parentTitle}</div>
                        )}
                        {group.keyResults.map((option) => (
                          <AlignmentOptionRow
                            key={option.id}
                            option={option}
                            copy={copy}
                            optionIndex={optionIndexById.get(option.id) ?? -1}
                            listboxId={listboxId}
                            activeIndex={activeIndex}
                            selectedId={value}
                            onActivate={setActiveIndex}
                            onChoose={choose}
                            nested
                          />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
          <button
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => choose(undefined)}
            className="mt-2 w-full rounded-md px-3 py-2 text-left hover:bg-slate-50"
          >
            <span className="block text-sm font-medium text-slate-600">{copy.temporarilyUnaligned}</span>
            <span className="mt-0.5 block text-xs text-slate-400">{copy.temporarilyUnalignedHint}</span>
          </button>
        </div>
      )}
    </div>
  );
}

function AlignmentSelectionCard({ option, copy }: { option: AlignmentOption; copy: typeof zh }) {
  return (
    <div className="mt-2 flex items-start gap-3 rounded-md border border-blue-100 bg-white px-3 py-3 shadow-sm">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-600"><ArrowDown className="h-4 w-4" /></span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
          <span className="font-semibold text-blue-700">{option.team}</span>
          <span>/</span>
          <span>{option.owner}</span>
          <span className="rounded bg-blue-50 px-1.5 py-0.5 font-semibold text-blue-700">{option.kind === "O" ? copy.objectiveKind : copy.krKind}</span>
        </div>
        {option.kind === "KR" && option.parentTitle && (
          <div className="mt-2 text-xs leading-5 text-slate-500">{copy.parentObjective}: {option.parentTitle}</div>
        )}
        <div className="mt-1 line-clamp-2 text-sm font-semibold leading-5 text-slate-900">{option.title}</div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
          <span>{copy.progress}: {option.progress === null ? "N/A" : `${option.progress}%`}</span>
          <Badge tone={alignmentTone(option.confidence)}>{option.confidence}</Badge>
        </div>
      </div>
    </div>
  );
}

function AlignmentOptionRow({
  option,
  copy,
  optionIndex,
  listboxId,
  activeIndex,
  selectedId,
  onActivate,
  onChoose,
  nested = false
}: {
  option: AlignmentOption;
  copy: typeof zh;
  optionIndex: number;
  listboxId: string;
  activeIndex: number;
  selectedId?: string;
  onActivate: (index: number) => void;
  onChoose: (option: AlignmentOption) => void;
  nested?: boolean;
}) {
  const isActive = optionIndex === activeIndex;
  const isSelected = option.id === selectedId;
  return (
    <button
      id={`${listboxId}-option-${optionIndex}`}
      type="button"
      role="option"
      tabIndex={-1}
      aria-selected={isSelected}
      onMouseDown={(event) => event.preventDefault()}
      onMouseEnter={() => onActivate(optionIndex)}
      onClick={() => onChoose(option)}
      className={cn(
        "flex w-full items-start gap-3 px-3 py-2.5 text-left",
        nested ? "rounded-md" : "",
        isActive ? "bg-blue-50" : "hover:bg-slate-50",
        isSelected && "ring-1 ring-inset ring-blue-300"
      )}
    >
      <span className={cn(
        "mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold",
        option.kind === "O" ? "bg-blue-100 text-blue-700" : "bg-slate-200 text-slate-700"
      )}>
        {option.kind === "O" ? copy.objectiveKind : copy.krKind}
      </span>
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 text-sm font-semibold leading-5 text-slate-900">{option.title}</span>
        <span className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-slate-500">
          {!nested && <span>{option.team} / {option.owner}</span>}
          {nested && <span>{option.owner}</span>}
          <span>·</span>
          <span>{copy.progress}: {option.progress === null ? "N/A" : `${option.progress}%`}</span>
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-2">
        <Badge tone={alignmentTone(option.confidence)}>{option.confidence}</Badge>
        {isSelected && <Check className="h-4 w-4 text-blue-600" />}
      </span>
    </button>
  );
}

function alignmentTone(confidence: string): "green" | "red" | "yellow" {
  return confidence === "Green" ? "green" : confidence === "Red" ? "red" : "yellow";
}

async function saveDraft(
  draft: OkrDraft,
  fixedOwner: string,
  ownerEmail: string | undefined,
  setSaveState: (state: "saved" | "saving" | "dirty" | "error") => void,
  setMessage: (message: string) => void,
  savedMessage: string,
  translationFailedMessage = "Machine translation failed; original text was saved"
): Promise<{ ok: boolean; translationWarnings: string[] }> {
  setSaveState("saving");
  const response = await fetch("/api/okrs/draft", {
    method: "PUT",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      ...normalizeDraft(draft, fixedOwner, true),
      ownerEmail
    })
  });

  const body = await response.json().catch(() => ({})) as { error?: string; translationWarnings?: string[] };
  if (!response.ok) {
    setSaveState("error");
    setMessage(body.error ?? "Save failed");
    return { ok: false, translationWarnings: [] };
  }

  const translationWarnings = body.translationWarnings ?? [];
  setSaveState("saved");
  setMessage(translationWarnings.length > 0 ? `${savedMessage} · ${translationFailedMessage}` : "");
  return { ok: true, translationWarnings };
}

function overviewHref(team: string, periodId: string, ownerEmail?: string) {
  const params = new URLSearchParams({ team, period: periodId });
  if (ownerEmail) params.set("member", ownerEmail);
  return `/?${params.toString()}`;
}

function redistributeWeights(keyResults: EditableKr[]) {
  if (keyResults.length === 0) return [];
  const base = Math.floor((100 / keyResults.length) * 10) / 10;
  return keyResults.map((kr, index) => ({
    ...kr,
    weight: index === keyResults.length - 1 ? Math.round((100 - base * (keyResults.length - 1)) * 10) / 10 : base
  }));
}

function withDefaultAlignment(draft: OkrDraft, defaultAlignmentId?: string): OkrDraft {
  if (!defaultAlignmentId) return draft;
  return {
    ...draft,
    objectives: draft.objectives.map((objective) => ({
      ...objective,
      alignedToId: objective.alignedToId ?? defaultAlignmentId
    }))
  };
}

function StatusPill({ state, copy }: { state: "saved" | "saving" | "dirty" | "error"; copy: typeof zh }) {
  if (state === "error") return <Badge tone="red"><CircleAlert className="mr-1 h-3 w-3" />{copy.saveError}</Badge>;
  if (state === "saving") return <Badge tone="yellow">{copy.autoSaving}</Badge>;
  if (state === "dirty") return <Badge>{copy.unsaved}</Badge>;
  return <Badge tone="green"><Check className="mr-1 h-3 w-3" />{copy.saved}</Badge>;
}

function MessageList({ items, tone }: { items: string[]; tone: "red" | "yellow" }) {
  if (items.length === 0) return null;
  return (
    <div className={cn("mt-2 text-sm", tone === "red" ? "text-rose-700" : "text-amber-700")}>
      <ul className="list-disc space-y-1 pl-5">
        {items.slice(0, 5).map((item) => <li key={item}>{item}</li>)}
      </ul>
    </div>
  );
}

function localizeValidationItem(item: string, copy: typeof zh) {
  const replacements = [
    [": Objective is required", `: ${copy.requiredObjective}`],
    [": KR title is required", `: ${copy.requiredKr}`],
    [": at least one KR is required", `: ${copy.atLeastOneKr}`],
    [": KR weights must add up to 100%", `: ${copy.krWeightsMustTotal}`],
    [": Owner is required", `: ${copy.ownerRequired}`],
    [": owner is required", `: ${copy.ownerRequired}`],
    [": upper-level alignment is recommended", `: ${copy.alignmentSuggestion}`]
  ] as const;
  const replacement = replacements.find(([suffix]) => item.endsWith(suffix));
  return replacement ? `${item.slice(0, -replacement[0].length)}${replacement[1]}` : item;
}

function Textarea({ value, onChange, onBlur, placeholder, className, disabled = false, error }: {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  placeholder: string;
  className?: string;
  disabled?: boolean;
  error?: string;
}) {
  return (
    <div className="min-w-0 flex-1">
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
        disabled={disabled}
        placeholder={placeholder}
        rows={2}
        aria-invalid={Boolean(error)}
        data-validation-error={error ? "true" : undefined}
        className={cn(
          "min-h-12 w-full resize-y rounded-md border bg-transparent px-2 py-1 text-slate-900 outline-none placeholder:text-slate-400 focus:bg-blue-50",
          error ? "border-rose-300 bg-rose-50/40 focus:border-rose-400" : "border-transparent focus:border-blue-200",
          className
        )}
      />
      {error && <div className="mt-1 px-2 text-xs font-medium text-rose-700">{error}</div>}
    </div>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-slate-500">{label}</span>
      <span className="mt-1 flex h-9 w-full items-center rounded-md border border-border bg-slate-50 px-3 text-sm font-medium text-slate-700">
        {/* Owner names such as "Qiaolong (Collin) Luo" outgrow this box on a 1280px laptop. */}
        <span className="truncate" title={value}>{value}</span>
      </span>
    </label>
  );
}

function NumberInput({ label, value, onChange, disabled = false, step = 0.1, placeholder = "暂无" }: { label: string; value: number | null; onChange: (value: number | null) => void; disabled?: boolean; step?: number; placeholder?: string }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-slate-500">{label}</span>
      <input
        type="number"
        min={0}
        max={100}
        step={step}
        value={value ?? ""}
        onChange={(event) => {
          const nextValue = parsePercentInput(event.target.value);
          if (nextValue !== undefined) onChange(nextValue);
        }}
        disabled={disabled}
        placeholder={placeholder}
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

function Select({ label, value, options, onChange, disabled = false, helper }: { label: string; value: string; options: readonly FieldChoice[]; onChange: (value: string) => void; disabled?: boolean; helper?: string }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-slate-500">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        className="mt-1 h-9 w-full rounded-md border border-border bg-white px-3 text-sm outline-none focus:border-blue-400"
      >
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
      {helper && <span className="mt-1 block text-[11px] leading-4 text-slate-500">{helper}</span>}
    </label>
  );
}

function isEditableOwner(owner: string, aliases: string[]) {
  const normalizedOwner = owner.trim().toLowerCase();
  return Boolean(normalizedOwner) && aliases.some((alias) => alias.trim().toLowerCase() === normalizedOwner);
}

const zh = {
  editing: "编辑模式",
  objectives: "个 Objective",
  exit: "退出编辑",
  save: "保存",
  publish: "发布",
  alignmentLabel: "上级对齐",
  chooseAlignment: "选择",
  changeAlignment: "更换",
  clearAlignment: "清除对齐",
  unalignedState: "当前尚未对齐上级 OKR",
  alignmentOptional: "建议补充对齐关系，但不影响发布。",
  chooseFor: (sourceLabel: string) => `为 ${sourceLabel} 选择上级对齐目标`,
  hierarchyHint: "Objective 与其 Key Result 按层级展示，选择 KR 时会保留所属 Objective。",
  searchAlignment: "搜索上级团队的 Objective 或 KR",
  noAlignmentResults: "没有匹配的 OKR",
  alignmentListLabel: "上级 OKR 候选项",
  temporarilyUnaligned: "暂不对齐",
  temporarilyUnalignedHint: "可以继续填写，并在发布前或之后补充。",
  objectiveKind: "O",
  krKind: "KR",
  otherKeyResults: "其他 Key Result",
  parentObjective: "所属 Objective",
  alignedTo: "对齐",
  objectivePlaceholder: "添加 Objective：写清楚本周期最重要的目标",
  krPlaceholder: "添加 Key Result：写一个清晰、可衡量的结果",
  owner: "Owner",
  type: "类型 Type",
  confidence: "信心 Confidence",
  progress: "进度",
  progressPercent: "进度 (%)",
  weight: "权重",
  addKr: "添加 Key Result",
  addObjective: "添加 Objective",
  pasteImport: "粘贴导入",
  pasteImportTitle: "从文本导入 OKR",
  pasteImportDescription: "粘贴包含 O1、O2 和 KR1、KR2 标记的文本。系统只识别层级，括号中的负责人等内容会原样保留。",
  sourceText: "原始文本",
  pastePlaceholder: "例如：\nO1: Improve software quality\n• KR1: Reduce escaped issues [Xiaojun]",
  analyzeText: "分析文本",
  noObjectivesFound: "没有识别到 Objective，请检查是否包含 O1:、O2: 等标记。",
  completeImportPreview: "请补齐每个 Objective 和 Key Result 后再应用。",
  importPreview: "识别预览",
  importSummary: (objectives: number, krs: number) => `识别到 ${objectives} 个 Objective、${krs} 个 KR，可直接修改识别结果。`,
  ignoredLines: (count: number) => `忽略 ${count} 行非 OKR 文本`,
  importMode: "如何处理当前草稿",
  appendDraft: "追加到当前草稿（推荐）",
  appendDraftDescription: "保留已有 Objective，并在末尾加入识别结果。",
  replaceDraft: "替换当前草稿",
  replaceDraftDescription: "删除当前编辑范围内的 Objective，只保留本次识别结果。",
  confirmReplaceDraft: "确认替换当前草稿？当前编辑范围内已有的 Objective 将被删除，随后自动保存。",
  applyToDraft: "应用到草稿",
  importApplied: (count: number) => `已将 ${count} 个 Objective 应用到草稿，正在自动保存。`,
  deleteObjective: "删除 Objective",
  deleteKr: "删除 KR",
  draftOnly: "草稿会自动保存，发布后才会影响公开 OKR 页面。",
  completeToPublish: "填写 Objective 和至少 1 个 Key Result 后可发布，草稿会自动保存。",
  saved: "已保存",
  autoSaving: "保存中",
  unsaved: "未保存",
  saveError: "保存失败",
  errors: "必须修复",
  warnings: "建议检查",
  requiredObjective: "请填写 Objective",
  requiredKr: "请填写 Key Result",
  atLeastOneKr: "请至少添加 1 个 Key Result",
  krWeightsMustTotal: "KR 权重合计需为 100%",
  ownerRequired: "请选择 Owner",
  alignmentSuggestion: "建议选择对齐的上级 OKR（不影响发布）",
  fixBeforePublish: (count: number) => `还有 ${count} 项需要完善`,
  firstIssueFocused: "已定位到第一处问题，修复后可继续发布。",
  krWeightTotal: (total: number) => `当前 KR 权重合计 ${Math.round(total * 10) / 10}%，发布前需为 100%。`,
  published: "已发布到 OKR 页面",
  translationFailed: "机翻失败，原文已保存；请稍后再次保存",
  publishFailed: "发布失败",
  cancel: "取消",
  confirmDeleteObjective: "确认删除这个 Objective 及其全部 KR？删除后会自动保存草稿。",
  confirmDeleteKr: "确认删除这个 KR？删除后会自动保存草稿。",
  confirmPublishTitle: "发布 OKR？",
  confirmPublishDescription: "发布后，团队页面将立即更新。",
  confirmPublishAction: "确认发布",
  publishing: "发布中…",
  publishingDescription: "正在保存并发布，完成后会自动跳转到 OKR 页面。"
};

const en: typeof zh = {
  editing: "Edit mode",
  objectives: "Objectives",
  exit: "Exit edit",
  save: "Save",
  publish: "Publish",
  alignmentLabel: "Upper-level alignment",
  chooseAlignment: "Choose",
  changeAlignment: "Change",
  clearAlignment: "Clear alignment",
  unalignedState: "Not aligned to an upper-level OKR yet",
  alignmentOptional: "Alignment is recommended but does not block publishing.",
  chooseFor: (sourceLabel: string) => `Choose an upper-level alignment for ${sourceLabel}`,
  hierarchyHint: "Objectives and Key Results are grouped together. A selected KR keeps its parent Objective visible.",
  searchAlignment: "Search upper-level Objective or KR",
  noAlignmentResults: "No matching OKR",
  alignmentListLabel: "Upper-level OKR options",
  temporarilyUnaligned: "Leave unaligned for now",
  temporarilyUnalignedHint: "Continue editing and add the alignment later.",
  objectiveKind: "O",
  krKind: "KR",
  otherKeyResults: "Other Key Results",
  parentObjective: "Parent Objective",
  alignedTo: "Aligned to",
  objectivePlaceholder: "Add Objective: describe the most important goal for this period",
  krPlaceholder: "Add Key Result: write a clear and measurable result",
  owner: "Owner",
  type: "Type",
  confidence: "Confidence",
  progress: "Progress",
  progressPercent: "Progress (%)",
  weight: "Weight",
  addKr: "Add Key Result",
  addObjective: "Add Objective",
  pasteImport: "Paste import",
  pasteImportTitle: "Import OKRs from text",
  pasteImportDescription: "Paste text containing O1, O2 and KR1, KR2 markers. Only hierarchy is detected; owner annotations in brackets remain in the text.",
  sourceText: "Source text",
  pastePlaceholder: "Example:\nO1: Improve software quality\n• KR1: Reduce escaped issues [Xiaojun]",
  analyzeText: "Analyze text",
  noObjectivesFound: "No Objectives found. Check that the text contains markers such as O1: and O2:.",
  completeImportPreview: "Complete every Objective and Key Result before applying.",
  importPreview: "Import preview",
  importSummary: (objectives: number, krs: number) => `${objectives} Objectives and ${krs} KRs found. You can edit the result before applying it.`,
  ignoredLines: (count: number) => `${count} non-OKR ${count === 1 ? "line" : "lines"} ignored`,
  importMode: "How to update this draft",
  appendDraft: "Append to current draft (recommended)",
  appendDraftDescription: "Keep existing Objectives and add the parsed result at the end.",
  replaceDraft: "Replace current draft",
  replaceDraftDescription: "Remove Objectives in the current edit scope and keep only this result.",
  confirmReplaceDraft: "Replace the current draft? Existing Objectives in this edit scope will be removed and the draft will auto-save.",
  applyToDraft: "Apply to draft",
  importApplied: (count: number) => `${count} ${count === 1 ? "Objective has" : "Objectives have"} been applied. Auto-saving now.`,
  deleteObjective: "Delete Objective",
  deleteKr: "Delete KR",
  draftOnly: "Drafts are auto-saved. Publishing updates the public OKR page.",
  completeToPublish: "Complete the Objective and at least one Key Result to publish. Drafts are auto-saved.",
  saved: "Saved",
  autoSaving: "Saving",
  unsaved: "Unsaved",
  saveError: "Save failed",
  errors: "Must fix",
  warnings: "Check",
  requiredObjective: "Enter an Objective",
  requiredKr: "Enter a Key Result",
  atLeastOneKr: "Add at least one Key Result",
  krWeightsMustTotal: "KR weights must add up to 100%",
  ownerRequired: "Select an owner",
  alignmentSuggestion: "Consider aligning to an upper-level OKR (does not block publishing)",
  fixBeforePublish: (count: number) => `${count} ${count === 1 ? "item needs" : "items need"} attention`,
  firstIssueFocused: "The first issue is in focus. Fix it to continue publishing.",
  krWeightTotal: (total: number) => `KR weights currently total ${Math.round(total * 10) / 10}%; they must total 100% before publishing.`,
  published: "Published to OKR page",
  translationFailed: "Machine translation failed; the original text was saved. Please save again later",
  publishFailed: "Publish failed",
  cancel: "Cancel",
  confirmDeleteObjective: "Delete this Objective and all of its KRs? The draft will auto-save.",
  confirmDeleteKr: "Delete this KR? The draft will auto-save.",
  confirmPublishTitle: "Publish OKR?",
  confirmPublishDescription: "The team page will update immediately.",
  confirmPublishAction: "Publish",
  publishing: "Publishing…",
  publishingDescription: "Saving and publishing; you will be taken to the OKR page when it finishes."
};

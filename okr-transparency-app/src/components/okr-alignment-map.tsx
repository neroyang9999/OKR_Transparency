"use client";

import Link from "next/link";
import { ChevronDown, Search } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { confidenceTone } from "@/components/okr-status";
import { Badge } from "@/components/ui/badge";
import type { AdminTeam } from "@/lib/admin/config";
import { hrefWithLang, t, translateText, type Lang } from "@/lib/i18n";
import {
  buildAlignmentMapModel,
  type AlignmentEmptyNote,
  type AlignmentGroup,
  type AlignmentMemberGroup,
  type AlignmentObjective,
  type AlignmentStatusCounts
} from "@/lib/okr/alignment-map";
import { buildEdgePaths, type EdgeInput, type EdgePath } from "@/lib/okr/alignment-edge-path";
import type { ConfidenceLevel, OkrRecord } from "@/lib/okr/types";
import { teamColor, teamInitials } from "@/lib/team-colors";
import { cn } from "@/lib/utils";

type StatusFilter = "all" | ConfidenceLevel;

const statusFilters: StatusFilter[] = ["all", "Red", "Yellow", "Green"];
const dimmed = "opacity-[.14]";

/** The design's canvas height, used until the client can measure the real viewport. */
const designCanvasHeight = 604;
const minCanvasHeight = 420;
/** Path bar + its gap + the page's bottom padding, all of which sit below the canvas. */
const canvasBottomReserve = 80;
/** Width the three columns were drawn for. Beyond it the whole canvas scales up rather than only
 *  the cards growing, so card, gap, and type sizes keep the ratios they were designed at. */
const canvasBaselineWidth = 1900;
const maxCanvasZoom = 1.4;

export function OkrAlignmentMap({
  records,
  teams,
  lang
}: {
  records: OkrRecord[];
  teams: AdminTeam[];
  lang: Lang;
}) {
  const model = useMemo(() => buildAlignmentMapModel(records, teams), [records, teams]);
  const colorOf = useMemo(() => {
    const byTeam = new Map(teams.map((team) => [team.name, team.color]));
    return (team: string) => teamColor(byTeam.get(team));
  }, [teams]);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => new Set());
  const [openMemberGroups, setOpenMemberGroups] = useState<Set<string>>(() => new Set());
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [query, setQuery] = useState("");
  const [pinnedNodeId, setPinnedNodeId] = useState<string | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [edgePaths, setEdgePaths] = useState<EdgePath[]>([]);
  const [canvasHeight, setCanvasHeight] = useState(designCanvasHeight);
  const [canvasZoom, setCanvasZoom] = useState(1);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const columnRefs = useRef<Array<HTMLDivElement | null>>([null, null, null]);

  const translate = useCallback(
    (objective: { title: string; localized?: OkrRecord["localized"] }) =>
      translateText(objective.title, lang, objective.localized?.objective),
    [lang]
  );

  const matches = useCallback(
    (objective: AlignmentObjective) => {
      if (statusFilter !== "all" && objective.confidence !== statusFilter) return false;
      const needle = query.trim().toLowerCase();
      if (!needle) return true;
      return [objective.owner, objective.team, translate(objective)].some((value) =>
        value.toLowerCase().includes(needle)
      );
    },
    [statusFilter, query, translate]
  );

  const filterActive = statusFilter !== "all" || query.trim().length > 0;
  const searching = query.trim().length > 0;

  /** A search should pull the matching roster open on its own, without touching manual state. */
  const searchOpenedGroups = useMemo(() => {
    if (!searching) return new Set<string>();
    return new Set(
      model.memberGroups
        .filter((group) => group.members.some(matches))
        .map((group) => group.nodeId)
    );
  }, [searching, model.memberGroups, matches]);

  const isMemberGroupOpen = (group: AlignmentMemberGroup) =>
    openMemberGroups.has(group.nodeId) || searchOpenedGroups.has(group.nodeId);

  const graph = useMemo(() => {
    const parents = new Map<string, string[]>();
    const children = new Map<string, string[]>();
    model.edges.forEach(({ fromNodeId, toNodeId }) => {
      parents.set(fromNodeId, [...(parents.get(fromNodeId) ?? []), toNodeId]);
      children.set(toNodeId, [...(children.get(toNodeId) ?? []), fromNodeId]);
    });
    return { parents, children };
  }, [model.edges]);

  const activeNodeId = pinnedNodeId ?? hoveredNodeId;
  const chain = useMemo(() => collectChain(activeNodeId, graph), [activeNodeId, graph]);
  const trail = useMemo(() => collectTrail(activeNodeId, graph.parents), [activeNodeId, graph.parents]);

  const nodeIndex = useMemo(() => buildNodeIndex(model, lang), [model, lang]);

  /** Collapsed L1 bands hide their root cards, so their edges re-anchor onto the summary strip. */
  const anchorFallback = useMemo(() => {
    const fallback = new Map<string, string>();
    model.groups.forEach((group) => {
      group.objectives.forEach((objective) => fallback.set(objective.nodeId, group.nodeId));
    });
    return fallback;
  }, [model.groups]);

  const measure = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    /** Grow the canvas to the bottom of the viewport. Offset is taken in document space so a
     *  scrolled page (short viewports, where the floor kicks in) does not feed back into it. */
    const scroller = scrollRef.current;
    if (scroller) {
      const documentTop = scroller.getBoundingClientRect().top + window.scrollY;
      const available = window.innerHeight - documentTop - canvasBottomReserve;
      setCanvasHeight(Math.max(minCanvasHeight, Math.floor(available)));
      /** offsetWidth, not clientWidth: a scrollbar appearing must not feed back into the zoom. */
      setCanvasZoom(zoomForWidth(scroller.offsetWidth));
    }

    const origin = canvas.getBoundingClientRect();
    /** Rects come back in screen pixels; the SVG draws in the canvas's own pre-zoom units. */
    const toLocal = (element: Element) => {
      const rect = element.getBoundingClientRect();
      return {
        left: (rect.left - origin.left) / canvasZoom,
        top: (rect.top - origin.top) / canvasZoom,
        right: (rect.right - origin.left) / canvasZoom,
        bottom: (rect.bottom - origin.top) / canvasZoom
      };
    };

    const anchors = new Map<string, { element: Element; box: ReturnType<typeof toLocal>; column: number }>();
    canvas.querySelectorAll<HTMLElement>("[data-node-id]").forEach((element) => {
      const id = element.dataset.nodeId;
      if (!id || element.offsetParent === null) return;
      anchors.set(id, { element, box: toLocal(element), column: Number(element.dataset.column ?? "0") });
    });

    const resolve = (nodeId: string) => anchors.get(nodeId) ?? anchors.get(anchorFallback.get(nodeId) ?? "");
    const columns = columnRefs.current.flatMap((column) => {
      if (!column) return [];
      const box = toLocal(column);
      return [{ left: box.left, right: box.right }];
    });

    const inputs = model.edges.flatMap((edge): EdgeInput[] => {
      const from = resolve(edge.fromNodeId);
      const to = resolve(edge.toNodeId);
      if (!from || !to || from.element === to.element) return [];
      return [{
        id: edge.id,
        fromNodeId: edge.fromNodeId,
        toNodeId: edge.toNodeId,
        from: from.box,
        to: to.box,
        toColumn: to.column
      }];
    });

    setEdgePaths(buildEdgePaths(inputs, columns));
  }, [model.edges, anchorFallback, canvasZoom]);

  useLayoutEffect(() => {
    /** Measure before the browser paints: a zoom change re-lays the cards out, and edges routed
     *  against the previous layout would show in the wrong place for a frame. */
    measure();
    let firstFrame = 0;
    let secondFrame = 0;
    firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(measure);
    });
    const timers = [window.setTimeout(measure, 120), window.setTimeout(measure, 320)];
    return () => {
      cancelAnimationFrame(firstFrame);
      cancelAnimationFrame(secondFrame);
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [measure, collapsedGroups, openMemberGroups, searchOpenedGroups, statusFilter, lang]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(() => measure());
    observer.observe(canvas);
    window.addEventListener("resize", measure);
    void document.fonts.ready.then(() => measure());
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [measure]);

  /** Two fade-out rules at once would be unreadable, so filtering drops any locked focus. */
  const changeStatusFilter = (status: StatusFilter) => {
    setStatusFilter(status);
    setPinnedNodeId(null);
  };
  const changeQuery = (value: string) => {
    setQuery(value);
    setPinnedNodeId(null);
  };

  const toggle = (setter: typeof setCollapsedGroups) => (id: string) => {
    setter((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const toggleGroup = toggle(setCollapsedGroups);
  const toggleMemberGroup = toggle(setOpenMemberGroups);

  const pin = (nodeId: string) => setPinnedNodeId((current) => (current === nodeId ? null : nodeId));
  const isFaded = (nodeId: string, hit: boolean) =>
    (chain !== null && !chain.has(nodeId)) || (filterActive && !hit);

  const cardState = (nodeId: string, hit: boolean) => ({
    faded: isFaded(nodeId, hit),
    active: activeNodeId === nodeId,
    linked: chain !== null && chain.has(nodeId) && activeNodeId !== nodeId
  });

  if (model.metrics.objectiveCount === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        {t(lang, "noOkrData")}
      </div>
    );
  }

  const hitMembers = model.memberGroups.flatMap((group) => group.members).filter(matches).length;
  const hitGroups = model.memberGroups.filter((group) => group.members.some(matches)).length;

  return (
    <div className="space-y-3 short:space-y-2">
      <MetricsBar model={model} lang={lang} />

      <div className="flex h-[52px] items-center gap-3.5 rounded-[10px] border border-[#e0e6ee] bg-white px-3 shadow-subtle short:h-11 short:gap-3">
        <DensitySwitch
          label={t(lang, "alignGroupDensity")}
          options={[
            { id: "open", label: t(lang, "alignExpand"), active: collapsedGroups.size === 0, onSelect: () => setCollapsedGroups(new Set()) },
            {
              id: "closed",
              label: t(lang, "alignCollapseAll"),
              active: collapsedGroups.size === model.groups.length && model.groups.length > 0,
              onSelect: () => setCollapsedGroups(new Set(model.groups.map((group) => group.nodeId)))
            }
          ]}
        />
        <span className="h-6 w-px flex-none bg-[#eef2f7]" />
        <DensitySwitch
          label={t(lang, "alignMemberDensity")}
          options={[
            { id: "agg", label: t(lang, "alignAggregate"), active: openMemberGroups.size === 0, onSelect: () => setOpenMemberGroups(new Set()) },
            {
              id: "all",
              label: t(lang, "alignExpandAll"),
              active: openMemberGroups.size === model.memberGroups.length && model.memberGroups.length > 0,
              onSelect: () => setOpenMemberGroups(new Set(model.memberGroups.map((group) => group.nodeId)))
            }
          ]}
        />
        <span className="flex-1" />
        <div className="flex flex-none items-center gap-1.5">
          {statusFilters.map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => changeStatusFilter(status)}
              className={cn(
                "inline-flex h-7 items-center gap-1.5 rounded-[7px] border px-2.5 text-xs",
                statusFilter === status
                  ? "border-blue-100 bg-blue-50 font-semibold text-blue-700"
                  : "border-[#e4e9f0] bg-white font-medium text-slate-600 hover:bg-slate-50"
              )}
            >
              {status !== "all" && <span className={cn("h-[7px] w-[7px] rounded-full", confidenceTone[status].ring)} />}
              {status === "all" ? t(lang, "all") : status}
            </button>
          ))}
        </div>
        <span className="h-6 w-px flex-none bg-[#eef2f7]" />
        <label className="inline-flex h-[30px] w-[218px] flex-none items-center gap-[7px] rounded-[7px] border border-[#e4e9f0] bg-slate-50 px-2.5">
          <Search className="h-3.5 w-3.5 shrink-0 text-slate-400" />
          <input
            type="text"
            value={query}
            onChange={(event) => changeQuery(event.target.value)}
            placeholder={t(lang, "alignSearchPlaceholder")}
            className="min-w-0 flex-1 border-0 bg-transparent text-xs text-slate-950 outline-none placeholder:text-slate-400"
          />
        </label>
      </div>

      <div
        ref={scrollRef}
        data-scroll
        style={{ height: canvasHeight }}
        className="overflow-auto rounded-xl border border-[#e0e6ee] bg-[#f5f6f8] shadow-[inset_0_1px_3px_rgba(16,24,40,0.04)]"
      >
        <div ref={canvasRef} style={{ zoom: canvasZoom }} className="relative min-w-[1170px] px-6 pb-7">
          <svg className="pointer-events-none absolute inset-0 z-0 h-full w-full overflow-visible" aria-hidden>
            <defs>
              <marker id="alignment-arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto" markerUnits="strokeWidth">
                <path d="M 0 0 L 7 3.5 L 0 7 z" fill="currentColor" />
              </marker>
            </defs>
            {edgePaths.map((path) => {
              const highlighted = chain !== null && chain.has(path.fromNodeId) && chain.has(path.toNodeId);
              return (
                <path
                  key={path.id}
                  d={path.d}
                  fill="none"
                  className={cn(
                    "transition-[stroke,opacity] duration-150",
                    highlighted ? "text-blue-600" : "text-slate-400"
                  )}
                  stroke="currentColor"
                  strokeWidth={highlighted ? 2.2 : 1.4}
                  opacity={highlighted ? 1 : chain !== null ? 0.06 : 0.5}
                  markerEnd="url(#alignment-arrow)"
                />
              );
            })}
          </svg>

          {/* Columns fill the canvas width, which the zoom above holds at the baseline the design
              was drawn for, so the surplus on a wide monitor scales the map instead of pooling in
              the gaps. The cap keeps ultra-wide screens from stretching cards past readable. */}
          <div className="relative z-[1] mx-auto flex max-w-[1900px] items-start justify-between gap-28">
            <div ref={(element) => { columnRefs.current[0] = element; }} className="min-w-[270px] max-w-[560px] flex-1 basis-0">
              <ColumnHeader
                level="L1"
                title={t(lang, "alignLevelOne")}
                note={lang === "en"
                  ? `${model.columns.l1.teamCount} teams · ${model.columns.l1.objectiveCount} O`
                  : `${model.columns.l1.teamCount} 团队 · ${model.columns.l1.objectiveCount} O`}
              />
              {model.groups.map((group) => (
                <GroupBand
                  key={group.nodeId}
                  group={group}
                  lang={lang}
                  collapsed={collapsedGroups.has(group.nodeId)}
                  onToggle={() => toggleGroup(group.nodeId)}
                >
                  {group.objectives.map((objective) => (
                    <ObjectiveCard
                      key={objective.nodeId}
                      objective={objective}
                      lang={lang}
                      column={0}
                      title={translate(objective)}
                      color={colorOf(objective.team)}
                      showTeam={false}
                      {...cardState(objective.nodeId, matches(objective))}
                      onHover={setHoveredNodeId}
                      onPin={pin}
                    />
                  ))}
                </GroupBand>
              ))}
            </div>

            <div ref={(element) => { columnRefs.current[1] = element; }} className="min-w-[270px] max-w-[560px] flex-1 basis-0">
              <ColumnHeader
                level="L2"
                title={t(lang, "alignLevelTwo")}
                note={lang === "en"
                  ? `${model.columns.l2.teamCount} teams · ${model.columns.l2.objectiveCount} O`
                  : `${model.columns.l2.teamCount} 团队 · ${model.columns.l2.objectiveCount} O`}
              />
              <div className="flex flex-col gap-[9px]">
                {model.secondLevel.map((objective) => (
                  <ObjectiveCard
                    key={objective.nodeId}
                    objective={objective}
                    lang={lang}
                    column={1}
                    title={translate(objective)}
                    color={colorOf(objective.team)}
                    showTeam
                    {...cardState(objective.nodeId, matches(objective))}
                    onHover={setHoveredNodeId}
                    onPin={pin}
                  />
                ))}
                {model.secondLevelNotes.map((note) => (
                  <DashedNote key={noteKey(note)} note={note} lang={lang} variant="second-level" />
                ))}
              </div>
            </div>

            <div ref={(element) => { columnRefs.current[2] = element; }} className="min-w-[296px] max-w-[560px] flex-1 basis-0">
              <ColumnHeader
                level="L3"
                title={t(lang, "alignLevelThree")}
                note={filterActive
                  ? lang === "en"
                    ? `${hitMembers} people · ${hitGroups} groups matched`
                    : `命中 ${hitMembers} 人 · ${hitGroups} 组`
                  : lang === "en"
                    ? `${model.columns.l3.groupCount} groups · ${model.columns.l3.memberCount} people`
                    : `${model.columns.l3.groupCount} 组 · ${model.columns.l3.memberCount} 人`}
              />
              <div className="flex flex-col gap-[9px]">
                {model.memberGroups.map((group) => (
                  <MemberGroupCard
                    key={group.nodeId}
                    group={group}
                    lang={lang}
                    translate={translate}
                    open={isMemberGroupOpen(group)}
                    matches={matches}
                    filterActive={filterActive}
                    {...cardState(group.nodeId, group.members.some(matches))}
                    onToggle={() => toggleMemberGroup(group.nodeId)}
                    onHover={setHoveredNodeId}
                    onPin={pin}
                  />
                ))}
                {model.memberNote && <DashedNote note={model.memberNote} lang={lang} variant="member" />}
              </div>
            </div>
          </div>
        </div>
      </div>

      <PathBar trail={trail} nodeIndex={nodeIndex} lang={lang} />
    </div>
  );
}

function MetricsBar({ model, lang }: { model: ReturnType<typeof buildAlignmentMapModel>; lang: Lang }) {
  const metrics = [
    { value: String(model.metrics.objectiveCount), label: "Objective", tone: "text-slate-950" },
    {
      value: String(model.metrics.memberObjectiveCount),
      label: lang === "en" ? "member O" : "个人 O",
      tone: "text-slate-950"
    },
    {
      value: String(model.metrics.rootCount),
      label: lang === "en" ? "roots (top-level teams)" : "根目标（一级团队）",
      tone: "text-blue-700"
    },
    {
      value: String(model.metrics.unalignedCount),
      label: lang === "en"
        ? `unaligned (of ${model.metrics.shouldAlignCount} that should align)`
        : `未对齐（应对齐 ${model.metrics.shouldAlignCount}）`,
      tone: model.metrics.unalignedCount > 0 ? "text-amber-700" : "text-slate-950"
    },
    {
      value: formatPercent(model.metrics.averageProgress),
      label: lang === "en" ? "average progress" : "平均进度",
      tone: "text-slate-950"
    }
  ];

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      {metrics.map((metric, index) => (
        <div key={metric.label} className="flex items-center gap-4">
          {index > 0 && <span className="h-3.5 w-px bg-slate-200" />}
          <div className="flex items-baseline gap-[7px]">
            <span className={cn("text-[17px] font-bold tabular-nums", metric.tone)}>{metric.value}</span>
            <span className="text-[11.5px] text-muted-foreground">{metric.label}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function DensitySwitch({
  label,
  options
}: {
  label: string;
  options: Array<{ id: string; label: string; active: boolean; onSelect: () => void }>;
}) {
  return (
    <div className="flex flex-none items-center gap-2">
      <span className="text-[11px] font-semibold text-slate-400">{label}</span>
      <div className="flex items-center gap-[3px] rounded-lg bg-slate-100 p-[3px]">
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={option.onSelect}
            className={cn(
              "h-7 rounded-md px-2.5 text-xs font-semibold transition-colors duration-150",
              option.active ? "bg-slate-950 text-white" : "text-slate-600 hover:text-slate-950"
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function ColumnHeader({ level, title, note }: { level: string; title: string; note: string }) {
  return (
    <div className="sticky top-0 z-[6] bg-gradient-to-b from-[#f5f6f8] from-[62%] to-transparent pb-2.5 pt-3.5">
      <div className="flex items-baseline gap-[7px]">
        <span className="text-[9.5px] font-extrabold tracking-[0.12em] text-slate-400">{level}</span>
        <span className="text-[12.5px] font-bold text-slate-950">{title}</span>
        <span className="text-[11px] tabular-nums text-slate-400">{note}</span>
      </div>
    </div>
  );
}

function GroupBand({
  group,
  lang,
  collapsed,
  onToggle,
  children
}: {
  group: AlignmentGroup;
  lang: Lang;
  collapsed: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-4">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!collapsed}
        className="flex w-full items-center gap-[7px] px-0.5 pb-[7px] text-left"
      >
        <ChevronDown
          className={cn("h-3.5 w-3.5 flex-none text-slate-400 transition-transform duration-[180ms]", collapsed && "-rotate-90")}
        />
        <span className="h-[13px] w-[3px] flex-none rounded-sm" style={{ backgroundColor: teamColor(group.color) }} />
        <span className="text-[11.5px] font-bold text-slate-950">{group.team}</span>
        <span className="truncate text-[10.5px] text-slate-400">{group.owner}</span>
        <span className="flex-1" />
        <span className="flex-none text-[10px] tabular-nums text-slate-400">
          {lang === "en"
            ? `${group.objectives.length} roots · ${group.memberCount} people · ${formatPercent(group.averageProgress)}`
            : `${group.objectives.length} 根 · ${group.memberCount} 人 · ${formatPercent(group.averageProgress)}`}
        </span>
      </button>

      {collapsed ? (
        <div
          data-node-id={group.nodeId}
          data-column="0"
          className="flex items-center gap-2 rounded-lg border border-dashed border-slate-300 bg-white px-[11px] py-[9px]"
        >
          <span className="text-[11px] text-muted-foreground">
            {lang === "en"
              ? `${group.objectives.length} root Objectives collapsed`
              : `${group.objectives.length} 个根目标已折叠`}
          </span>
          <StatusDots counts={group.statusCounts} />
          <span className="flex-1" />
          <span className="text-[11px] font-bold tabular-nums text-slate-700">{formatPercent(group.averageProgress)}</span>
        </div>
      ) : (
        <div className="flex flex-col gap-[9px]">{children}</div>
      )}
    </div>
  );
}

function StatusDots({ counts }: { counts: AlignmentStatusCounts }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[10px] text-slate-600">
      {(["Green", "Yellow", "Red"] as const).map((status) => (
        <span key={status} className="inline-flex items-center gap-[3px]">
          <span className={cn("h-1.5 w-1.5 rounded-full", confidenceTone[status].ring)} />
          <span className="tabular-nums">{counts[status]}</span>
        </span>
      ))}
    </span>
  );
}

function ObjectiveCard({
  objective,
  lang,
  column,
  title,
  color,
  showTeam,
  faded,
  active,
  linked,
  onHover,
  onPin
}: {
  objective: AlignmentObjective;
  lang: Lang;
  column: number;
  title: string;
  color: string;
  showTeam: boolean;
  faded: boolean;
  active: boolean;
  linked: boolean;
  onHover: (nodeId: string | null) => void;
  onPin: (nodeId: string) => void;
}) {
  return (
    <article
      data-node-id={objective.nodeId}
      data-column={column}
      onMouseEnter={() => onHover(objective.nodeId)}
      onMouseLeave={() => onHover(null)}
      onClick={() => onPin(objective.nodeId)}
      className={cn(
        "relative cursor-pointer rounded-lg border border-l-[3px] bg-white px-[11px] pb-2.5 pt-[9px] shadow-subtle transition-[opacity,box-shadow] duration-150",
        objective.unaligned ? "border-amber-300" : "border-[#e4e9f0]",
        confidenceTone[objective.confidence].rail,
        faded && dimmed,
        active && "shadow-[0_0_0_2px_#2563eb,0_12px_28px_rgba(37,99,235,0.18)]",
        linked && "shadow-[0_4px_14px_rgba(16,24,40,0.10)]",
        !active && !linked && "hover:shadow-[0_8px_22px_rgba(16,24,40,0.13)]"
      )}
    >
      <div className="mb-[5px] flex items-center gap-1.5">
        <span
          className="grid h-[17px] w-[17px] flex-none place-items-center rounded-full text-[7.5px] font-bold text-white"
          style={{ backgroundColor: color }}
        >
          {teamInitials(objective.owner || objective.team)}
        </span>
        <span className="min-w-0 flex-1 truncate text-[10.5px] text-muted-foreground">
          {showTeam ? (
            <>
              <strong className="font-bold text-slate-600">{objective.team}</strong> · {objective.owner}
            </>
          ) : (
            objective.owner
          )}
        </span>
        <TypeMark type={objective.type} />
      </div>

      <div className="text-[11.5px] font-semibold leading-[1.4] text-slate-950">{title}</div>

      <div className="mt-2 flex items-center gap-2">
        <ProgressBar progress={objective.progress} confidence={objective.confidence} />
        <span className="flex-none text-[11px] font-bold tabular-nums text-slate-700">{formatPercent(objective.progress)}</span>
        <DownstreamMark objective={objective} lang={lang} />
      </div>
    </article>
  );
}

function MemberGroupCard({
  group,
  lang,
  translate,
  open,
  matches,
  filterActive,
  faded,
  active,
  linked,
  onToggle,
  onHover,
  onPin
}: {
  group: AlignmentMemberGroup;
  lang: Lang;
  translate: (objective: { title: string; localized?: OkrRecord["localized"] }) => string;
  open: boolean;
  matches: (objective: AlignmentObjective) => boolean;
  filterActive: boolean;
  faded: boolean;
  active: boolean;
  linked: boolean;
  onToggle: () => void;
  onHover: (nodeId: string | null) => void;
  onPin: (nodeId: string) => void;
}) {
  const total = group.members.length;
  const parentTitle = group.parents[0] ? translate(group.parents[0]) : null;

  return (
    <article
      data-node-id={group.nodeId}
      data-column="2"
      onMouseEnter={() => onHover(group.nodeId)}
      onMouseLeave={() => onHover(null)}
      onClick={() => onPin(group.nodeId)}
      className={cn(
        "relative cursor-pointer overflow-hidden rounded-lg border border-l-[3px] bg-white shadow-subtle transition-[opacity,box-shadow] duration-150",
        group.unalignedCount > 0 ? "border-amber-300" : group.crossLevel ? "border-blue-100" : "border-[#e4e9f0]",
        confidenceTone[group.confidence].rail,
        faded && dimmed,
        active && "shadow-[0_0_0_2px_#2563eb,0_12px_28px_rgba(37,99,235,0.18)]",
        linked && "shadow-[0_4px_14px_rgba(16,24,40,0.10)]"
      )}
    >
      <div
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={(event) => {
          event.stopPropagation();
          onToggle();
        }}
        onKeyDown={(event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          event.stopPropagation();
          onToggle();
        }}
        className="cursor-pointer px-[11px] pb-2.5 pt-[9px] hover:bg-[#fbfcfd]"
      >
        <div className="mb-[7px] flex items-center gap-[7px]">
          <ChevronDown
            className={cn("h-3.5 w-3.5 flex-none text-slate-400 transition-transform duration-[180ms]", !open && "-rotate-90")}
          />
          <span className="flex-none text-[11.5px] font-bold text-slate-950">{group.team}</span>
          {parentTitle && (
            <span className="min-w-0 flex-1 truncate text-[10.5px] text-slate-400">
              {lang === "en" ? `carries “${parentTitle}”` : `承接「${parentTitle}」`}
              {group.parents.length > 1 && ` +${group.parents.length - 1}`}
            </span>
          )}
          {group.crossLevel && <MiniBadge tone="blue">{lang === "en" ? "Cross-level" : "跨级对齐"}</MiniBadge>}
          {group.unalignedCount > 0 && (
            <MiniBadge tone="yellow">
              {lang === "en" ? `Unaligned ${group.unalignedCount}` : `未对齐 ${group.unalignedCount}`}
            </MiniBadge>
          )}
          {!parentTitle && <span className="flex-1" />}
          <span className="flex-none text-[11px] font-bold tabular-nums text-slate-700">
            {lang === "en" ? `${total} people` : `${total} 人`}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className="flex h-1.5 flex-1 overflow-hidden rounded-full bg-[#eef2f7]">
            {(["Green", "Yellow", "Red"] as const).map((status) => (
              <span
                key={status}
                className={confidenceTone[status].fill}
                style={{ width: `${total > 0 ? (group.statusCounts[status] / total) * 100 : 0}%` }}
              />
            ))}
          </span>
          <span className="flex-none text-[10px] tabular-nums text-slate-600">
            {group.statusCounts.Green} / {group.statusCounts.Yellow} / {group.statusCounts.Red}
          </span>
        </div>

        <div className="mt-2 flex items-center gap-2">
          <span className="flex flex-none items-center">
            {group.members.slice(0, 4).map((member, index) => (
              <span
                key={member.nodeId}
                className={cn(
                  "grid h-[19px] w-[19px] place-items-center rounded-full border-[1.5px] border-white text-[7.5px] font-bold text-white",
                  index % 2 === 0 ? "bg-slate-500" : "bg-[#7c8798]",
                  index > 0 && "-ml-1.5"
                )}
                title={member.owner}
              >
                {teamInitials(member.owner)}
              </span>
            ))}
            {total > 4 && (
              <span className="-ml-1.5 grid h-[19px] w-[19px] place-items-center rounded-full border-[1.5px] border-white bg-slate-200 text-[7.5px] font-bold text-slate-600">
                +{total - 4}
              </span>
            )}
          </span>
          <span className="flex-1" />
          <span className="text-[10.5px] text-muted-foreground">{lang === "en" ? "avg" : "平均"}</span>
          <span className="text-[11.5px] font-bold tabular-nums text-slate-700">{formatPercent(group.averageProgress)}</span>
        </div>
      </div>

      {open && (
        <div data-scroll className="flex max-h-[250px] flex-col overflow-auto border-t border-[#eef2f7]">
          {group.members.map((member) => (
            <div
              key={member.nodeId}
              className={cn(
                "flex h-[31px] items-center gap-2 border-b border-[#f5f7fa] px-[11px] last:border-b-0",
                member.confidence === "Red" && "bg-[#fffdf7]",
                filterActive && !matches(member) && dimmed
              )}
            >
              <span className={cn("h-1.5 w-1.5 flex-none rounded-full", confidenceTone[member.confidence].ring)} />
              <span className="w-[74px] flex-none truncate text-[10.5px] font-semibold text-slate-600">{member.owner}</span>
              <span className="min-w-0 flex-1 truncate text-[11px] text-slate-700">{translate(member)}</span>
              {member.unaligned ? (
                <MiniBadge tone="yellow">{lang === "en" ? "Unaligned" : "未对齐"}</MiniBadge>
              ) : (
                <span className="flex-none text-[10.5px] font-bold tabular-nums text-slate-600">
                  {formatPercent(member.progress)}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </article>
  );
}

function DashedNote({ note, lang, variant }: { note: AlignmentEmptyNote; lang: Lang; variant: "second-level" | "member" }) {
  if (note.kind === "team-without-objective") {
    return (
      <div className="flex items-center gap-[7px] rounded-lg border border-dashed border-[#d7dde6] bg-white/55 px-[11px] py-[9px]">
        <span className="h-[13px] w-[3px] flex-none rounded-sm bg-[#c7d2e0]" />
        <span className="flex-none text-[10.5px] font-bold text-muted-foreground">{note.team}</span>
        <span className="min-w-0 flex-1 truncate text-[10.5px] text-slate-400">
          {lang === "en"
            ? `no team O · ${note.memberCount} people${note.crossLevel ? " aligned cross-level" : ""}`
            : `无团队 O · ${note.memberCount} 人${note.crossLevel ? "跨级对齐" : ""}`}
        </span>
      </div>
    );
  }

  const teams = note.teams.join(" / ");
  return (
    <div className="flex items-center gap-[7px] rounded-lg border border-dashed border-[#d7dde6] bg-white/55 px-[11px] py-[9px]">
      <span className="text-[10.5px] leading-[1.5] text-slate-400">
        {variant === "member"
          ? lang === "en" ? `${teams} have no member OKRs this period` : `${teams} 本季无个人 OKR`
          : lang === "en" ? `${teams} have no second-level team OKRs` : `${teams} 无二级团队 OKR`}
      </span>
    </div>
  );
}

function PathBar({
  trail,
  nodeIndex,
  lang
}: {
  trail: string[];
  nodeIndex: Map<string, { label: string; okrId?: string; downstream: number; isRoot: boolean }>;
  lang: Lang;
}) {
  const focused = trail.length > 0 ? nodeIndex.get(trail[trail.length - 1]) : undefined;

  return (
    <div className="flex h-11 items-center gap-2 overflow-hidden rounded-[10px] border border-[#e0e6ee] bg-white px-3 shadow-subtle">
      {trail.length === 0 ? (
        <span className="text-[11.5px] text-slate-400">{t(lang, "alignPathHint")}</span>
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
          {trail.map((nodeId, index) => {
            const node = nodeIndex.get(nodeId);
            if (!node) return null;
            const current = index === trail.length - 1;
            return (
              <span key={nodeId} className="flex min-w-0 items-center gap-2">
                {index > 0 && <span className="flex-none text-[11px] text-slate-400">→</span>}
                <span
                  className={cn(
                    "max-w-[280px] truncate rounded-md border px-[9px] py-[3px] text-[11.5px]",
                    current ? "border-blue-200 bg-blue-50 font-semibold text-blue-700" : "border-[#e4e9f0] bg-slate-50 text-slate-600"
                  )}
                  title={node.label}
                >
                  {node.label}
                </span>
              </span>
            );
          })}
          {focused?.isRoot && (
            <span className="flex-none text-[11px] text-slate-400">{t(lang, "alignRootNote")}</span>
          )}
          {focused && focused.downstream > 0 && (
            <span className="flex-none text-[11px] text-slate-400">
              {lang === "en" ? `${focused.downstream} aligned below` : `下级对齐 ${focused.downstream}`}
            </span>
          )}
          <span className="flex-1" />
          {focused?.okrId && (
            <Link
              href={hrefWithLang(`/okr/${encodeURIComponent(focused.okrId)}`, lang)}
              className="flex-none rounded-md border border-[#e4e9f0] px-[9px] py-[3px] text-[11.5px] font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-950"
            >
              {lang === "en" ? "Open detail" : "查看详情"}
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

function ProgressBar({ progress, confidence }: { progress: number | null; confidence: ConfidenceLevel }) {
  return (
    <span className="h-1 flex-1 overflow-hidden rounded-full bg-[#eef2f7]">
      <span
        className={cn("block h-full rounded-full", confidenceTone[confidence].fill)}
        style={{ width: `${Math.round((progress ?? 0) * 100)}%` }}
      />
    </span>
  );
}

function DownstreamMark({ objective, lang }: { objective: AlignmentObjective; lang: Lang }) {
  if (objective.unaligned) {
    return <MiniBadge tone="yellow">{lang === "en" ? "Unaligned" : "未对齐"}</MiniBadge>;
  }
  if (objective.alignedChildCount === 0 && objective.memberCount === 0) {
    return <MiniBadge tone="yellow">{lang === "en" ? "No downstream" : "无下级"}</MiniBadge>;
  }

  const parts = [
    objective.alignedChildCount > 0 ? String(objective.alignedChildCount) : null,
    objective.memberCount > 0 ? (lang === "en" ? `${objective.memberCount} people` : `${objective.memberCount} 人`) : null
  ].filter(Boolean);

  return (
    <span className="inline-flex flex-none items-center gap-[3px] rounded-[5px] bg-slate-100 px-[5px] py-0.5 text-[9.5px] font-semibold text-slate-600">
      ↳ {parts.join(" · ")}
    </span>
  );
}

function TypeMark({ type }: { type: AlignmentObjective["type"] }) {
  const tone = type === "Committed" ? "blue" : type === "Aspirational" ? "yellow" : "gray";
  return (
    <Badge tone={tone} className="flex-none rounded px-1 py-px text-[9px] font-bold leading-none" title={type}>
      {type[0]}
    </Badge>
  );
}

function MiniBadge({ tone, children }: { tone: "blue" | "yellow"; children: React.ReactNode }) {
  return (
    <Badge tone={tone} className="flex-none rounded px-[5px] py-px text-[9.5px] font-bold leading-[1.4]">
      {children}
    </Badge>
  );
}

function buildNodeIndex(model: ReturnType<typeof buildAlignmentMapModel>, lang: Lang) {
  const index = new Map<string, { label: string; okrId?: string; downstream: number; isRoot: boolean }>();

  [...model.groups.flatMap((group) => group.objectives), ...model.secondLevel].forEach((objective) => {
    index.set(objective.nodeId, {
      label: translateText(objective.title, lang, objective.localized?.objective),
      okrId: objective.okrId,
      downstream: objective.alignedChildCount + objective.memberCount,
      isRoot: objective.isRoot
    });
  });

  model.memberGroups.forEach((group) => {
    index.set(group.nodeId, {
      label: lang === "en" ? `${group.team} carrier group` : `${group.team} 承接组`,
      downstream: group.members.length,
      isRoot: false
    });
  });

  return index;
}

function collectChain(
  activeNodeId: string | null,
  graph: { parents: Map<string, string[]>; children: Map<string, string[]> }
) {
  if (!activeNodeId) return null;
  const chain = new Set<string>([activeNodeId]);
  const walk = (nodeId: string, edges: Map<string, string[]>) => {
    (edges.get(nodeId) ?? []).forEach((next) => {
      if (chain.has(next)) return;
      chain.add(next);
      walk(next, edges);
    });
  };
  walk(activeNodeId, graph.parents);
  walk(activeNodeId, graph.children);
  return chain;
}

function collectTrail(activeNodeId: string | null, parents: Map<string, string[]>) {
  if (!activeNodeId) return [];
  const trail = [activeNodeId];
  const seen = new Set(trail);
  let current = activeNodeId;

  for (;;) {
    const parent = parents.get(current)?.[0];
    if (!parent || seen.has(parent)) return trail;
    seen.add(parent);
    trail.unshift(parent);
    current = parent;
  }
}

/** Never below 1: a canvas narrower than the baseline already scrolls, and shrinking it further
 *  would only make the type smaller. Firefox shipped `zoom` in 126, and where it is missing the
 *  canvas has to stay at 1× rather than draw its edges against a scale the cards never got. */
function zoomForWidth(width: number) {
  if (!CSS.supports("zoom", "1.2")) return 1;
  const zoom = Math.round((width / canvasBaselineWidth) * 100) / 100;
  return Math.min(maxCanvasZoom, Math.max(1, zoom));
}

function noteKey(note: AlignmentEmptyNote) {
  return note.kind === "team-without-objective" ? `${note.kind}:${note.team}` : `${note.kind}:${note.teams.join(",")}`;
}

function formatPercent(value: number | null) {
  return value === null ? "N/A" : `${Math.round(value * 100)}%`;
}

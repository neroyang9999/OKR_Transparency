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

/** What the band chrome renders, shared by the L1 and L2 columns. */
type AlignmentBand = Pick<AlignmentGroup, "nodeId" | "team" | "owner" | "color" | "statusCounts" | "averageProgress">;

const statusFilters: StatusFilter[] = ["all", "Red", "Yellow", "Green"];
const dimmed = "opacity-[.14]";
/** A band folds itself on first paint from this many Objectives up. Below it the rows cost less
 *  scroll than the click needed to reveal them. */
const secondLevelAutoCollapseFrom = 3;
/** Breathing room between two cards of one column that land on the same row. */
const liftStackGap = 8;
/** A lifted stack stops here rather than at the canvas top: the sticky column header covers the
 *  first 43px, and a band header travelling with its cards needs its own 24px above the first of
 *  them. Landing above this line puts one of the two outside the scroll container. */
const liftTopReserve = 68;

/** The design's canvas height, used until the client can measure the real viewport. */
const designCanvasHeight = 604;
const minCanvasHeight = 420;
/** Path bar + its gap + the page's bottom padding, all of which sit below the canvas. */
const canvasBottomReserve = 80;
/** Width the three columns were drawn for. Beyond it the whole canvas scales up rather than only
 *  the cards growing, so card, gap, and type sizes keep the ratios they were designed at. */
const canvasBaselineWidth = 1900;
const maxCanvasZoom = 1.4;
/** How long the edges keep following the cards after a layout change. The cards glide for 150ms
 *  (`duration-150`); the rest is headroom for a band that opened on the way and for the frame the
 *  browser spends laying the column out again. Frames past the last movement cost a comparison. */
const edgeFollowDuration = 320;

export function OkrAlignmentMap({
  records,
  teams,
  teamOwners,
  lang
}: {
  records: OkrRecord[];
  teams: AdminTeam[];
  teamOwners: Record<string, string>;
  lang: Lang;
}) {
  const model = useMemo(() => buildAlignmentMapModel(records, teams, teamOwners), [records, teams, teamOwners]);
  const colorOf = useMemo(() => {
    const byTeam = new Map(teams.map((team) => [team.name, team.color]));
    return (team: string) => teamColor(byTeam.get(team));
  }, [teams]);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => new Set());
  /** Bands past a few Objectives start folded, so the first paint is already short. Leaving them
   *  open would hand the shorter column only to whoever thinks to click. */
  const [collapsedSecondLevel, setCollapsedSecondLevel] = useState<Set<string>>(
    () =>
      new Set(
        model.secondLevelGroups
          .filter((band) => band.objectives.length >= secondLevelAutoCollapseFrom)
          .map((band) => band.nodeId)
      )
  );
  const [openMemberGroups, setOpenMemberGroups] = useState<Set<string>>(() => new Set());
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [query, setQuery] = useState("");
  const [pinnedNodeId, setPinnedNodeId] = useState<string | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [edgePaths, setEdgePaths] = useState<EdgePath[]>([]);
  /** Vertical offsets that bring the focused chain onto one row. Derived from the resting layout,
   *  so it is computed in an effect rather than during render. */
  const [lift, setLift] = useState<Map<string, number>>(() => new Map());
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

  /** Same for a folded band: swallowing its matches would make the search look broken. */
  const searchOpenedBands = useMemo(() => {
    if (!searching) return new Set<string>();
    return new Set(
      [...model.groups, ...model.secondLevelGroups]
        .filter((band) => band.objectives.some(matches))
        .map((band) => band.nodeId)
    );
  }, [searching, model.groups, model.secondLevelGroups, matches]);

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

  /** Edges routed onto the same pair of anchors come back with the same geometry, so draw one
   *  stroke and let it light up for any of the pairs it stands for. */
  const drawnEdges = useMemo(() => {
    const byShape = new Map<string, { id: string; d: string; endpoints: Array<[string, string]> }>();
    edgePaths.forEach((path) => {
      const shape = byShape.get(path.d);
      if (shape) {
        shape.endpoints.push([path.fromNodeId, path.toNodeId]);
        return;
      }
      byShape.set(path.d, { id: path.id, d: path.d, endpoints: [[path.fromNodeId, path.toNodeId]] });
    });
    return Array.from(byShape.values());
  }, [edgePaths]);

  /** Split once instead of per path: routes that coincide have to be composited together, and
   *  that only works if the whole set shares one opacity. */
  const [litEdges, dimEdges] = useMemo(() => {
    const lit: typeof drawnEdges = [];
    const dim: typeof drawnEdges = [];
    drawnEdges.forEach((edge) => {
      const onChain = chain !== null
        && edge.endpoints.some(([fromNodeId, toNodeId]) => chain.has(fromNodeId) && chain.has(toNodeId));
      (onChain ? lit : dim).push(edge);
    });
    return [lit, dim];
  }, [drawnEdges, chain]);

  /** A folded band renders a summary strip instead of its cards, so the edges those cards owned
   *  re-anchor onto the strip. Applied to both sides of an edge by `resolve` below. */
  const anchorFallback = useMemo(() => {
    const fallback = new Map<string, string>();
    [...model.groups, ...model.secondLevelGroups].forEach((band) => {
      band.objectives.forEach((objective) => fallback.set(objective.nodeId, band.nodeId));
    });
    return fallback;
  }, [model.groups, model.secondLevelGroups]);

  /** A folded band on the focused chain opens itself. Lifting its summary strip instead would put
   *  "4 Objectives collapsed" beside the card that carries them, which says nothing about which
   *  one it is -- and leaves the team name behind on the band header. Only bands in other columns
   *  ever open this way, so the card under the cursor never moves. */
  const chainOpenedBands = useMemo(() => {
    const bands = new Set<string>();
    chain?.forEach((nodeId) => {
      const band = anchorFallback.get(nodeId);
      if (band) bands.add(band);
    });
    return bands;
  }, [chain, anchorFallback]);

  const isBandCollapsed = (nodeId: string, collapsed: Set<string>) =>
    collapsed.has(nodeId) && !searchOpenedBands.has(nodeId) && !chainOpenedBands.has(nodeId);


  /** Grow the canvas to the bottom of the viewport. Offset is taken in document space so a
   *  scrolled page (short viewports, where the floor kicks in) does not feed back into it. Kept
   *  apart from the routing below, which runs every frame of a card transition and must not be
   *  writing viewport state at 60fps. */
  const measureViewport = useCallback(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    const documentTop = scroller.getBoundingClientRect().top + window.scrollY;
    const available = window.innerHeight - documentTop - canvasBottomReserve;
    setCanvasHeight(Math.max(minCanvasHeight, Math.floor(available)));
    /** offsetWidth, not clientWidth: a scrollbar appearing must not feed back into the zoom. */
    setCanvasZoom(zoomForWidth(scroller.offsetWidth));
  }, []);

  const routeEdges = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

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

    /** Routing runs on every frame of a transition, so most calls land on geometry that has not
     *  moved. Bailing out here keeps those frames from re-rendering the whole map. */
    const next = buildEdgePaths(inputs, columns);
    setEdgePaths((current) => (sameEdgePaths(current, next) ? current : next));
  }, [model.edges, anchorFallback, canvasZoom]);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    /** Read the layout back here rather than reusing the measuring pass: a band that just opened
     *  for this chain moved everything below it, and offsets computed against the layout as it was
     *  a moment ago would land the cards short. Keeping the previous map when nothing moved stops
     *  an unchanged focus from re-measuring. */
    setLift((current) => {
      const next = buildLift(activeNodeId, chain, readRestingBoxes(canvas, canvasZoom), anchorFallback);
      return sameLift(current, next) ? current : next;
    });
  }, [activeNodeId, chain, chainOpenedBands, anchorFallback, canvasZoom]);

  useLayoutEffect(() => {
    /** Both before the browser paints: the canvas is still at its design height until this runs,
     *  and a zoom change re-lays the cards out -- edges routed against the previous layout would
     *  show in the wrong place for a frame. */
    measureViewport();
    routeEdges();
    /** With the transitions off the cards are already where they are going to be, so one pass is
     *  the whole job -- and a frame loop would be motion nobody asked for. */
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    /** Then follow the cards frame by frame until they have settled. The cards interpolate their
     *  transform on the compositor, so anything less than every frame leaves the line parked while
     *  the card is already halfway across, and the catch-up reads as a jump rather than as the
     *  same movement. Sampling this a handful of times is what made the bundle look unnatural. */
    let frame = 0;
    let start: number | null = null;
    const step = (now: number) => {
      if (start === null) start = now;
      routeEdges();
      if (now - start < edgeFollowDuration) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [
    measureViewport,
    routeEdges,
    lift,
    chainOpenedBands,
    collapsedGroups,
    collapsedSecondLevel,
    openMemberGroups,
    searchOpenedGroups,
    searchOpenedBands,
    statusFilter,
    lang
  ]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const sync = () => {
      measureViewport();
      routeEdges();
    };
    const observer = new ResizeObserver(sync);
    observer.observe(canvas);
    window.addEventListener("resize", sync);
    void document.fonts.ready.then(sync);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", sync);
    };
  }, [measureViewport, routeEdges]);

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
  const toggleSecondLevel = toggle(setCollapsedSecondLevel);
  const toggleMemberGroup = toggle(setOpenMemberGroups);

  const pin = (nodeId: string) => setPinnedNodeId((current) => (current === nodeId ? null : nodeId));
  const isFaded = (nodeId: string, hit: boolean) =>
    (chain !== null && !chain.has(nodeId)) || (filterActive && !hit);

  /** The band chrome has to move and fade with its contents. A header left behind while its cards
   *  float away ends up below its own group, and a strip left solid shows through the gaps between
   *  the cards a lift floats over it. */
  const bandState = (band: { nodeId: string; objectives: AlignmentObjective[] }, collapsed: boolean) => ({
    faded:
      (chain !== null && !band.objectives.some((objective) => chain.has(objective.nodeId)))
      || (filterActive && !band.objectives.some(matches)),
    lift: collapsed
      ? lift.get(band.nodeId)
      : band.objectives.map((objective) => lift.get(objective.nodeId)).find((offset) => offset !== undefined)
  });

  const cardState = (nodeId: string, hit: boolean) => ({
    faded: isFaded(nodeId, hit),
    active: activeNodeId === nodeId,
    linked: chain !== null && chain.has(nodeId) && activeNodeId !== nodeId,
    lift: lift.get(nodeId)
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
          label={t(lang, "alignSecondLevelDensity")}
          options={[
            {
              id: "open",
              label: t(lang, "alignExpand"),
              active: collapsedSecondLevel.size === 0,
              onSelect: () => setCollapsedSecondLevel(new Set())
            },
            {
              id: "closed",
              label: t(lang, "alignCollapseAll"),
              active: collapsedSecondLevel.size === model.secondLevelGroups.length && model.secondLevelGroups.length > 0,
              onSelect: () => setCollapsedSecondLevel(new Set(model.secondLevelGroups.map((band) => band.nodeId)))
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
              {/* `currentColor` inside a marker resolves against the defs, not the referencing
                  path, so each colour needs its own -- otherwise every arrowhead comes out black. */}
              <marker id="alignment-arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto" markerUnits="strokeWidth">
                <path d="M 0 0 L 7 3.5 L 0 7 z" fill="#94a3b8" />
              </marker>
              <marker id="alignment-arrow-lit" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto" markerUnits="strokeWidth">
                <path d="M 0 0 L 7 3.5 L 0 7 z" fill="#2563eb" />
              </marker>
            </defs>
            {/* The alpha sits on the group, not the paths: coinciding routes are drawn on top of
                each other, and per-path opacity would compound where they overlap and turn a shared
                stretch into a darker line. */}
            <g
              className="text-slate-400 transition-opacity duration-150"
              opacity={chain !== null ? 0.06 : 0.5}
            >
              {dimEdges.map((edge) => (
                <path
                  key={edge.id}
                  d={edge.d}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.4}
                  markerEnd="url(#alignment-arrow)"
                />
              ))}
            </g>
            <g className="text-blue-600">
              {litEdges.map((edge) => (
                <path
                  key={edge.id}
                  d={edge.d}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2.2}
                  markerEnd="url(#alignment-arrow-lit)"
                />
              ))}
            </g>
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
              {model.groups.map((group) => {
                const collapsed = isBandCollapsed(group.nodeId, collapsedGroups);
                return (
                <GroupBand
                  key={group.nodeId}
                  band={group}
                  column={0}
                  stats={lang === "en"
                    ? `${group.objectives.length} roots · ${group.memberCount} people · ${formatPercent(group.averageProgress)}`
                    : `${group.objectives.length} 根 · ${group.memberCount} 人 · ${formatPercent(group.averageProgress)}`}
                  collapsedLabel={lang === "en"
                    ? `${group.objectives.length} root Objectives collapsed`
                    : `${group.objectives.length} 个根目标已折叠`}
                  collapsed={collapsed}
                  {...bandState(group, collapsed)}
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
                );
              })}
            </div>

            <div ref={(element) => { columnRefs.current[1] = element; }} className="min-w-[270px] max-w-[560px] flex-1 basis-0">
              <ColumnHeader
                level="L2"
                title={t(lang, "alignLevelTwo")}
                note={lang === "en"
                  ? `${model.columns.l2.teamCount} teams · ${model.columns.l2.objectiveCount} O`
                  : `${model.columns.l2.teamCount} 团队 · ${model.columns.l2.objectiveCount} O`}
              />
              {model.secondLevelGroups.map((band) => {
                const collapsed = isBandCollapsed(band.nodeId, collapsedSecondLevel);
                return (
                <GroupBand
                  key={band.nodeId}
                  band={band}
                  column={1}
                  stats={lang === "en"
                    ? `${band.objectives.length} O · ${band.memberCount} people · ${formatPercent(band.averageProgress)}`
                    : `${band.objectives.length} O · ${band.memberCount} 人 · ${formatPercent(band.averageProgress)}`}
                  collapsedLabel={lang === "en"
                    ? `${band.objectives.length} Objectives collapsed`
                    : `${band.objectives.length} 个目标已折叠`}
                  collapsed={collapsed}
                  {...bandState(band, collapsed)}
                  onToggle={() => toggleSecondLevel(band.nodeId)}
                >
                  {band.objectives.map((objective) => (
                    <ObjectiveCard
                      key={objective.nodeId}
                      objective={objective}
                      lang={lang}
                      column={1}
                      title={translate(objective)}
                      color={colorOf(objective.team)}
                      showTeam={false}
                      {...cardState(objective.nodeId, matches(objective))}
                      onHover={setHoveredNodeId}
                      onPin={pin}
                    />
                  ))}
                </GroupBand>
                );
              })}
              <div className="flex flex-col gap-[9px]">
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
  band,
  column,
  stats,
  collapsedLabel,
  collapsed,
  faded,
  lift,
  onToggle,
  children
}: {
  band: AlignmentBand;
  column: number;
  stats: string;
  collapsedLabel: string;
  collapsed: boolean;
  faded: boolean;
  lift?: number;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-4">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!collapsed}
        style={liftStyle(lift)}
        className={cn(
          "flex w-full items-center gap-[7px] px-0.5 pb-[7px] text-left",
          "transition-[opacity,transform] duration-150 motion-reduce:transition-none",
          faded && dimmed
        )}
      >
        <ChevronDown
          className={cn("h-3.5 w-3.5 flex-none text-slate-400 transition-transform duration-[180ms]", collapsed && "-rotate-90")}
        />
        <span className="h-[13px] w-[3px] flex-none rounded-sm" style={{ backgroundColor: teamColor(band.color) }} />
        <span className="flex-none text-[11.5px] font-bold text-slate-950">{band.team}</span>
        <span className="min-w-0 truncate text-[10.5px] text-slate-400">{band.owner}</span>
        <span className="flex-1" />
        <span className="flex-none text-[10px] tabular-nums text-slate-400">{stats}</span>
      </button>

      {collapsed ? (
        <div
          data-node-id={band.nodeId}
          data-column={column}
          style={liftStyle(lift)}
          className={cn(
            "flex items-center gap-2 rounded-lg border border-dashed border-slate-300 bg-white px-[11px] py-[9px]",
            "transition-[opacity,transform] duration-150 motion-reduce:transition-none",
            faded && dimmed,
            lift !== undefined && liftedCard
          )}
        >
          <span className="flex-none text-[11px] text-muted-foreground">{collapsedLabel}</span>
          <StatusDots counts={band.statusCounts} />
          <span className="flex-1" />
          <span className="flex-none text-[11px] font-bold tabular-nums text-slate-700">{formatPercent(band.averageProgress)}</span>
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
  lift,
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
  lift?: number;
  onHover: (nodeId: string | null) => void;
  onPin: (nodeId: string) => void;
}) {
  /** Inside its band the header already names the team. Lifted, the card has left that header
   *  behind, so it has to carry the name itself. */
  const showTeamName = showTeam || lift !== undefined;

  return (
    <article
      data-node-id={objective.nodeId}
      data-column={column}
      onMouseEnter={() => onHover(objective.nodeId)}
      onMouseLeave={() => onHover(null)}
      onClick={() => onPin(objective.nodeId)}
      style={liftStyle(lift)}
      className={cn(
        "relative cursor-pointer rounded-lg border border-l-[3px] bg-white px-[11px] pb-2.5 pt-[9px] shadow-subtle",
        "transition-[opacity,box-shadow,transform] duration-150 motion-reduce:transition-none",
        objective.unaligned ? "border-amber-300" : "border-[#e4e9f0]",
        confidenceTone[objective.confidence].rail,
        faded && dimmed,
        active && "shadow-[0_0_0_2px_#2563eb,0_12px_28px_rgba(37,99,235,0.18)]",
        linked && "shadow-[0_4px_14px_rgba(16,24,40,0.10)]",
        !active && !linked && "hover:shadow-[0_8px_22px_rgba(16,24,40,0.13)]",
        lift !== undefined && liftedCard
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
          {showTeamName ? (
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
  lift,
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
  lift?: number;
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
      style={liftStyle(lift)}
      className={cn(
        "relative cursor-pointer overflow-hidden rounded-lg border border-l-[3px] bg-white shadow-subtle",
        "transition-[opacity,box-shadow,transform] duration-150 motion-reduce:transition-none",
        group.unalignedCount > 0 ? "border-amber-300" : group.crossLevel ? "border-blue-100" : "border-[#e4e9f0]",
        confidenceTone[group.confidence].rail,
        faded && dimmed,
        active && "shadow-[0_0_0_2px_#2563eb,0_12px_28px_rgba(37,99,235,0.18)]",
        linked && "shadow-[0_4px_14px_rgba(16,24,40,0.10)]",
        lift !== undefined && liftedCard
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

type RestingBox = { top: number; bottom: number; column: number };

/** Where every anchor would sit with nothing lifted, in the canvas's own pre-zoom units. */
function readRestingBoxes(canvas: HTMLElement, zoom: number) {
  const origin = canvas.getBoundingClientRect();
  const boxes = new Map<string, RestingBox>();

  canvas.querySelectorAll<HTMLElement>("[data-node-id]").forEach((element) => {
    const id = element.dataset.nodeId;
    if (!id || element.offsetParent === null) return;
    const rect = element.getBoundingClientRect();
    /** The rect carries whatever offset is applied right now, a half-finished transition included,
     *  so take it off the element instead of assuming the last target already landed. */
    const applied = appliedTranslateY(element);
    boxes.set(id, {
      top: (rect.top - origin.top) / zoom - applied,
      bottom: (rect.bottom - origin.top) / zoom - applied,
      column: Number(element.dataset.column ?? "0")
    });
  });

  return boxes;
}

function appliedTranslateY(element: HTMLElement) {
  const transform = getComputedStyle(element).transform;
  if (!transform || transform === "none") return 0;
  try {
    return new DOMMatrixReadOnly(transform).f;
  } catch {
    return 0;
  }
}

/** A lifted card floats over whatever it landed on, which is already faded out of the way. */
const liftedCard = "z-20 shadow-[0_10px_30px_rgba(16,24,40,0.18)]";

function sameEdgePaths(a: EdgePath[], b: EdgePath[]) {
  return a.length === b.length && a.every((path, index) => path.id === b[index].id && path.d === b[index].d);
}

function sameLift(a: Map<string, number>, b: Map<string, number>) {
  return a.size === b.size && Array.from(a).every(([nodeId, offset]) => b.get(nodeId) === offset);
}

function liftStyle(lift?: number) {
  return lift === undefined ? undefined : { transform: `translateY(${lift}px)` };
}

/**
 * Vertical offsets that bring the active node's chain onto its own row.
 *
 * Only the other columns move: a chain never has two cards of the same column that both need to
 * sit beside the active one, and moving the column the cursor is in would slide the card out from
 * under the pointer. Offsets are transforms rather than layout, so nothing reflows and the edges
 * re-route on their own once `routeEdges` reads the moved rects back.
 */
function buildLift(
  activeNodeId: string | null,
  chain: Set<string> | null,
  boxes: Map<string, RestingBox>,
  anchorFallback: Map<string, string>
) {
  const lift = new Map<string, number>();
  /** A card inside a folded band is not rendered, so the chain travels through its summary strip. */
  const anchorOf = (nodeId: string) => (boxes.has(nodeId) ? nodeId : anchorFallback.get(nodeId));
  const activeAnchor = activeNodeId ? anchorOf(activeNodeId) : undefined;
  const anchorBox = activeAnchor ? boxes.get(activeAnchor) : undefined;
  if (!chain || !activeAnchor || !anchorBox) return lift;

  const targetY = (anchorBox.top + anchorBox.bottom) / 2;
  const byColumn = new Map<number, string[]>();
  chain.forEach((nodeId) => {
    const anchorId = anchorOf(nodeId);
    const box = anchorId ? boxes.get(anchorId) : undefined;
    if (!anchorId || !box || anchorId === activeAnchor || box.column === anchorBox.column) return;
    const column = byColumn.get(box.column) ?? [];
    if (column.includes(anchorId)) return;
    byColumn.set(box.column, [...column, anchorId]);
  });

  byColumn.forEach((anchorIds) => {
    const ordered = [...anchorIds].sort((a, b) => (boxes.get(a)?.top ?? 0) - (boxes.get(b)?.top ?? 0));
    const heights = ordered.map((anchorId) => {
      const box = boxes.get(anchorId) as RestingBox;
      return box.bottom - box.top;
    });
    const stack = heights.reduce((sum, height) => sum + height, 0) + liftStackGap * (ordered.length - 1);
    /** Centre the stack on the active row, but never so high that the scroll container clips it
     *  or the sticky column header covers it. */
    let cursor = Math.max(liftTopReserve, targetY - stack / 2);

    ordered.forEach((anchorId, index) => {
      const box = boxes.get(anchorId) as RestingBox;
      lift.set(anchorId, Math.round(cursor - box.top));
      cursor += heights[index] + liftStackGap;
    });
  });

  return lift;
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

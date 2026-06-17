"use client";

import Link from "next/link";
import { Building2, ChevronRight, Layers3, ZoomIn, ZoomOut } from "lucide-react";
import { useRef, useState, type PointerEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { ConfidenceBadge, Score, TypeBadge } from "@/components/okr-status";
import { hrefWithLang, t, translateText, type Lang } from "@/lib/i18n";
import { buildAlignmentViewModel, type ObjectiveAlignmentNode } from "@/lib/okr/alignment-view";
import type { OkrRecord } from "@/lib/okr/types";
import { cn } from "@/lib/utils";

const cardWidth = 330;
const cardHeight = 112;
const columnGap = 420;
const rowGap = 104;
const canvasPadding = 80;
const teamGroupOrder = ["Software", "Hardware", "Advanced Technology", "AP OPS"];

type MapNode = {
  id: string;
  kind: "engineering" | "team" | "objective";
  label: string;
  team?: string;
  objectiveNode?: ObjectiveAlignmentNode;
  children: MapNode[];
  objectiveCount: number;
  keyResultCount: number;
  averageProgress: number | null;
};

type PositionedNode = {
  node: MapNode;
  x: number;
  y: number;
  depth: number;
};

type Connector = {
  from: PositionedNode;
  to: PositionedNode;
};

export function OkrMap({ records, lang, selectedTeam }: { records: OkrRecord[]; lang: Lang; selectedTeam?: string }) {
  const model = buildAlignmentViewModel(records, selectedTeam);
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  const hierarchy = buildMapHierarchy(model.roots, lang);
  const layout = buildMindMapLayout(hierarchy, collapsedIds);
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ pointerId: number; x: number; y: number; panX: number; panY: number } | null>(null);

  const zoomBy = (delta: number) => {
    setScale((current) => clampScale(Number((current + delta).toFixed(2))));
  };
  const toggleCollapsed = (nodeId: string) => {
    setCollapsedIds((current) => {
      const next = new Set(current);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  };

  const handlePointerDown = (event: PointerEvent<HTMLElement>) => {
    if ((event.target as HTMLElement).closest("a,button")) return;
    dragRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      panX: pan.x,
      panY: pan.y
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: PointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    setPan({
      x: drag.panX + event.clientX - drag.x,
      y: drag.panY + event.clientY - drag.y
    });
  };

  const stopDragging = (event: PointerEvent<HTMLElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
  };

  if (model.roots.length === 0 && model.unalignedObjectives.length === 0) {
    return <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">{t(lang, "noOkrData")}</div>;
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-3 md:grid-cols-3">
        <MapMetric label={lang === "en" ? "Objective nodes" : "Objective 节点"} value={model.objectiveCount} />
        <MapMetric label={lang === "en" ? "Aligned Objectives" : "已对齐目标"} value={model.alignedObjectiveCount} />
        <MapMetric label={lang === "en" ? "Unaligned Objectives" : "未对齐目标"} value={model.unalignedObjectives.length} />
      </div>

      {layout.nodes.length > 0 && (
        <section
          className="relative min-h-[calc(100vh-220px)] cursor-grab overflow-hidden rounded-lg border border-border bg-[#f5f6f8] shadow-subtle active:cursor-grabbing"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={stopDragging}
          onPointerCancel={stopDragging}
        >
          <div
            className="relative"
            style={{
              width: layout.width,
              height: layout.height,
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
              transformOrigin: "0 0"
            }}
          >
            <svg className="absolute inset-0 h-full w-full" width={layout.width} height={layout.height} aria-hidden>
              {layout.connectors.map((connector) => (
                <path
                  key={`${connector.from.node.id}-${connector.to.node.id}`}
                  d={connectorPath(connector)}
                  fill="none"
                  stroke="#cbd5e1"
                  strokeWidth="2"
                />
              ))}
            </svg>

            {layout.nodes.map((item) => (
              <MapNodeCard
                key={item.node.id}
                item={item}
                lang={lang}
                collapsed={collapsedIds.has(item.node.id)}
                onToggle={() => toggleCollapsed(item.node.id)}
              />
            ))}
          </div>

          <div className="absolute bottom-4 left-4 z-20 inline-flex items-center gap-2 rounded-md border border-border bg-white px-2 py-2 text-sm text-slate-500 shadow-subtle">
            <button
              type="button"
              onClick={() => zoomBy(-0.1)}
              className="grid h-7 w-7 place-items-center rounded text-slate-500 hover:bg-slate-100 hover:text-slate-950"
              aria-label={lang === "en" ? "Zoom out" : "缩小"}
            >
              <ZoomOut className="h-4 w-4" />
            </button>
            <span className="min-w-12 text-center tabular-nums">{Math.round(scale * 100)}%</span>
            <button
              type="button"
              onClick={() => zoomBy(0.1)}
              className="grid h-7 w-7 place-items-center rounded text-slate-500 hover:bg-slate-100 hover:text-slate-950"
              aria-label={lang === "en" ? "Zoom in" : "放大"}
            >
              <ZoomIn className="h-4 w-4" />
            </button>
          </div>
        </section>
      )}

      {model.unalignedObjectives.length > 0 && (
        <section className="rounded-lg border border-amber-200 bg-amber-50/40 p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-slate-950">{lang === "en" ? "Unaligned Objectives" : "未对齐目标"}</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {lang === "en" ? "These team Objectives do not have an upper-level Objective alignment yet." : "这些团队 Objective 还没有对齐到上级 Objective，建议优先补齐。"}
              </p>
            </div>
            <Badge tone="yellow">{model.unalignedObjectives.length}</Badge>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            {model.unalignedObjectives.map((objective) => (
              <UnalignedObjective key={objective.okr_id} objective={objective} lang={lang} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function MapNodeCard({ item, lang, collapsed, onToggle }: { item: PositionedNode; lang: Lang; collapsed: boolean; onToggle: () => void }) {
  if (item.node.kind !== "objective") {
    return <AggregateNodeCard item={item} lang={lang} collapsed={collapsed} onToggle={onToggle} />;
  }

  return <ObjectiveNodeCard item={item} lang={lang} collapsed={collapsed} onToggle={onToggle} />;
}

function AggregateNodeCard({ item, lang, collapsed, onToggle }: { item: PositionedNode; lang: Lang; collapsed: boolean; onToggle: () => void }) {
  const isEngineering = item.node.kind === "engineering";
  const progress = item.node.averageProgress === null ? "N/A" : `${Math.round(item.node.averageProgress * 100)}%`;
  const title = isEngineering
    ? lang === "en" ? "Engineering" : "Engineering"
    : item.node.label;

  return (
    <article
      className={cn(
        "absolute z-10 rounded-md border bg-white px-4 py-3 shadow-lg transition-all duration-300 ease-out",
        collapsed ? "shadow-blue-100 ring-2 ring-blue-100" : "hover:shadow-xl",
        isEngineering ? "border-slate-300 border-l-4 border-l-slate-950" : "border-blue-100 border-l-4 border-l-blue-500"
      )}
      style={{ width: cardWidth, minHeight: cardHeight, left: item.x, top: item.y }}
    >
      <button
        type="button"
        onClick={onToggle}
        disabled={item.node.children.length === 0}
        className={cn(
          "absolute -right-8 top-1/2 z-20 flex h-9 -translate-y-1/2 items-center gap-1.5 rounded-full border px-2.5 text-xs font-semibold shadow-lg transition-all duration-300 ease-out hover:scale-105 active:scale-95 disabled:opacity-40",
          collapsed
            ? "border-blue-200 bg-blue-600 text-white shadow-blue-500/30"
            : "border-blue-100 bg-white text-blue-700 shadow-blue-200/70 hover:bg-blue-50"
        )}
        aria-label={collapsed ? (lang === "en" ? "Expand" : "展开") : (lang === "en" ? "Collapse" : "折叠")}
      >
        <span className="tabular-nums">{item.node.children.length}</span>
        <ChevronRight className={cn("h-4 w-4 transition-transform duration-300", collapsed ? "rotate-0" : "rotate-90")} />
      </button>

      <div className="flex items-start justify-between gap-3 pr-6">
        <div className="flex min-w-0 items-center gap-3">
          <span className={cn(
            "grid h-9 w-9 shrink-0 place-items-center rounded-md text-white",
            isEngineering ? "bg-slate-950" : "bg-blue-600"
          )}>
            {isEngineering ? <Building2 className="h-5 w-5" /> : <Layers3 className="h-5 w-5" />}
          </span>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-slate-950">{title}</div>
            <div className="mt-1 text-xs text-muted-foreground">
              {item.node.objectiveCount} Objectives · {item.node.keyResultCount} KRs
            </div>
          </div>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
        <AggregateStat label={lang === "en" ? "Progress" : "进度"} value={progress} />
        <AggregateStat label={lang === "en" ? "Teams" : "团队"} value={String(item.node.kind === "engineering" ? item.node.children.length : 1)} />
        <AggregateStat label={lang === "en" ? "Children" : "下级"} value={String(item.node.children.length)} />
      </div>
    </article>
  );
}

function AggregateStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded bg-slate-50 px-2 py-1.5">
      <div className="text-[10px] font-medium uppercase text-slate-400">{label}</div>
      <div className="mt-0.5 font-semibold tabular-nums text-slate-800">{value}</div>
    </div>
  );
}

function ObjectiveNodeCard({ item, lang, collapsed, onToggle }: { item: PositionedNode; lang: Lang; collapsed: boolean; onToggle: () => void }) {
  const objectiveNode = item.node.objectiveNode;
  if (!objectiveNode) return null;
  const objective = objectiveNode.objective;
  const progress = objective.score === null ? 0 : Math.round(objective.score * 100);
  const tone = objective.confidence === "Green"
    ? "border-l-emerald-400"
    : objective.confidence === "Red"
      ? "border-l-rose-400"
      : "border-l-amber-400";

  return (
    <div
      className={cn(
        "absolute z-10 rounded-sm border border-border border-l-4 bg-white px-4 py-3 shadow-md transition-all duration-300 ease-out hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-lg",
        collapsed ? "ring-2 ring-blue-100" : "",
        tone
      )}
      style={{ width: cardWidth, minHeight: cardHeight, left: item.x, top: item.y }}
    >
      {item.node.children.length > 0 && (
        <button
          type="button"
          onClick={onToggle}
          className={cn(
            "absolute -right-8 top-1/2 z-20 flex h-8 -translate-y-1/2 items-center gap-1.5 rounded-full border px-2.5 text-xs font-semibold shadow-lg transition-all duration-300 ease-out hover:scale-105 active:scale-95",
            collapsed
              ? "border-blue-200 bg-blue-600 text-white shadow-blue-500/30"
              : "border-blue-100 bg-white text-blue-700 shadow-blue-200/70 hover:bg-blue-50"
          )}
          aria-label={collapsed ? (lang === "en" ? "Expand" : "展开") : (lang === "en" ? "Collapse" : "折叠")}
        >
          <span className="tabular-nums">{item.node.children.length}</span>
          <ChevronRight className={cn("h-4 w-4 transition-transform duration-300", collapsed ? "rotate-0" : "rotate-90")} />
        </button>
      )}

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
            <span className="grid h-6 w-6 place-items-center rounded-full bg-blue-500 text-[10px] font-semibold text-white">{initials(objective.team)}</span>
            <span className="truncate">{objective.owner}</span>
          </div>
          <Link
            href={hrefWithLang(`/?team=${encodeURIComponent(objective.team)}`, lang)}
            className="mt-2 line-clamp-2 text-sm font-semibold leading-5 text-slate-950 hover:text-blue-700"
          >
            {translateText(objective.objective, lang)}
          </Link>
        </div>
        <div className="shrink-0 pr-3 text-right text-xs font-semibold tabular-nums text-slate-500">{progress}%</div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <TypeBadge value={objective.type} />
        <ConfidenceBadge value={objective.confidence} />
        {item.node.children.length > 0 && <Badge tone="blue">{item.node.children.length}</Badge>}
      </div>
    </div>
  );
}

function UnalignedObjective({ objective, lang }: { objective: OkrRecord; lang: Lang }) {
  return (
    <article className="rounded-md border border-amber-200 bg-white p-4">
      <div className="mb-2 flex items-center gap-2 text-xs font-medium text-slate-500">
        <span className="grid h-6 w-6 place-items-center rounded-full bg-amber-400 text-white">{initials(objective.team)}</span>
        <span>{objective.team}</span>
        <span className="text-slate-300">/</span>
        <span>{objective.owner}</span>
      </div>
      <Link
        href={hrefWithLang(`/okr/${encodeURIComponent(objective.okr_id)}`, lang)}
        className="block text-base font-semibold leading-6 text-slate-950 hover:text-blue-700"
      >
        {translateText(objective.objective, lang)}
      </Link>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <TypeBadge value={objective.type} />
        <ConfidenceBadge value={objective.confidence} />
        <span className="text-xs text-muted-foreground">{t(lang, "score")} <Score value={objective.score} /></span>
      </div>
    </article>
  );
}

function MapMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-white px-4 py-3 shadow-subtle">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums text-slate-950">{value}</div>
    </div>
  );
}

function buildMindMapLayout(roots: MapNode[], collapsedIds: Set<string>) {
  const nodes: PositionedNode[] = [];
  const connectors: Connector[] = [];
  let nextLeafY = canvasPadding;
  let maxDepth = 0;

  function place(node: MapNode, depth: number): PositionedNode {
    maxDepth = Math.max(maxDepth, depth);
    const expandedChildren = collapsedIds.has(node.id) ? [] : node.children;
    const children = expandedChildren.map((child) => place(child, depth + 1));
    const y = children.length > 0
      ? (children[0].y + children[children.length - 1].y) / 2
      : nextLeafY;

    if (children.length === 0) nextLeafY += cardHeight + rowGap;

    const positioned = {
      node,
      x: canvasPadding + depth * columnGap,
      y,
      depth
    };

    nodes.push(positioned);
    children.forEach((child) => connectors.push({ from: positioned, to: child }));
    return positioned;
  }

  roots.forEach((root, index) => {
    if (index > 0) nextLeafY += rowGap;
    place(root, 0);
  });

  return {
    nodes,
    connectors,
    width: canvasPadding * 2 + cardWidth + maxDepth * columnGap,
    height: Math.max(640, nextLeafY + canvasPadding)
  };
}

function connectorPath({ from, to }: Connector) {
  const startX = from.x + cardWidth;
  const startY = from.y + cardHeight / 2;
  const endX = to.x;
  const endY = to.y + cardHeight / 2;
  const midX = startX + (endX - startX) * 0.55;
  return `M ${startX} ${startY} C ${midX} ${startY}, ${midX} ${endY}, ${endX} ${endY}`;
}

function buildMapHierarchy(roots: ObjectiveAlignmentNode[], lang: Lang): MapNode[] {
  if (roots.length === 0) return [];
  const teamGroups = new Map<string, ObjectiveAlignmentNode[]>();

  roots.forEach((root) => {
    const team = root.objective.team || (lang === "en" ? "Other" : "其他");
    teamGroups.set(team, [...(teamGroups.get(team) ?? []), root]);
  });

  const teamNodes = Array.from(teamGroups.entries())
    .sort(([teamA], [teamB]) => teamGroupRank(teamA) - teamGroupRank(teamB) || teamA.localeCompare(teamB))
    .map(([team, nodes]) => aggregateNode({
      id: `team:${team}`,
      kind: "team",
      label: team,
      team,
      children: nodes.map(objectiveToMapNode)
    }));

  return [aggregateNode({
    id: "engineering",
    kind: "engineering",
    label: "Engineering",
    children: teamNodes
  })];
}

function teamGroupRank(team: string) {
  const index = teamGroupOrder.indexOf(team);
  return index === -1 ? teamGroupOrder.length : index;
}

function objectiveToMapNode(node: ObjectiveAlignmentNode): MapNode {
  const children = node.children.map(objectiveToMapNode);
  return aggregateNode({
    id: `objective:${node.objective.okr_id}`,
    kind: "objective",
    label: node.objective.objective,
    team: node.objective.team,
    objectiveNode: node,
    children
  });
}

function aggregateNode(base: Pick<MapNode, "id" | "kind" | "label" | "children"> & Partial<Pick<MapNode, "team" | "objectiveNode">>): MapNode {
  const selfObjectiveCount = base.kind === "objective" ? 1 : 0;
  const ownKeyResults = base.objectiveNode?.keyResults.length ?? 0;
  const childObjectiveCount = base.children.reduce((sum, child) => sum + child.objectiveCount, 0);
  const childKeyResultCount = base.children.reduce((sum, child) => sum + child.keyResultCount, 0);
  const progressValues = collectProgressValues(base);

  return {
    id: base.id,
    kind: base.kind,
    label: base.label,
    team: base.team,
    objectiveNode: base.objectiveNode,
    children: base.children,
    objectiveCount: selfObjectiveCount + childObjectiveCount,
    keyResultCount: ownKeyResults + childKeyResultCount,
    averageProgress: progressValues.length > 0
      ? progressValues.reduce((sum, value) => sum + value, 0) / progressValues.length
      : null
  };
}

function collectProgressValues(node: Pick<MapNode, "kind" | "children"> & Partial<Pick<MapNode, "objectiveNode">>): number[] {
  const ownScore = node.kind === "objective" ? node.objectiveNode?.objective.score : null;
  return [
    ...(ownScore === null || ownScore === undefined ? [] : [ownScore]),
    ...node.children.flatMap((child) => collectProgressValues(child))
  ];
}

function clampScale(value: number) {
  return Math.min(1.6, Math.max(0.6, value));
}

function initials(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

"use client";

import Link from "next/link";
import { Building2, ChevronRight, Layers3, UserRound, ZoomIn, ZoomOut } from "lucide-react";
import { useMemo, useRef, useState, type PointerEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { ConfidenceBadge, TypeBadge } from "@/components/okr-status";
import type { AdminTeam } from "@/lib/admin/config";
import { hrefWithLang, t, translateText, type Lang } from "@/lib/i18n";
import { buildAlignmentViewModel } from "@/lib/okr/alignment-view";
import {
  buildOrganizationAlignmentMap,
  type ObjectiveAlignmentEdge
} from "@/lib/okr/organization-alignment-map";
import {
  buildMindMapLayout,
  mindMapCardHeight as cardHeight,
  mindMapCardWidth as cardWidth,
  type MapConnector as Connector,
  type PositionedMapNode as PositionedNode
} from "@/lib/okr/mind-map-layout";
import type { OkrRecord } from "@/lib/okr/types";
import { cn } from "@/lib/utils";

export function OkrMap({
  records,
  teams,
  lang,
  selectedTeam
}: {
  records: OkrRecord[];
  teams: AdminTeam[];
  lang: Lang;
  selectedTeam?: string;
}) {
  const model = useMemo(() => buildAlignmentViewModel(records, selectedTeam), [records, selectedTeam]);
  const organizationMap = useMemo(() => buildOrganizationAlignmentMap(model.roots, teams, lang), [model.roots, teams, lang]);
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(() => new Set(organizationMap.defaultCollapsedIds));
  const layout = buildMindMapLayout(organizationMap.roots, collapsedIds);
  const alignmentConnectors = buildAlignmentConnectors(layout.nodes, organizationMap.alignmentEdges, layout.connectors);
  const unalignedTeamObjectives = model.unalignedObjectives.filter((objective) => objective.objective_scope !== "member");
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
        <MapMetric label={lang === "en" ? "Unaligned Objectives" : "未对齐目标"} value={unalignedTeamObjectives.length} />
      </div>

      {layout.nodes.length > 0 && (
        <section
          className="relative h-[calc(100vh-220px)] min-h-[640px] cursor-grab overflow-hidden rounded-lg border border-border bg-[#f5f6f8] shadow-subtle active:cursor-grabbing"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={stopDragging}
          onPointerCancel={stopDragging}
        >
          <div
            className="absolute left-0 top-0"
            style={{
              width: layout.width,
              height: layout.height,
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
              transformOrigin: "0 0"
            }}
          >
            <svg className="absolute inset-0 h-full w-full" width={layout.width} height={layout.height} aria-hidden>
              <defs>
                <marker id="alignment-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="strokeWidth">
                  <path d="M 0 0 L 8 4 L 0 8 z" fill="#3b82f6" />
                </marker>
              </defs>
              {layout.connectors.map((connector) => (
                <path
                  key={`${connector.from.node.id}-${connector.to.node.id}`}
                  d={connectorPath(connector)}
                  fill="none"
                  stroke={connector.kind === "member" ? "#3b82f6" : "#cbd5e1"}
                  strokeDasharray={connector.kind === "member" ? "7 6" : undefined}
                  strokeWidth="2"
                  markerEnd={connector.kind === "member" ? "url(#alignment-arrow)" : undefined}
                />
              ))}
              {alignmentConnectors.map((connector) => (
                <path
                  key={`alignment:${connector.from.node.id}-${connector.to.node.id}`}
                  d={alignmentConnectorPath(connector)}
                  fill="none"
                  stroke="#3b82f6"
                  strokeDasharray="7 6"
                  strokeWidth="2"
                  markerEnd="url(#alignment-arrow)"
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

          <div className="absolute right-4 top-4 z-20 flex flex-wrap items-center gap-4 rounded-md border border-border bg-white/95 px-3 py-2 text-xs text-slate-600 shadow-subtle backdrop-blur">
            <span className="inline-flex items-center gap-2"><span className="h-0.5 w-7 bg-slate-300" />{lang === "en" ? "Organization" : "组织归属"}</span>
            <span className="inline-flex items-center gap-2"><span className="w-7 border-t-2 border-dashed border-blue-500" />{lang === "en" ? "OKR alignment" : "OKR 对齐"}</span>
            <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-amber-400" />{lang === "en" ? "Unaligned" : "未对齐"}</span>
          </div>

          <div className="fixed bottom-4 left-4 z-40 inline-flex items-center gap-2 rounded-md border border-border bg-white px-2 py-2 text-sm text-slate-500 shadow-subtle">
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
  const isMemberGroup = item.node.kind === "member-group";
  const progress = item.node.averageProgress === null ? "N/A" : `${Math.round(item.node.averageProgress * 100)}%`;
  const title = isEngineering
    ? lang === "en" ? "Engineering" : "Engineering"
    : item.node.label;

  return (
    <article
      className={cn(
        "absolute z-10 rounded-md border bg-white px-4 py-3 shadow-lg transition-all duration-300 ease-out",
        collapsed ? "shadow-blue-100 ring-2 ring-blue-100" : "hover:shadow-xl",
        isEngineering ? "border-slate-300 border-l-4 border-l-slate-950" : isMemberGroup ? "border-violet-100 border-l-4 border-l-violet-500" : "border-blue-100 border-l-4 border-l-blue-500"
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
            isEngineering ? "bg-slate-950" : isMemberGroup ? "bg-violet-500" : "bg-blue-600"
          )}>
            {isEngineering ? <Building2 className="h-5 w-5" /> : isMemberGroup ? <UserRound className="h-5 w-5" /> : <Layers3 className="h-5 w-5" />}
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
            {translateText(objective.objective, lang, objective.localized?.objective)}
          </Link>
        </div>
        <div className="shrink-0 pr-3 text-right text-xs font-semibold tabular-nums text-slate-500">{progress}%</div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {objectiveNode.unaligned && (
          <Badge tone="yellow">{lang === "en" ? "Unaligned" : "未对齐"}</Badge>
        )}
        <TypeBadge value={objective.type} />
        <ConfidenceBadge value={objective.confidence} />
        {objective.objective_scope === "member" && <Badge tone="blue">{lang === "en" ? "Member O" : "成员 O"}</Badge>}
        {item.node.alignmentChildCount > 0 && (
          <Badge tone="blue">{lang === "en" ? `${item.node.alignmentChildCount} aligned` : `${item.node.alignmentChildCount} 个下级对齐`}</Badge>
        )}
      </div>
    </div>
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

function connectorPath({ from, to }: Connector) {
  const startX = from.x + cardWidth;
  const startY = from.y + cardHeight / 2;
  const endX = to.x;
  const endY = to.y + cardHeight / 2;
  const midX = startX + (endX - startX) * 0.55;
  return `M ${startX} ${startY} C ${midX} ${startY}, ${midX} ${endY}, ${endX} ${endY}`;
}

function buildAlignmentConnectors(nodes: PositionedNode[], edges: ObjectiveAlignmentEdge[], displayConnectors: Connector[]): Connector[] {
  const nodeById = new Map(nodes.map((item) => [item.node.id, item]));
  const displayedEdges = new Set(displayConnectors.map((connector) => `${connector.from.node.id}->${connector.to.node.id}`));
  return edges.flatMap((edge) => {
    const from = nodeById.get(edge.fromId);
    const to = nodeById.get(edge.toId);
    if (displayedEdges.has(`${edge.toId}->${edge.fromId}`)) return [];
    return from && to ? [{ from, to }] : [];
  });
}

function alignmentConnectorPath({ from, to }: Connector) {
  if (Math.abs(from.x - to.x) < cardWidth / 2) {
    const startX = from.x + cardWidth;
    const startY = from.y + cardHeight / 2;
    const endX = to.x + cardWidth;
    const endY = to.y + cardHeight / 2;
    const controlX = Math.max(startX, endX) + 64;
    return `M ${startX} ${startY} C ${controlX} ${startY}, ${controlX} ${endY}, ${endX} ${endY}`;
  }

  const sourceIsRight = from.x > to.x;
  const startX = sourceIsRight ? from.x : from.x + cardWidth;
  const endX = sourceIsRight ? to.x + cardWidth : to.x;
  const startY = from.y + cardHeight / 2;
  const endY = to.y + cardHeight / 2;
  const midX = startX + (endX - startX) * 0.5;
  return `M ${startX} ${startY} C ${midX} ${startY}, ${midX} ${endY}, ${endX} ${endY}`;
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

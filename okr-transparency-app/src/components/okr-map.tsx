"use client";

import Link from "next/link";
import { ZoomIn, ZoomOut } from "lucide-react";
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

type PositionedNode = {
  node: ObjectiveAlignmentNode;
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
  const layout = buildMindMapLayout(model.roots);
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ pointerId: number; x: number; y: number; panX: number; panY: number } | null>(null);

  const zoomBy = (delta: number) => {
    setScale((current) => clampScale(Number((current + delta).toFixed(2))));
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
                  key={`${connector.from.node.objective.okr_id}-${connector.to.node.objective.okr_id}`}
                  d={connectorPath(connector)}
                  fill="none"
                  stroke="#cbd5e1"
                  strokeWidth="2"
                />
              ))}
            </svg>

            {layout.nodes.map((item) => (
              <ObjectiveNodeCard key={item.node.objective.okr_id} item={item} lang={lang} />
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

function ObjectiveNodeCard({ item, lang }: { item: PositionedNode; lang: Lang }) {
  const objective = item.node.objective;
  const progress = objective.score === null ? 0 : Math.round(objective.score * 100);
  const tone = objective.confidence === "Green"
    ? "border-l-emerald-400"
    : objective.confidence === "Red"
      ? "border-l-rose-400"
      : "border-l-amber-400";

  return (
    <Link
      href={hrefWithLang(`/?team=${encodeURIComponent(objective.team)}`, lang)}
      className={cn(
        "absolute z-10 block rounded-sm border border-border border-l-4 bg-white px-4 py-3 shadow-md transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-lg",
        tone
      )}
      style={{ width: cardWidth, minHeight: cardHeight, left: item.x, top: item.y }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
            <span className="grid h-6 w-6 place-items-center rounded-full bg-blue-500 text-[10px] font-semibold text-white">{initials(objective.team)}</span>
            <span className="truncate">{objective.owner}</span>
          </div>
          <div className="mt-2 line-clamp-2 text-sm font-semibold leading-5 text-slate-950">
            {translateText(objective.objective, lang)}
          </div>
        </div>
        <div className="shrink-0 text-right text-xs font-semibold tabular-nums text-slate-500">{progress}%</div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <TypeBadge value={objective.type} />
        <ConfidenceBadge value={objective.confidence} />
        {item.node.children.length > 0 && <Badge tone="blue">{item.node.children.length}</Badge>}
      </div>
    </Link>
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

function buildMindMapLayout(roots: ObjectiveAlignmentNode[]) {
  const nodes: PositionedNode[] = [];
  const connectors: Connector[] = [];
  let nextLeafY = canvasPadding;
  let maxDepth = 0;

  function place(node: ObjectiveAlignmentNode, depth: number): PositionedNode {
    maxDepth = Math.max(maxDepth, depth);
    const children = node.children.map((child) => place(child, depth + 1));
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

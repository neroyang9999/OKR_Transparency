export type EdgeBox = { left: number; top: number; right: number; bottom: number };

export type EdgeColumnBounds = { left: number; right: number };

export type EdgeInput = {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  /** Child card: the edge leaves its left edge. */
  from: EdgeBox;
  /** Parent card: the arrow lands on its right edge. */
  to: EdgeBox;
  toColumn: number;
};

export type EdgePath = {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  d: string;
};

export const edgeCornerRadius = 9;
const straightLineDistance = 40;

/**
 * Routes every edge as an orthogonal polyline through its own vertical channel, so two edges
 * crossing the same column gap never overlap. Short or nearly-horizontal edges stay straight —
 * a rounded detour there reads as a hook rather than a connection.
 */
export function buildEdgePaths(
  edges: EdgeInput[],
  columns: EdgeColumnBounds[],
  radius = edgeCornerRadius
): EdgePath[] {
  const byGap = new Map<number, EdgeInput[]>();
  edges.forEach((edge) => {
    byGap.set(edge.toColumn, [...(byGap.get(edge.toColumn) ?? []), edge]);
  });

  return Array.from(byGap.entries()).flatMap(([toColumn, gapEdges]) => {
    const ordered = [...gapEdges].sort((a, b) => centerY(a.from) - centerY(b.from) || a.id.localeCompare(b.id));
    const gap = channelBounds(columns, toColumn);

    return ordered.map((edge, index) => {
      const ax = edge.from.left;
      const ay = centerY(edge.from);
      const bx = edge.to.right;
      const by = centerY(edge.to);
      const channel = gap
        ? gap.left + ((gap.right - gap.left) * (index + 1)) / (ordered.length + 1)
        : (ax + bx) / 2;

      return {
        id: edge.id,
        fromNodeId: edge.fromNodeId,
        toNodeId: edge.toNodeId,
        d: edgePath({ ax, ay, bx, by, channel, radius })
      };
    });
  });
}

function edgePath({
  ax,
  ay,
  bx,
  by,
  channel,
  radius
}: {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  channel: number;
  radius: number;
}) {
  const straight = `M ${round(ax)} ${round(ay)} L ${round(bx)} ${round(by)}`;
  const rise = by - ay;
  const hasRoomForCorners = ax - channel >= radius && channel - bx >= radius;

  if (Math.abs(rise) < radius * 2 || ax - bx < straightLineDistance || !hasRoomForCorners) return straight;

  const direction = rise > 0 ? 1 : -1;
  return [
    `M ${round(ax)} ${round(ay)}`,
    `L ${round(channel + radius)} ${round(ay)}`,
    `Q ${round(channel)} ${round(ay)} ${round(channel)} ${round(ay + direction * radius)}`,
    `L ${round(channel)} ${round(by - direction * radius)}`,
    `Q ${round(channel)} ${round(by)} ${round(channel - radius)} ${round(by)}`,
    `L ${round(bx)} ${round(by)}`
  ].join(" ");
}

function channelBounds(columns: EdgeColumnBounds[], toColumn: number) {
  const parent = columns[toColumn];
  const child = columns[toColumn + 1];
  if (!parent || !child || child.left <= parent.right) return null;
  return { left: parent.right, right: child.left };
}

function centerY(box: EdgeBox) {
  return (box.top + box.bottom) / 2;
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}

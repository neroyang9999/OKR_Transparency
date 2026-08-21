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
 * Routes every edge as an orthogonal polyline through a vertical channel. Short or nearly-
 * horizontal edges stay straight — a rounded detour there reads as a hook rather than a connection.
 *
 * One channel per parent, not per edge: everything landing on one card runs down the same line and
 * along the same approach, so the routes that coincide are drawn over each other instead of fanning
 * out into a bundle of near-parallel neighbours. The caller has to apply the stroke alpha to the
 * whole set at once, or the shared stretches compound into a darker line.
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

    /** Channels follow the parents down the column, so a lane never has to reach past its own
     *  neighbours to get where it is going. */
    const parents = new Map<string, number>();
    ordered.forEach((edge) => parents.set(targetKey(edge), centerY(edge.to)));
    const laneOf = new Map(
      Array.from(parents)
        .sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]))
        .map(([key], index) => [key, index])
    );

    return ordered.map((edge) => {
      const ax = edge.from.left;
      const ay = centerY(edge.from);
      const bx = edge.to.right;
      const by = centerY(edge.to);
      const index = laneOf.get(targetKey(edge)) ?? 0;
      const channel = gap
        ? gap.left + ((gap.right - gap.left) * (index + 1)) / (laneOf.size + 1)
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

/** The point an arrow lands on. Every edge sharing it shares a channel. */
function targetKey(edge: EdgeInput) {
  return `${round(edge.to.right)},${round(centerY(edge.to))}`;
}

function centerY(box: EdgeBox) {
  return (box.top + box.bottom) / 2;
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}

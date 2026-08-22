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

/** Where the eight points of the six commands sit along the straight chord, in order. With every
 *  one of them on the chord both curves degenerate into straight segments and the path IS the
 *  chord, which is what lets a route relax onto it without changing command structure. */
const chordFractions = [0, 0.25, 0.375, 0.5, 0.5, 0.625, 0.75, 1];

/**
 * Routes every edge as an orthogonal polyline through a vertical channel. Edges whose cards nearly
 * touch stay straight — a rounded detour squeezed into that gap reads as a hook rather than a
 * connection. Everything else keeps the same six commands whatever the rise, relaxing from the
 * orthogonal route onto the straight chord as the two cards level out, so a card moving under a
 * cursor never makes the route change shape and a level pair never bends around a channel it
 * contributes nothing to.
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
  /** Set by the columns, so it cannot flip while a card is moving: two cards this close together
   *  horizontally get a straight line, because a detour squeezed into the gap reads as a hook. */
  if (ax - bx < straightLineDistance) return `M ${round(ax)} ${round(ay)} L ${round(bx)} ${round(by)}`;

  const rise = by - ay;
  const direction = rise > 0 ? 1 : -1;
  const corner = Math.max(0, Math.min(radius, Math.abs(rise) / 2, ax - channel, channel - bx));

  /** How much of a vertical trunk this route has to offer. The channel earns its detour by being
   *  the line several routes run down together; a pair of cards level with each other contributes
   *  no such line, and bending around the channel anyway leaves a kink with nothing to share it
   *  with — worse where the lane sits close to one card, since the bend then has to happen inside
   *  the short side and the rest of the run stays dead flat.
   *
   *  So the whole route relaxes onto the straight chord as its corner shrinks, rather than the
   *  corner alone getting rounder. Continuously, because a lifted card drags the rise through zero
   *  and anything that switches shape there pops however often the geometry is recomputed. */
  const trunk = radius > 0 ? corner / radius : 1;

  const elbow: Array<readonly [number, number]> = [
    [ax, ay],
    [channel + corner, ay],
    [channel, ay],
    [channel, ay + direction * corner],
    [channel, by - direction * corner],
    [channel, by],
    [channel - corner, by],
    [bx, by]
  ];

  const points = elbow.map(([x, y], index) => {
    const fraction = chordFractions[index];
    const chordX = ax + (bx - ax) * fraction;
    const chordY = ay + (by - ay) * fraction;
    return `${round(chordX + (x - chordX) * trunk)} ${round(chordY + (y - chordY) * trunk)}`;
  });

  return `M ${points[0]} L ${points[1]} Q ${points[2]} ${points[3]} L ${points[4]} Q ${points[5]} ${points[6]} L ${points[7]}`;
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

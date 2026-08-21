export type EdgeBox = { left: number; top: number; right: number; bottom: number };

export type EdgeColumnBounds = { left: number; right: number };

export type EdgeInput = {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  /** Child card: the run leaves its left edge. */
  from: EdgeBox;
  /** Parent card: the arrow lands on its right edge. */
  to: EdgeBox;
  toColumn: number;
};

/** A child→parent pair. A run carries every pair whose route travels along it. */
export type EdgeEndpoint = [string, string];

export type EdgeSegment = {
  id: string;
  d: string;
  endpoints: EdgeEndpoint[];
  /** Only the run landing on the parent card carries the arrowhead. */
  arrow: boolean;
};

/** Three or more runs meeting. Drawn as a dot, so joining reads differently from crossing. */
export type EdgeJunction = {
  id: string;
  x: number;
  y: number;
  endpoints: EdgeEndpoint[];
};

export type EdgeRouting = { segments: EdgeSegment[]; junctions: EdgeJunction[] };

/** Keeps the outermost bus clear of the cards on either side. */
const channelInset = 14;
/** Half-width of the bridge a run makes over a bus it only passes over. */
export const crossingHopRadius = 4;
/** Under this, two coordinates are the same line and a step between them would read as a kink. */
const collinearTolerance = 0.5;

/**
 * Routes a canvas's alignment edges onto one bus per parent Objective.
 *
 * Coinciding runs are emitted once rather than stacked: every child of one parent shares that
 * parent's vertical, and the edges leaving one card share a horizontal run until each peels off.
 * What survives are the two things a reader has to tell apart, so they look different -- three or
 * more runs meeting is a dot, a run passing over a bus it never joins is a small bridge.
 *
 * Every run carries the child→parent pairs travelling it, so focus can light exactly the runs a
 * chain uses even along a bus shared with edges that are not on it.
 */
export function buildEdgeRouting(edges: EdgeInput[], columns: EdgeColumnBounds[]): EdgeRouting {
  const runs = Array.from(groupBy(edges, (edge) => edge.toColumn)).flatMap(([toColumn, gapEdges]) =>
    routeGap(gapEdges, channelBounds(columns, toColumn))
  );

  return {
    segments: runs.map(({ id, d, endpoints, arrow }) => ({ id, d, endpoints, arrow })),
    junctions: collectJunctions(runs)
  };
}

type Point = { x: number; y: number };

type Run = { id: string; a: Point; b: Point; d: string; endpoints: EdgeEndpoint[]; arrow: boolean };

type Bus = {
  key: string;
  /** Where the arrow lands. */
  bx: number;
  by: number;
  /** The vertical's x. */
  cx: number;
  /** Vertical extent, from the topmost thing it connects to the bottommost. */
  top: number;
  bottom: number;
  edges: EdgeInput[];
};

function routeGap(gapEdges: EdgeInput[], gap: EdgeColumnBounds | null): Run[] {
  const buses = buildBuses(gapEdges, gap);
  const cxByTarget = new Map(buses.map((bus) => [bus.key, bus.cx]));

  /** A bus is crossed only when a run passes strictly over it -- one it ends on is a junction. */
  const crossings = (y: number, fromX: number, toX: number) =>
    buses
      .filter((bus) => bus.cx > Math.min(fromX, toX) + collinearTolerance)
      .filter((bus) => bus.cx < Math.max(fromX, toX) - collinearTolerance)
      .filter((bus) => bus.top < y - collinearTolerance && bus.bottom > y + collinearTolerance)
      .map((bus) => bus.cx);

  return [...sourceRuns(gapEdges, cxByTarget, crossings), ...busRuns(buses)];
}

/** One bus per parent Objective, ordered top to bottom so the topmost sits nearest its column. */
function buildBuses(gapEdges: EdgeInput[], gap: EdgeColumnBounds | null): Bus[] {
  const targets = Array.from(groupBy(gapEdges, targetKey))
    .map(([key, edges]) => {
      const by = centerY(edges[0].to);
      const ys = [by, ...edges.map((edge) => centerY(edge.from))];
      return { key, bx: edges[0].to.right, by, edges, top: Math.min(...ys), bottom: Math.max(...ys) };
    })
    .sort((a, b) => a.by - b.by || a.key.localeCompare(b.key));

  const lanes = channelXs(targets.length, gap, gapEdges);
  return targets.map((target, index) => ({ ...target, cx: lanes[index] }));
}

/** Evenly spread across the gap, inset from both columns. A lone bus sits in the middle. */
function channelXs(count: number, gap: EdgeColumnBounds | null, gapEdges: EdgeInput[]) {
  if (!gap) {
    /** No usable gap: fall back to the midpoint between the cards. */
    const midpoint = average(gapEdges.map((edge) => (edge.from.left + edge.to.right) / 2));
    return Array.from({ length: count }, () => midpoint);
  }

  const left = gap.left + channelInset;
  const right = gap.right - channelInset;
  if (count <= 1 || right <= left) return Array.from({ length: count }, () => (gap.left + gap.right) / 2);
  return Array.from({ length: count }, (_, index) => left + ((right - left) * index) / (count - 1));
}

/** The edges leaving one card travel together, dropping one off at each bus they reach. */
function sourceRuns(
  gapEdges: EdgeInput[],
  cxByTarget: Map<string, number>,
  crossings: (y: number, fromX: number, toX: number) => number[]
): Run[] {
  return Array.from(groupBy(gapEdges, sourceKey)).flatMap(([key, edges]) => {
    const ay = centerY(edges[0].from);
    const stops = Array.from(new Set(edges.map((edge) => cxByTarget.get(targetKey(edge)) as number)))
      .sort((a, b) => b - a);

    let cursor = edges[0].from.left;
    let carried = edges;

    return stops.flatMap((stop, index): Run[] => {
      const from = cursor;
      const travelling = carried;
      carried = carried.filter((edge) => cxByTarget.get(targetKey(edge)) !== stop);
      cursor = stop;
      if (Math.abs(stop - from) < collinearTolerance) return [];
      return [{
        id: `run:${key}:${index}`,
        a: { x: from, y: ay },
        b: { x: stop, y: ay },
        d: horizontalRun(from, stop, ay, crossings(ay, from, stop)),
        endpoints: travelling.map(pairOf),
        arrow: false
      }];
    });
  });
}

/** The vertical is cut wherever a child joins it, so focus lights only the part actually in use. */
function busRuns(buses: Bus[]): Run[] {
  return buses.flatMap((bus) => {
    const stops = Array.from(new Set([bus.by, ...bus.edges.map((edge) => centerY(edge.from))]))
      .sort((a, b) => a - b);

    const vertical = stops.slice(1).flatMap((to, index): Run[] => {
      const from = stops[index];
      const travelling = bus.edges.filter((edge) => {
        const ay = centerY(edge.from);
        return Math.min(ay, bus.by) <= from + collinearTolerance
          && Math.max(ay, bus.by) >= to - collinearTolerance;
      });
      if (travelling.length === 0) return [];
      return [{
        id: `bus:${bus.key}:${index}`,
        a: { x: bus.cx, y: from },
        b: { x: bus.cx, y: to },
        d: `M ${round(bus.cx)} ${round(from)} L ${round(bus.cx)} ${round(to)}`,
        endpoints: travelling.map(pairOf),
        arrow: false
      }];
    });

    return [...vertical, {
      id: `land:${bus.key}`,
      a: { x: bus.cx, y: bus.by },
      b: { x: bus.bx, y: bus.by },
      d: `M ${round(bus.cx)} ${round(bus.by)} L ${round(bus.bx)} ${round(bus.by)}`,
      endpoints: bus.edges.map(pairOf),
      arrow: true
    }];
  });
}

/** A straight run that arches over each bus it passes rather than through it. */
function horizontalRun(fromX: number, toX: number, y: number, crossingXs: number[]) {
  const leftward = toX < fromX;
  const ordered = [...crossingXs].sort((a, b) => (leftward ? b - a : a - b));
  const parts = [`M ${round(fromX)} ${round(y)}`];

  ordered.forEach((x) => {
    const before = leftward ? x + crossingHopRadius : x - crossingHopRadius;
    const after = leftward ? x - crossingHopRadius : x + crossingHopRadius;
    parts.push(`L ${round(before)} ${round(y)}`);
    /** The sweep flips with the direction of travel so the bridge always arches upward. */
    parts.push(
      `A ${crossingHopRadius} ${crossingHopRadius} 0 0 ${leftward ? 0 : 1} ${round(after)} ${round(y)}`
    );
  });

  parts.push(`L ${round(toX)} ${round(y)}`);
  return parts.join(" ");
}

function collectJunctions(runs: Run[]): EdgeJunction[] {
  const meeting = new Map<string, { x: number; y: number; runs: Run[] }>();
  runs.forEach((run) => {
    [run.a, run.b].forEach((point) => {
      const key = `${round(point.x)},${round(point.y)}`;
      const entry = meeting.get(key) ?? { x: round(point.x), y: round(point.y), runs: [] };
      entry.runs.push(run);
      meeting.set(key, entry);
    });
  });

  /** Two runs meeting is a corner and needs no mark. Three or more is a junction. */
  return Array.from(meeting.entries())
    .filter(([, entry]) => entry.runs.length >= 3)
    .map(([key, entry]) => ({
      id: `junction:${key}`,
      x: entry.x,
      y: entry.y,
      endpoints: entry.runs.flatMap((run) => run.endpoints)
    }));
}

function channelBounds(columns: EdgeColumnBounds[], toColumn: number) {
  const parent = columns[toColumn];
  const child = columns[toColumn + 1];
  if (!parent || !child || child.left <= parent.right) return null;
  return { left: parent.right, right: child.left };
}

function targetKey(edge: EdgeInput) {
  return `${round(edge.to.right)},${round(centerY(edge.to))}`;
}

function sourceKey(edge: EdgeInput) {
  return `${round(edge.from.left)},${round(centerY(edge.from))}`;
}

function pairOf(edge: EdgeInput): EdgeEndpoint {
  return [edge.fromNodeId, edge.toNodeId];
}

function groupBy<T, K>(items: T[], key: (item: T) => K) {
  const groups = new Map<K, T[]>();
  items.forEach((item) => {
    const group = key(item);
    groups.set(group, [...(groups.get(group) ?? []), item]);
  });
  return groups;
}

function centerY(box: EdgeBox) {
  return (box.top + box.bottom) / 2;
}

function average(values: number[]) {
  return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}

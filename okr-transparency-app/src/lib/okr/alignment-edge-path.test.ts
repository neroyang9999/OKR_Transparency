import { describe, expect, it } from "vitest";
import { buildEdgePaths, type EdgeInput } from "./alignment-edge-path";

const columns = [
  { left: 0, right: 270 },
  { left: 382, right: 652 },
  { left: 764, right: 1060 }
];

describe("alignment edge path", () => {
  it("gives edges with different parents their own vertical channels", () => {
    const paths = buildEdgePaths(
      [
        edge("a", box(382, 40), box(0, 400)),
        edge("b", box(382, 140), box(0, 600)),
        edge("c", box(382, 240), box(0, 800))
      ],
      columns
    );

    expect(paths.map((path) => channelOf(path.d))).toEqual([298, 326, 354]);
  });

  it("orders channels by the vertical position of the parent card", () => {
    const paths = buildEdgePaths(
      [
        edge("to-top", box(382, 500), box(0, 40)),
        edge("to-bottom", box(382, 60), box(0, 300))
      ],
      columns
    );

    const channelFor = (id: string) => channelOf(paths.find((path) => path.id === id)?.d as string);
    expect(channelFor("to-top")).toBeLessThan(channelFor("to-bottom"));
  });

  it("runs everything landing on one parent down the same channel", () => {
    const parent = box(0, 400);
    const paths = buildEdgePaths(
      [
        edge("a", box(382, 40), parent),
        edge("b", box(382, 140), parent),
        edge("c", box(382, 240), parent),
        edge("elsewhere", box(382, 340), box(0, 800))
      ],
      columns
    );

    const channelFor = (id: string) => channelOf(paths.find((path) => path.id === id)?.d as string);
    expect(channelFor("a")).toBe(channelFor("b"));
    expect(channelFor("b")).toBe(channelFor("c"));
    /** Two parents, so two channels -- not four. */
    expect(new Set(paths.map((path) => channelOf(path.d))).size).toBe(2);
  });

  it("gives the three routes into one parent an identical approach to merge along", () => {
    const parent = box(0, 400);
    const paths = buildEdgePaths(
      [edge("a", box(382, 40), parent), edge("b", box(382, 140), parent)],
      columns
    );

    const approachOf = (d: string) => d.slice(d.lastIndexOf("Q "));
    expect(approachOf(paths[0].d)).toBe(approachOf(paths[1].d));
  });

  it("routes downward and upward edges with matching corner directions", () => {
    const [down] = buildEdgePaths([edge("down", box(382, 400), box(0, 40))], columns);
    const [up] = buildEdgePaths([edge("up", box(382, 40), box(0, 400))], columns);

    expect(down.d).toContain("Q 326 412 326 403");
    expect(up.d).toContain("Q 326 52 326 61");
  });

  it("shrinks the corner instead of switching shape as the two cards level out", () => {
    /** The rise is what a lifted card drags through zero, so the route may not change its command
     *  structure along the way -- only how far the corner is allowed to round. */
    const cornerFor = (parentTop: number) => {
      const [path] = buildEdgePaths([edge("level", box(382, 100), box(0, parentTop))], columns);
      return { shape: shapeOf(path.d), corner: cornerOf(path.d) };
    };

    const levels = [100, 106, 110, 130, 400].map(cornerFor);
    expect(new Set(levels.map((level) => level.shape)).size).toBe(1);
    expect(levels.map((level) => level.corner)).toEqual([0, 3, 5, 9, 9]);
  });

  it("lays every point of a level pair on the straight chord", () => {
    const [path] = buildEdgePaths([edge("level", box(382, 100), box(0, 100))], columns);

    /** Both curves have their control point between their ends, so this draws as one straight run
     *  even though it is still the same six commands. */
    expect(path.d).toBe("M 382 112 L 354 112 Q 340 112 326 112 L 326 112 Q 312 112 298 112 L 270 112");
  });

  it("keeps a near-level route on its chord wherever the channel sits", () => {
    /** The channel earns its detour by being the line several routes share. A lane close to one
     *  card used to hold the run dead flat and then kink inside the short side, which reads as a
     *  mistake rather than as a connection — worst on the outermost lane, which is where the first
     *  row of the map lands. Four parents put these on four different lanes. */
    const paths = buildEdgePaths(
      [
        edge("level", box(382, 100), box(0, 100)),
        edge("one-off", box(382, 200), box(0, 201)),
        edge("two-off", box(382, 300), box(0, 302)),
        edge("four-off", box(382, 400), box(0, 404))
      ],
      columns
    );

    const offsets = paths.map((path) => offsetFromChord(path.d));
    expect(new Set(paths.map((path) => channelOf(path.d))).size).toBe(4);
    expect(offsets[0]).toBe(0);
    expect(Math.max(...offsets)).toBeLessThan(1);
  });

  it("falls back to a straight line when the horizontal run is too short for a detour", () => {
    const tight = [
      { left: 0, right: 270 },
      { left: 290, right: 560 }
    ];
    const [path] = buildEdgePaths([edge("tight", box(290, 40), box(0, 400))], tight);

    expect(path.d).toBe("M 290 52 L 270 412");
  });

  it("falls back to a straight line for edges inside a single column", () => {
    const [path] = buildEdgePaths([{ ...edge("same", box(0, 40), box(0, 400)), toColumn: 0 }], columns);

    expect(path.d).toBe("M 0 52 L 270 412");
  });

  it("draws edges that resolved to the same pair of anchors as one identical route", () => {
    const folded = box(0, 400);
    const paths = buildEdgePaths(
      [
        edge("first", box(382, 40), folded),
        edge("second", box(382, 40), folded),
        edge("other", box(382, 240), box(0, 800))
      ],
      columns
    );

    expect(paths.find((path) => path.id === "first")?.d).toBe(paths.find((path) => path.id === "second")?.d);
    expect(new Set(paths.map((path) => channelOf(path.d))).size).toBe(2);
  });

  it("keeps channels independent per column gap", () => {
    const paths = buildEdgePaths(
      [
        edge("l2", box(382, 40), box(0, 40)),
        { ...edge("l3", box(764, 40), box(382, 40)), toColumn: 1 }
      ],
      columns
    );

    expect(paths.map((path) => path.id).sort()).toEqual(["l2", "l3"]);
    expect(paths.every((path) => path.d.startsWith("M "))).toBe(true);
  });
});

function edge(id: string, from: ReturnType<typeof box>, to: ReturnType<typeof box>): EdgeInput {
  return { id, fromNodeId: `from:${id}`, toNodeId: `to:${id}`, from, to, toColumn: 0 };
}

function box(left: number, top: number, width = 270, height = 24) {
  return { left, top, right: left + width, bottom: top + height };
}

/** The furthest any point of the route strays from the straight line between its two ends. Zero is
 *  a straight run; under a pixel over a hundred-pixel span is one as far as the eye is concerned. */
function offsetFromChord(d: string) {
  const values = [...d.matchAll(/-?[\d.]+/g)].map((match) => Number(match[0]));
  const points = Array.from({ length: values.length / 2 }, (_, index) => [values[index * 2], values[index * 2 + 1]]);
  const [ax, ay] = points[0];
  const [bx, by] = points[points.length - 1];
  const worst = points.reduce((far, [x, y]) => {
    const along = ax === bx ? 0 : (x - ax) / (bx - ax);
    return Math.max(far, Math.abs(y - (ay + (by - ay) * along)));
  }, 0);
  return Math.round(worst * 100) / 100;
}

/** Every route keeps one command structure, so a change of shape is a bug rather than a variant. */
function shapeOf(d: string) {
  return d.replace(/-?[\d.]+/g, "#");
}

/** How far the first corner carries the line off its starting row -- the effective radius. */
function cornerOf(d: string) {
  const start = /^M \S+ (\S+)/.exec(d);
  const corner = /Q \S+ \S+ \S+ (\S+)/.exec(d);
  if (!start || !corner) throw new Error(`no corner in ${d}`);
  return Math.abs(Number(corner[1]) - Number(start[1]));
}

function channelOf(d: string) {
  const match = /Q (-?[\d.]+) /.exec(d);
  if (!match) throw new Error(`no channel in ${d}`);
  return Number(match[1]);
}

import { describe, expect, it } from "vitest";
import { buildEdgePaths, type EdgeInput } from "./alignment-edge-path";

const columns = [
  { left: 0, right: 270 },
  { left: 382, right: 652 },
  { left: 764, right: 1060 }
];

describe("alignment edge path", () => {
  it("gives each edge in a column gap its own vertical channel", () => {
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

  it("orders channels by the vertical position of the child card", () => {
    const paths = buildEdgePaths(
      [
        edge("low", box(382, 500), box(0, 40)),
        edge("high", box(382, 60), box(0, 300))
      ],
      columns
    );

    expect(paths.map((path) => path.id)).toEqual(["high", "low"]);
    expect(channelOf(paths[0].d)).toBeLessThan(channelOf(paths[1].d));
  });

  it("routes downward and upward edges with matching corner directions", () => {
    const [down] = buildEdgePaths([edge("down", box(382, 400), box(0, 40))], columns);
    const [up] = buildEdgePaths([edge("up", box(382, 40), box(0, 400))], columns);

    expect(down.d).toContain("Q 326 412 326 403");
    expect(up.d).toContain("Q 326 52 326 61");
  });

  it("falls back to a straight line when the two cards are nearly level", () => {
    const [path] = buildEdgePaths([edge("level", box(382, 100), box(0, 110))], columns);

    expect(path.d).toBe("M 382 112 L 270 122");
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

function channelOf(d: string) {
  const match = /Q (-?[\d.]+) /.exec(d);
  if (!match) throw new Error(`no channel in ${d}`);
  return Number(match[1]);
}

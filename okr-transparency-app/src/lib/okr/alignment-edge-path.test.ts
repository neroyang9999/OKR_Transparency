import { describe, expect, it } from "vitest";
import { buildEdgeRouting, type EdgeBox, type EdgeInput } from "./alignment-edge-path";

const columns = [
  { left: 0, right: 270 },
  { left: 382, right: 652 },
  { left: 764, right: 1060 }
];

describe("alignment edge routing", () => {
  it("puts every child of one parent on a single bus with a single arrow", () => {
    const parent = box(0, 400);
    const { segments } = buildEdgeRouting(
      [
        edge("a", box(382, 40), parent),
        edge("b", box(382, 140), parent),
        edge("c", box(382, 240), parent)
      ],
      columns
    );

    expect(new Set(segments.filter(isBus).map((segment) => startXOf(segment.d))).size).toBe(1);
    expect(segments.filter((segment) => segment.arrow)).toHaveLength(1);
  });

  it("cuts the bus at each join so a focus lights only the part in use", () => {
    const parent = box(0, 400);
    const { segments } = buildEdgeRouting(
      [
        edge("a", box(382, 40), parent),
        edge("b", box(382, 140), parent),
        edge("c", box(382, 240), parent)
      ],
      columns
    );

    /** The run thickens towards the parent: one edge above the second join, three below the last. */
    expect(segments.filter(isBus).map((segment) => segment.endpoints.length)).toEqual([1, 2, 3]);
  });

  it("keeps the edges leaving one card on one run until each peels off", () => {
    const child = box(382, 40);
    const { segments } = buildEdgeRouting(
      [
        edge("near", child, box(0, 20)),
        edge("mid", child, box(0, 120)),
        edge("far", child, box(0, 220))
      ],
      columns
    );

    const runs = segments.filter((segment) => segment.id.startsWith("run:"));
    expect(runs.map((segment) => segment.endpoints.length)).toEqual([3, 2, 1]);
    /** Each run starts where the previous stopped, so the shared stretch is drawn once. */
    expect(runs.map((segment) => segment.d)).toEqual([
      "M 382 52 L 368 52",
      "M 368 52 L 326 52",
      "M 326 52 L 284 52"
    ]);
  });

  it("marks three runs meeting with a junction and leaves a corner unmarked", () => {
    const parent = box(0, 400);
    const { junctions } = buildEdgeRouting(
      [edge("a", box(382, 40), parent), edge("b", box(382, 140), parent)],
      columns
    );

    /** The join at 152 is a junction; the two ends of the bus are corners. */
    expect(junctions.map((junction) => `${junction.x},${junction.y}`)).toEqual(["326,152"]);
  });

  it("arches a run over a bus it only passes over", () => {
    const { segments } = buildEdgeRouting(
      [
        edge("passes", box(382, 40), box(0, 20)),
        edge("crossed", box(382, 8), box(0, 188))
      ],
      columns
    );

    const passing = segments.find((segment) => segment.endpoints.some(([from]) => from === "from:passes"));
    expect(passing?.d).toBe("M 382 52 L 372 52 A 4 4 0 0 0 364 52 L 284 52");
  });

  it("does not arch over a bus the run ends on", () => {
    const child = box(382, 40);
    const { segments } = buildEdgeRouting(
      [edge("near", child, box(0, 20)), edge("far", child, box(0, 220))],
      columns
    );

    expect(segments.filter((segment) => segment.d.includes("A "))).toEqual([]);
  });

  it("orders buses by parent position and insets them from both columns", () => {
    const { segments } = buildEdgeRouting(
      [
        edge("low", box(382, 300), box(0, 220)),
        edge("high", box(382, 40), box(0, 20))
      ],
      columns
    );

    const laneOf = (key: string) =>
      startXOf(segments.find((segment) => segment.id === `land:${key}`)?.d as string);

    /** Gap 270..382 inset by 14 either side; the topmost parent takes the near lane. */
    expect(laneOf("270,32")).toBe(284);
    expect(laneOf("270,232")).toBe(368);
  });

  it("keeps channels independent per column gap", () => {
    const { segments } = buildEdgeRouting(
      [
        edge("l2", box(382, 40), box(0, 40)),
        edge("l3", box(764, 40), box(382, 40), 1)
      ],
      columns
    );

    expect(segments.filter((segment) => segment.arrow)).toHaveLength(2);
    expect(segments.every((segment) => segment.d.startsWith("M "))).toBe(true);
  });

  it("falls back to the midpoint between the cards when there is no column gap to use", () => {
    const { segments } = buildEdgeRouting([edge("orphan", box(764, 40), box(382, 400), 2)], columns);

    /** No column beyond the parent's, so the bus sits halfway between the two cards. */
    expect(segments.find((segment) => segment.arrow)?.d).toBe("M 708 412 L 652 412");
  });

  it("returns nothing for no edges", () => {
    expect(buildEdgeRouting([], columns)).toEqual({ segments: [], junctions: [] });
  });
});

function edge(id: string, from: EdgeBox, to: EdgeBox, toColumn = 0): EdgeInput {
  return { id, fromNodeId: `from:${id}`, toNodeId: `to:${id}`, from, to, toColumn };
}

function box(left: number, top: number, width = 270, height = 24): EdgeBox {
  return { left, top, right: left + width, bottom: top + height };
}

function isBus(segment: { id: string }) {
  return segment.id.startsWith("bus:");
}

function startXOf(d: string) {
  const match = /^M (-?[\d.]+) /.exec(d);
  if (!match) throw new Error(`no start in ${d}`);
  return Number(match[1]);
}

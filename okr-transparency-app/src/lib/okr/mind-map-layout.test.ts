import { describe, expect, it } from "vitest";
import { buildMindMapLayout, mindMapCardHeight, type PositionedMapNode } from "./mind-map-layout";
import type { OrganizationMapNode } from "./organization-alignment-map";

describe("mind map layout", () => {
  it("centers each visual child group behind its parent without overlapping a shared column", () => {
    const softwareObjectives = [1, 2, 3].map((index) => node(`sw-o${index}`, "objective"));
    const application = node("application", "team", [node("app-o1", "objective")], 1);
    const tpm = node("tpm", "team", [1, 2, 3].map((index) => node(`tpm-o${index}`, "objective")), 1);
    const software = node("software", "team", [...softwareObjectives, application, tpm]);
    const layout = buildMindMapLayout([node("engineering", "engineering", [software])], new Set());

    const softwarePosition = position(layout.nodes, "software");
    const ownObjectivePositions = softwareObjectives.map((objective) => position(layout.nodes, objective.id));
    const applicationPosition = position(layout.nodes, "application");
    const tpmPosition = position(layout.nodes, "tpm");

    expect(midpoint(ownObjectivePositions[0], ownObjectivePositions[2])).toBe(center(softwarePosition));
    expect(midpoint(applicationPosition, tpmPosition)).toBe(center(softwarePosition));

    const deepestColumn = layout.nodes.filter((item) => item.depth === 4).sort((a, b) => a.y - b.y);
    deepestColumn.slice(1).forEach((item, index) => {
      expect(item.y - deepestColumn[index].y).toBeGreaterThanOrEqual(mindMapCardHeight);
    });
  });

  it("removes collapsed descendants from measurement and placement", () => {
    const software = node("software", "team", [node("sw-o1", "objective"), node("sw-o2", "objective")]);
    const layout = buildMindMapLayout([node("engineering", "engineering", [software])], new Set(["software"]));

    expect(layout.nodes.map((item) => item.node.id)).toEqual(["engineering", "software"]);
  });
});

function node(
  id: string,
  kind: OrganizationMapNode["kind"],
  children: OrganizationMapNode[] = [],
  visualIndent?: number
): OrganizationMapNode {
  return {
    id,
    kind,
    label: id,
    children,
    visualIndent,
    alignmentChildCount: 0,
    objectiveCount: kind === "objective" ? 1 : children.reduce((sum, child) => sum + child.objectiveCount, 0),
    keyResultCount: 0,
    averageProgress: null
  };
}

function position(nodes: PositionedMapNode[], id: string) {
  const result = nodes.find((item) => item.node.id === id);
  if (!result) throw new Error(`Missing ${id}`);
  return result;
}

function center(item: PositionedMapNode) {
  return item.y + mindMapCardHeight / 2;
}

function midpoint(a: PositionedMapNode, b: PositionedMapNode) {
  return (center(a) + center(b)) / 2;
}

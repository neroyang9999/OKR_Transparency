import type { OrganizationMapNode } from "./organization-alignment-map";

export const mindMapCardWidth = 330;
export const mindMapCardHeight = 112;

const columnGap = 420;
const rowGap = 104;
const canvasPadding = 80;

export type PositionedMapNode = {
  node: OrganizationMapNode;
  x: number;
  y: number;
  depth: number;
};

export type MapConnector = {
  from: PositionedMapNode;
  to: PositionedMapNode;
  kind?: "organization" | "member";
};

type MeasuredNode = {
  node: OrganizationMapNode;
  depth: number;
  top: number;
  bottom: number;
  childGroups: Array<Array<{ child: MeasuredNode; centerOffset: number }>>;
};

export function buildMindMapLayout(roots: OrganizationMapNode[], collapsedIds: Set<string>) {
  const nodes: PositionedMapNode[] = [];
  const connectors: MapConnector[] = [];
  let maxDepth = 0;

  const measuredRoots = roots.map((root) => measureNode(root, 0, collapsedIds));
  let nextTop = canvasPadding;

  function place(measured: MeasuredNode, centerY: number): PositionedMapNode {
    maxDepth = Math.max(maxDepth, measured.depth);
    const positioned: PositionedMapNode = {
      node: measured.node,
      x: canvasPadding + measured.depth * columnGap,
      y: centerY - mindMapCardHeight / 2,
      depth: measured.depth
    };
    nodes.push(positioned);

    measured.childGroups.flat().forEach(({ child, centerOffset }) => {
      const childPosition = place(child, centerY + centerOffset);
      connectors.push({
        from: positioned,
        to: childPosition,
        kind: measured.node.kind === "objective" && child.node.objectiveNode?.objective.objective_scope === "member"
          ? "member"
          : "organization"
      });
    });
    return positioned;
  }

  measuredRoots.forEach((root) => {
    const centerY = nextTop - root.top;
    place(root, centerY);
    nextTop = centerY + root.bottom + rowGap;
  });

  return {
    nodes,
    connectors,
    width: canvasPadding * 2 + mindMapCardWidth + maxDepth * columnGap,
    height: Math.max(640, nextTop - rowGap + canvasPadding)
  };
}

function measureNode(node: OrganizationMapNode, depth: number, collapsedIds: Set<string>): MeasuredNode {
  const expandedChildren = collapsedIds.has(node.id) ? [] : node.children;
  const childrenByDepth = new Map<number, MeasuredNode[]>();

  expandedChildren.forEach((child) => {
    const childDepth = depth + 1 + (child.visualIndent ?? 0);
    const measured = measureNode(child, childDepth, collapsedIds);
    childrenByDepth.set(childDepth, [...(childrenByDepth.get(childDepth) ?? []), measured]);
  });

  let top = -mindMapCardHeight / 2;
  let bottom = mindMapCardHeight / 2;
  const childGroups = Array.from(childrenByDepth.values()).map((children) => {
    const positioned: Array<{ child: MeasuredNode; centerOffset: number }> = [];

    children.forEach((child, index) => {
      const previous = positioned[index - 1];
      const centerOffset = previous
        ? previous.centerOffset + previous.child.bottom + rowGap - child.top
        : 0;
      positioned.push({ child, centerOffset });
    });

    if (positioned.length > 1) {
      const shift = -(positioned[0].centerOffset + positioned[positioned.length - 1].centerOffset) / 2;
      positioned.forEach((item) => { item.centerOffset += shift; });
    }

    positioned.forEach(({ child, centerOffset }) => {
      top = Math.min(top, centerOffset + child.top);
      bottom = Math.max(bottom, centerOffset + child.bottom);
    });
    return positioned;
  });

  return { node, depth, top, bottom, childGroups };
}

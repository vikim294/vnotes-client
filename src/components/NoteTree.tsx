import { Fragment, useMemo, type ReactNode } from "react";
import { createLine, findAncestorsByIdInFlatTreeMap } from "../lib";
import type { NodeData } from "../types";
import NoteNode from "./NoteNode";

interface NoteTreeProps {
  flatTree: NodeData[];
  renderNode?: (node: NodeData) => ReactNode;
}

// support multi-root tree
const NoteTree = ({ flatTree, renderNode }: NoteTreeProps) => {
  const nodesMap = useMemo<Map<number | string, NodeData>>(() => {
    const map = new Map<number | string, NodeData>();
    flatTree.forEach((node) => {
      map.set(node.id, node);
    });
    return map;
  }, [flatTree])

  const edges = [];
  const nodes = [];

  for (const node of flatTree) {
    const ancestorNodes = findAncestorsByIdInFlatTreeMap(nodesMap, node.id);
    const areAllAncestorsExpanded = ancestorNodes.every(
      (item) => item.expanded !== false,
    );

    const edgeVisible =
      node.parentId && areAllAncestorsExpanded && node.opStatus !== "deleted";
    const nodeVisible =
      (!node.parentId || (areAllAncestorsExpanded)) && node.opStatus !== "deleted";

    if (edgeVisible) {
      const parent = ancestorNodes[0];
      if (parent) {
        const e = createLine(
          `line-${parent.id}-${node.id}`,
          parent.x,
          parent.y,
          node.x,
          node.y,
        );

        edges.push(e);
      }
    }

    if (nodeVisible) {
      const n = renderNode ? (
        <Fragment key={node.id}>{renderNode(node)}</Fragment>
      ) : (
        <NoteNode key={node.id} {...node} />
      );
      nodes.push(n);
    }
  }

  return (
    <g>
      {edges}
      {nodes}
    </g>
  );
};

export default NoteTree;

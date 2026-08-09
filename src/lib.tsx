import type { NodeData, Point } from "./types";

export const createCircle = (cx: number, cy: number, r: number = 1) => {
  return <circle cx={cx} cy={cy} r={r} fill="red" />;
};

export const createLine = (
  id: string,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
) => {
  return <line key={id} x1={x1} y1={y1} x2={x2} y2={y2} stroke="white" />;
};

export const flattenTree = (node: NodeData, result: NodeData[] = []) => {
  const cur = { ...node };
  delete cur.children;
  result.push(cur);

  if (node.children) {
    node.children.forEach((child) => {
      const newChild = { ...child, parentId: node.id };
      flattenTree(newChild, result);
    });
  }
  return result;
};

export const findDescendantsByIdInFlatTree = (
  flatTree: NodeData[],
  id: number | string,
  result: NodeData[] = [],
) => {
  for (const item of flatTree) {
    if (item.parentId === id) {
      result.push(item);
      findDescendantsByIdInFlatTree(flatTree, item.id, result);
    }
  }
  return result;
};

export const findAncestorsByIdInFlatTreeMap = (
  flatTreeMap: Map<number | string, NodeData>,
  id: number | string,
  result: NodeData[] = [],
) => {
  const currentNode = flatTreeMap.get(id);
  if (currentNode?.parentId) {
    const parentNode = flatTreeMap.get(currentNode?.parentId);
    if (parentNode) {
      result.push(parentNode);
      findAncestorsByIdInFlatTreeMap(flatTreeMap, parentNode.id, result);
    }
  }
  return result;
};

export const getDistanceBetweenTwoPoints = (p1: Point, p2: Point) => {
  return Math.sqrt(
    (p1.x - p2.x) * (p1.x - p2.x) + (p1.y - p2.y) * (p1.y - p2.y),
  );
};

export const handleTapEnter = (cb: () => void) => {
  return (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      cb();
    }
  };
};

export const noop = () => {};

export function debounce<T>(
  func: (args: T) => void,
  wait: number,
): (args: T) => void {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  return (args) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => func(args), wait);
  };
}

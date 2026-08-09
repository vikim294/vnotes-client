import type { NodeData } from "../types";

// 树形结构只是为了方便测试和展示，如：人工添加、编辑、删除结点
const tree: NodeData = {
  id: 1,
  label: "today",
  x: 100,
  y: 100,
  children: [
    {
      id: 2,
      label: "study",
      x: 300,
      y: 40,
      children: [
        {
          id: 5,
          label: "js",
          x: 500,
          y: 40,
        },
        {
          id: 6,
          label: "project",
          x: 500,
          y: 100,
        },
      ],
    },
    {
      id: 3,
      label: "game",
      x: 300,
      y: 100,
    },
    {
      id: 4,
      label: "code",
      x: 300,
      y: 200,
      children: [
        {
          id: 7,
          label: "work",
          x: 500,
          y: 200,
        },
      ],
    },
  ],
};

const flattenedTree: NodeData[] = [
  { id: 1, label: "today", x: 100, y: 100, parentId: null },
  { id: 2, label: "study", x: 300, y: 40, parentId: 1 },
  // { id: 5, label: "js", x: 500, y: 40, parentId: 2 },
  // { id: 6, label: "project", x: 500, y: 100, parentId: 2 },
  // { id: 3, label: "game", x: 300, y: 100, parentId: 1 },
  // { id: 4, label: "code", x: 300, y: 200, parentId: 1 },
  // { id: 7, label: "work", x: 500, y: 200, parentId: 4 },

  { id: 8, label: "tomorrow", x: 200, y: 300, parentId: null },
  // { id: 9, label: "sleep", x: 400, y: 300, parentId: 8 },
];

export { tree, flattenedTree };

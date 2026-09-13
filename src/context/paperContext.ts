import { createContext } from "react";
import type { NodeMenuExpose } from "../components/NodeMenu";
import type { NodeData } from "../types";

const PaperContext = createContext<{
  graphType: "directory" | "detail";
  browseMode: boolean;
  flatTree: NodeData[];
  editMode: boolean;
  viewportZoom: number;
  selectedNodeId: number | string | null;
  nodeMenuRef: React.RefObject<NodeMenuExpose | null>;
  isChoosingParent: boolean;
  setFlatTree: React.Dispatch<React.SetStateAction<NodeData[]>>;
  setNodeMenuVisible: React.Dispatch<React.SetStateAction<boolean>>;
  setSelectedNodeId: React.Dispatch<React.SetStateAction<number | string | null>>;
  setChosenParentNodeId: React.Dispatch<React.SetStateAction<number | string | null>>;
  openArticle: (detailNodeId: number, mode: "view" | "edit") => void;
} | null>(null);

export default PaperContext;

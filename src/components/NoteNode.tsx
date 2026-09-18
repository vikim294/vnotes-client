import {
  use,
  useEffect,
  // useMemo,
  useRef,
  useState,
} from "react";
import { useNavigate } from "react-router";

import PaperContext from "../context/paperContext";
import { findDescendantsByIdInFlatTree } from "../lib";
import type { NodeData } from "../types";
import type { Size } from "../types/note";
import { Toast } from "../components/Toast";
import NoteNodeView, { NODE_PADDING_X } from "./NoteNodeView";

const MIN_IMAGE_SHORT_SIDE = 50;

const createNodeMenuEvent = (detail: {
  nodeId: number | string;
  source: "longtap" | "contextmenu";
  x: number;
  y: number;
}) => {
  return new CustomEvent("nodemenu", {
    bubbles: true,
    cancelable: true,
    detail,
  });
};

export default function NoteNode(node: NodeData) {
  const {
    id,
    x,
    y,
    // expanded,
    nodeType,
    contentType,
    article,
    refDirectoryNodeId,
    refDetailNodeId,
  } = node;
  const navigate = useNavigate();

  // context
  const paperContext = use(PaperContext);
  const graphType = paperContext?.graphType;
  const browseMode = paperContext?.browseMode;
  const flatTree = paperContext?.flatTree;
  const editMode = paperContext?.editMode;
  const isSaving = paperContext?.isSaving;
  const viewportZoom = paperContext?.viewportZoom;
  const setSelectedNodeId = paperContext?.setSelectedNodeId;
  const nodeMenuRef = paperContext?.nodeMenuRef;
  const isChoosingParent = paperContext?.isChoosingParent;
  const setFlatTree = paperContext?.setFlatTree;
  const setNodeMenuVisible = paperContext?.setNodeMenuVisible;
  const selectedNodeId = paperContext?.selectedNodeId;
  const setChosenParentNodeId = paperContext?.setChosenParentNodeId;
  const openArticle = paperContext?.openArticle;
  const openReferencedDetailNode = paperContext?.openReferencedDetailNode;

  const gRef = useRef<SVGGElement | null>(null);
  const positionRef = useRef({
    isDragging: false,
    startX: 0,
    startY: 0,
  });
  const resizeRef = useRef({
    isResizing: false,
    startX: 0,
    startY: 0,
    startWidth: 0,
    startHeight: 0,
    currentWidth: 0,
    currentHeight: 0,
  });

  const tapInfoRef = useRef<{
    timerForLongTap: number | null;
    timerForDoubleTap: number | null;
    startX: number;
    startY: number;
  }>({
    timerForLongTap: null,
    timerForDoubleTap: null,
    startX: 0,
    startY: 0,
  });

  const descendantIdsRef = useRef<(number | string)[]>([]);
  // const hasChildren = useMemo(() => {
  //   return flatTree?.some((item) => item.parentId === id);
  // }, [flatTree, id]);

  // used for double tap
  const firstTapRef = useRef(false);

  // node size
  const [nodeSize, setNodeSize] = useState<Size>({
    width: 0,
    height: 0,
  });

  const showOpenMenu = (e: React.MouseEvent<SVGGElement, MouseEvent>) => {
    e.preventDefault();
    if (!editMode) return;

    gRef.current?.dispatchEvent(
      createNodeMenuEvent({
        nodeId: id,
        source: "contextmenu",
        x: e.clientX,
        y: e.clientY,
      }),
    );
  };

  const handlePointerDown = (e: React.PointerEvent<SVGGElement>) => {
    if (isChoosingParent) {
      // 检查是否选择了自身作为父节点
      if (id === selectedNodeId) {
        Toast.error("new parent node cannot be itself!");
        return;
      }
      // 检查是否选择了已经是父节点的节点
      if (flatTree && selectedNodeId) {
        const selectedNode = flatTree.find((item) => item.id === selectedNodeId);
        if (selectedNode?.parentId === id) {
          Toast.error("this node is already the parent!");
          return;
        }
      }
      // 检查是否选择了 detail 节点
      if (nodeType === "DETAIL") {
        Toast.error("cannot choose a detail node as parent!");
        return;
      }
      // 检查是否选择了子孙节点作为父节点
      if (flatTree && selectedNodeId) {
        const descendants = findDescendantsByIdInFlatTree(
          flatTree,
          selectedNodeId,
        );
        if (descendants.some((item) => item.id === id)) {
          Toast.error("new parent node cannot be its descendant!");
          return;
        }
      }
      setChosenParentNodeId?.(id);
      return;
    }

    if (e.pointerType === "mouse") return;

    if (firstTapRef.current === false) {
      firstTapRef.current = true;

      // reset double tap after 200ms
      if (tapInfoRef.current.timerForDoubleTap) {
        clearTimeout(tapInfoRef.current.timerForDoubleTap);
      }

      tapInfoRef.current.timerForDoubleTap = setTimeout(() => {
        tapInfoRef.current.timerForDoubleTap = null;

        if (firstTapRef.current) {
          firstTapRef.current = false;
        }
      }, 200);
    } else {
      // handle double tap
      handleDoubleClick();
      firstTapRef.current = false;
      return;
    }

    // allow long tap only in edit mode
    if (!editMode) return;
    if (!e.isPrimary) return;

    // tap 后开启定时器
    if (tapInfoRef.current.timerForLongTap) {
      clearTimeout(tapInfoRef.current.timerForLongTap);
    }

    // triggerlong tap after 500ms
    tapInfoRef.current.startX = e.clientX;
    tapInfoRef.current.startY = e.clientY;
    tapInfoRef.current.timerForLongTap = setTimeout(() => {
      tapInfoRef.current.timerForLongTap = null;

      gRef.current?.dispatchEvent(
        createNodeMenuEvent({
          nodeId: id,
          source: "longtap",
          x: e.clientX,
          y: e.clientY,
        }),
      );
    }, 500);
  };

  const handlePointerMove = (e: React.PointerEvent<SVGGElement>) => {
    // allow drag only in edit mode
    if (!editMode) return;

    // reset double tap if moved
    if (firstTapRef.current) {
      firstTapRef.current = false;
    }

    // TODO: 验证交互
    // tap 后移动超过10px，则认为是拖拽，而不是 menu
    if (tapInfoRef.current.timerForLongTap) {
      const deltaX = e.clientX - tapInfoRef.current.startX;
      const deltaY = e.clientY - tapInfoRef.current.startY;
      if (Math.abs(deltaX) > 10 || Math.abs(deltaY) > 10) {
        clearTimeout(tapInfoRef.current.timerForLongTap);
        tapInfoRef.current.timerForLongTap = null;
      }
    }
  };

  const handlePointerUp = () => {
    if (tapInfoRef.current.timerForLongTap) {
      clearTimeout(tapInfoRef.current.timerForLongTap);
      tapInfoRef.current.timerForLongTap = null;
    }
  };

  const handlePointerCancel = () => {
    if (tapInfoRef.current.timerForLongTap) {
      clearTimeout(tapInfoRef.current.timerForLongTap);
      tapInfoRef.current.timerForLongTap = null;
    }
  };

  const handleImageResizeStart = (
    e: React.PointerEvent<SVGRectElement>,
  ) => {
    // why doesn't work? (<g>'s onPointerDown will trigger first...)
    // because of the React's synthetic event system
    e.stopPropagation();
    if (!editMode || isSaving) return;

    const resizeHandle = e.currentTarget;
    const displayWidth = nodeSize.width - NODE_PADDING_X;
    const displayHeight = nodeSize.height - NODE_PADDING_X;

    resizeHandle.setPointerCapture(e.pointerId);

    resizeRef.current.isResizing = true;
    resizeRef.current.startX = e.clientX;
    resizeRef.current.startY = e.clientY;
    resizeRef.current.startWidth = displayWidth;
    resizeRef.current.startHeight = displayHeight;
    resizeRef.current.currentWidth = displayWidth;
    resizeRef.current.currentHeight = displayHeight;

    const aspectRatio =
      resizeRef.current.startWidth > 0 && resizeRef.current.startHeight > 0
        ? resizeRef.current.startWidth / resizeRef.current.startHeight
        : 1;
    const minWidth =
      aspectRatio >= 1
        ? MIN_IMAGE_SHORT_SIDE * aspectRatio
        : MIN_IMAGE_SHORT_SIDE;

    const handleResizeMove = (moveEvent: PointerEvent) => {
      if (!resizeRef.current.isResizing) return;

      // 考虑 viewport zoom 的影响，保证在不同 zoom 下 resize 的感觉一致
      const deltaX =
        (moveEvent.clientX - resizeRef.current.startX) * (viewportZoom || 1);
      const deltaY =
        (moveEvent.clientY - resizeRef.current.startY) * (viewportZoom || 1);

      // Use Euclidean distance for more natural diagonal resizing
      const delta =
        Math.sqrt(deltaX * deltaX + deltaY * deltaY) *
        Math.sign(deltaX + deltaY);

      const newWidth = Math.max(
        minWidth,
        resizeRef.current.startWidth + delta,
      );
      const newHeight = newWidth / aspectRatio;

      // Update local size for immediate feedback
      setNodeSize({
        width: newWidth + NODE_PADDING_X,
        height: newHeight + NODE_PADDING_X,
      });

      // store current size in ref for use in handleResizeEnd
      resizeRef.current.currentWidth = newWidth;
      resizeRef.current.currentHeight = newHeight;
    };

    function removeResizeListeners() {
      resizeHandle.removeEventListener("pointermove", handleResizeMove);
      resizeHandle.removeEventListener("pointerup", handleResizeEnd);
      resizeHandle.removeEventListener("pointercancel", handleResizeCancel);
      resizeHandle.removeEventListener("lostpointercapture", handleLostPointerCapture);
    }

    function finishResize() {
      if (!resizeRef.current.isResizing) return;

      resizeRef.current.isResizing = false;
      removeResizeListeners();

      // Update flatTree with new dimensions
      if (setFlatTree && flatTree) {
        setFlatTree((prev) =>
          prev.map((item) =>
            item.id === id
              ? {
                  ...item,
                  imageWidth: resizeRef.current.currentWidth,
                  imageHeight: resizeRef.current.currentHeight,
                  opStatus: item.opStatus === "new" ? "new" : "edited",
                }
              : item,
          ),
        );
      }
    }

    function handleResizeEnd() {
      finishResize();
    }

    function handleResizeCancel() {
      finishResize();
    }

    // ⭐️ handle 失去鼠标捕获时，也要完成本次 resize
    function handleLostPointerCapture() {
      finishResize();
    }

    resizeHandle.addEventListener("pointermove", handleResizeMove);
    resizeHandle.addEventListener("pointerup", handleResizeEnd);
    resizeHandle.addEventListener("pointercancel", handleResizeCancel);
    resizeHandle.addEventListener("lostpointercapture", handleLostPointerCapture);
  };

  const handleDoubleClick = () => {
    if (!browseMode) {
      if (
        graphType === "detail" &&
        contentType === "REF_NOTE" &&
        typeof refDirectoryNodeId === "number"
      ) {
        navigate(`/noteDetails/${refDirectoryNodeId}`, {
          state: { resetView: true },
        });
        return;
      }

      if (
        graphType === "detail" &&
        (contentType === "REF_DETAIL" || contentType === "REF_ARTICLE") &&
        typeof refDetailNodeId === "number"
      ) {
        openReferencedDetailNode?.(refDetailNodeId);
        return;
      }

      if (graphType === "detail" && article && typeof id === "number") {
        openArticle?.(id, "view");
        return;
      }

      if (nodeType === "DETAIL") {
        navigate(`/noteDetails/${id}`, { state: { resetView: true } });
      }
    }

    // if (!editMode || !hasChildren) return;
    // const newExpanded = expanded === false ? true : false;

    // setFlatTree?.((prev) => {
    //   return prev.map((item) => {
    //     if (item.id === id) {
    //       return {
    //         ...item,
    //         expanded: newExpanded || newExpanded === undefined,
    //       };
    //     }
    //     return item;
    //   });
    // });
  };

  // drag node
  useEffect(() => {
    const gElem = gRef.current;
    const positionData = positionRef.current;

    const onPointerDown = (e: PointerEvent) => {
      if (!editMode) return;
      if (
        e.target instanceof SVGRectElement &&
        e.target.dataset.elType === "resize-handle"
      ) {
        // 点击了 resize handle，不触发拖动
        return;
      }

      // 只接受鼠标左键
      if (e.button !== 0) {
        return;
      }

      positionData.isDragging = true;
      positionData.startX = e.clientX;
      positionData.startY = e.clientY;

      // ⭐ after pointer down, "bind" the current pointer event to the g element.
      gElem?.setPointerCapture(e.pointerId);

      // get descendant nodes
      if (flatTree) {
        descendantIdsRef.current = findDescendantsByIdInFlatTree(
          flatTree,
          id,
        ).map((item) => item.id);
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!positionData.isDragging) return;
      // console.log("pm");

      const deltaX = e.clientX - positionData.startX;
      const deltaY = e.clientY - positionData.startY;

      // update state
      setFlatTree?.((prev) => {
        return prev.map((item) => {
          if (item.id === id || descendantIdsRef.current.includes(item.id)) {
            return {
              ...item,
              x: item.x + deltaX * (viewportZoom ?? 1),
              y: item.y + deltaY * (viewportZoom ?? 1),
              opStatus: !item.opStatus ? "edited" : item.opStatus,
            };
          } else {
            return item;
          }
        });
      });

      // update positionRef
      positionData.startX = e.clientX;
      positionData.startY = e.clientY;
    };

    const onPointerUp = (e: PointerEvent) => {
      positionData.isDragging = false;

      if (gElem?.hasPointerCapture(e.pointerId)) {
        gElem.releasePointerCapture(e.pointerId);
      }
    };

    // ⭐️ 节点失去鼠标捕获时（如：右键节点打开 menu 及遮罩），更新 isDragging 为 false
    const onLostPointerCapture = () => {
      positionData.isDragging = false;
    };

    gElem?.addEventListener("pointerdown", onPointerDown);
    gElem?.addEventListener("pointermove", onPointerMove);
    gElem?.addEventListener("pointerup", onPointerUp);
    gElem?.addEventListener("lostpointercapture", onLostPointerCapture);

    return () => {
      gElem?.removeEventListener("pointerdown", onPointerDown);
      gElem?.removeEventListener("pointermove", onPointerMove);
      gElem?.removeEventListener("pointerup", onPointerUp);
      gElem?.removeEventListener("lostpointercapture", onLostPointerCapture);
    };
  }, [id, editMode, viewportZoom, flatTree, setFlatTree]);

  // menu event
  useEffect(() => {
    const gElem = gRef.current;

    const onNodeMenu = (
      e: CustomEvent<{
        nodeId: number;
        source: "longtap" | "contextmenu";
        x: number;
        y: number;
      }>,
    ) => {
      // console.log("node menu", e);
      setSelectedNodeId?.(e.detail.nodeId);

      nodeMenuRef?.current?.setPosition({
        x: e.detail.x,
        y: e.detail.y,
      });
      setNodeMenuVisible?.(true);
    };

    gElem?.addEventListener("nodemenu", onNodeMenu as EventListener);

    return () => {
      gElem?.removeEventListener("nodemenu", onNodeMenu as EventListener);
    };
  }, [setSelectedNodeId, nodeMenuRef, setNodeMenuVisible]);

  useEffect(() => {
    const tapInfo = tapInfoRef.current;

    return () => {
      if (tapInfo.timerForLongTap) {
        clearTimeout(tapInfo.timerForLongTap);
        tapInfo.timerForLongTap = null;
      }

      if (tapInfo.timerForDoubleTap) {
        clearTimeout(tapInfo.timerForDoubleTap);
        tapInfo.timerForDoubleTap = null;
      }
    };
  }, []);

  return (
    // double tap(double click) -> expand/collapse
    // drag -> move node
    // long tap(right click) -> open menu
    <g
      className={editMode ? "cursor-pointer" : ""}
      key={id}
      transform={`translate(${x}, ${y})`}
      ref={gRef}
      onContextMenu={showOpenMenu}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onDoubleClick={handleDoubleClick}
    >
      <NoteNodeView
        node={node}
        graphType={graphType ?? "detail"}
        browseMode={browseMode}
        size={nodeSize}
        onSizeChange={setNodeSize}
      />
      {contentType === "IMAGE" && editMode && !isSaving && (
        <rect
          data-el-type={"resize-handle"}
          x={
            (nodeSize.width - NODE_PADDING_X) / 2 -
            6 * (viewportZoom || 1)
          }
          y={
            (nodeSize.height - NODE_PADDING_X) / 2 -
            6 * (viewportZoom || 1)
          }
          width={12 * (viewportZoom || 1)}
          height={12 * (viewportZoom || 1)}
          fill="var(--color-primary, #3b82f6)"
          stroke="white"
          strokeWidth={2 * (viewportZoom || 1)}
          rx={2 * (viewportZoom || 1)}
          className="cursor-se-resize"
          onPointerDown={handleImageResizeStart}
        />
      )}
    </g>
  );
}

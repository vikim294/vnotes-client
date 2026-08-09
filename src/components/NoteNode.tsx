import {
  use,
  useEffect,
  useLayoutEffect,
  // useMemo,
  useRef,
  useState,
} from "react";
import PaperContext from "../context/paperContext";
import { findDescendantsByIdInFlatTree } from "../lib";
import type { Size } from "../types/note";
import { useNavigate } from "react-router";
import { Share2 } from "lucide-react";
import type { NodeData, NodeType } from "../types";
import { getImageNodeUrl } from "../utils";
import { Toast } from "../components/Toast";

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

export default function NoteNode({
  id,
  x,
  y,
  label,
  // expanded,
  markType,
  nodeType,
  isShared,
  contentType,
  imageUrl,
  isTempImageUrl,
  imageWidth,
  imageHeight,
}: NodeData) {
  const navigate = useNavigate();

  // context
  const paperContext = use(PaperContext);
  const graphType = paperContext?.graphType;
  const browseMode = paperContext?.browseMode;
  const flatTree = paperContext?.flatTree;
  const editMode = paperContext?.editMode;
  const viewportZoom = paperContext?.viewportZoom;
  const setSelectedNodeId = paperContext?.setSelectedNodeId;
  const nodeMenuRef = paperContext?.nodeMenuRef;
  const isChoosingParent = paperContext?.isChoosingParent;
  const setFlatTree = paperContext?.setFlatTree;
  const setNodeMenuVisible = paperContext?.setNodeMenuVisible;
  const selectedNodeId = paperContext?.selectedNodeId;
  const setChosenParentNodeId = paperContext?.setChosenParentNodeId;

  const gRef = useRef<SVGGElement | null>(null);
  const positionRef = useRef({
    isDragging: false,
    startX: 0,
    startY: 0,
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
        const selectedNode = flatTree.find((node) => node.id === selectedNodeId);
        if (selectedNode?.parentId === id) {
          Toast.error("this node is already the parent!");
          return;
        }
      }
      // 检查是否选择了 detail 节点
      if (nodeType === 'DETAIL') {
        Toast.error("cannot choose a detail node as parent!");
        return;
      }
      // 检查是否选择了子孙节点作为父节点
      if (flatTree && selectedNodeId) {
        const descendants = findDescendantsByIdInFlatTree(
          flatTree,
          selectedNodeId,
        );
        if (descendants.some((node) => node.id === id)) {
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

  const handleDoubleClick = () => {
    if (!browseMode) {
      if (nodeType === 'DETAIL') {
        navigate(`/noteDetails/${id}?label=${label}`);
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

    const onPointerUp = () => {
      positionData.isDragging = false;
    };

    gElem?.addEventListener("pointerdown", onPointerDown);
    gElem?.addEventListener("pointermove", onPointerMove);
    gElem?.addEventListener("pointerup", onPointerUp);

    return () => {
      gElem?.removeEventListener("pointerdown", onPointerDown);
      gElem?.removeEventListener("pointermove", onPointerMove);
      gElem?.removeEventListener("pointerup", onPointerUp);
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
    return () => {
      if (tapInfoRef.current.timerForLongTap) {
        clearTimeout(tapInfoRef.current.timerForLongTap);
        tapInfoRef.current.timerForLongTap = null;
      }

      if (tapInfoRef.current.timerForDoubleTap) {
        clearTimeout(tapInfoRef.current.timerForDoubleTap);
        tapInfoRef.current.timerForDoubleTap = null;
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
      {(graphType === "directory" || contentType === 'TEXT') && (
        <NodeLabel
          label={label}
          markType={markType}
          nodeType={nodeType}
          isShared={isShared}
          size={nodeSize}
          setSize={setNodeSize}
        ></NodeLabel>
      )}

      {contentType === "IMAGE" && imageUrl && (
        <NodeImage
          nodeId={id}
          isTempImageUrl={isTempImageUrl}
          imageUrl={imageUrl}
          imageWidth={imageWidth}
          imageHeight={imageHeight}
          size={nodeSize}
          setSize={setNodeSize}
        ></NodeImage>
      )}

      {/* expand icon */}
      {/* {editMode && hasChildren && (
        <text
          className="select-none"
          x={0}
          y={nodeLabelSize.height / -2 - 8}
          fill="white"
          textAnchor="middle"
          dominantBaseline="middle"
          onPointerDown={(e) => e.stopPropagation()}
        >
          {expanded === false ? "+" : "-"}
        </text>
      )} */}
    </g>
  );
}

/**
 * 左右边距总和
 */
const PADDING_X = 16;
/**
 * 上下边距总和
 */
const PADDING_Y = 10;
const TEXT_HEIGHT = 20.5;

interface TextSegment {
  type: 'TEXT' | "link";
  content: string;
}

// Valid URL characters per RFC 3986 (conservative — excludes chars that are
// almost always sentence punctuation in CJK/mixed text contexts)
// const URL_CHAR = /[A-Za-z0-9\-._~:/?#[\]@!$&'*+;=%]/;
const urlRegex = /(https?:\/\/[A-Za-z0-9\-._~:/?#[\]@!$&'*+;=%]+)/g;

const stripTrailingPunctuation = (url: string): string => {
  // Iteratively strip trailing chars that look like sentence punctuation.
  // Parentheses: only strip unmatched closing parens
  let result = url;
  result = result.replace(/[.,;:]+$/, ""); // trailing ASCII sentence punctuation
  result = result.replace(/\)+$/, (parens) => {
    // strip unmatched closing parens
    const opens = (result.match(/\(/g) || []).length;
    const closes = (result.match(/\)/g) || []).length;
    const unmatched = closes - opens;
    return unmatched > 0 ? parens.slice(0, -unmatched) : parens;
  });
  return result;
};

const parseTextForLinks = (text: string): TextSegment[] => {
  const segments: TextSegment[] = [];
  let lastIndex = 0;
  let match;

  while ((match = urlRegex.exec(text)) !== null) {
    const rawUrl = match[0];
    const cleanUrl = stripTrailingPunctuation(rawUrl);

    if (match.index > lastIndex) {
      segments.push({
        type: 'TEXT',
        content: text.slice(lastIndex, match.index),
      });
    }

    segments.push({ type: "link", content: cleanUrl });
    lastIndex = match.index + cleanUrl.length;
  }

  if (lastIndex < text.length) {
    segments.push({ type: 'TEXT', content: text.slice(lastIndex) });
  }

  return segments;
};

interface NodeLabelProps {
  label: string;
  markType?: "GREEN" | "RED" | null;
  nodeType?: NodeType;
  isShared?: boolean;
  size: Size;
  setSize: React.Dispatch<React.SetStateAction<Size>>;
}
function NodeLabel({ label, markType, nodeType, isShared, size, setSize }: NodeLabelProps) {
  // lines
  const textList = label.split("\n");
  const textsRef = useRef<Map<number, SVGTextElement>>(new Map());

  const paperContext = use(PaperContext);
  const browseMode = paperContext?.browseMode;

  useLayoutEffect(() => {
    if (textsRef.current) {
      const widthList: number[] = [];

      for (const [, text] of textsRef.current) {
        const bbox = text.getBBox();
        // console.log("Text bounding box:", bbox);

        widthList.push(bbox.width);
      }

      setSize({
        width: Math.max(...widthList) + PADDING_X,
        height: textsRef.current.size * TEXT_HEIGHT + PADDING_Y,
      });
    }
  }, [label, setSize]);

  return (
    <>
      <rect
        x={size.width / -2}
        y={size.height / -2}
        width={size.width}
        height={size.height}
        fill={nodeType === 'DETAIL' ? "var(--color-node-detail)" : "var(--color-node)"}
        rx="6"
        ry="6"
      />

      {nodeType === 'DETAIL' && isShared && (
        <foreignObject
          x={size.width / 2 - 10}
          y={size.height / -2 - 10}
          width={20}
          height={20}
        >
          <div
            style={{
              width: 20,
              height: 20,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Share2 size={14} color="#3b82f6" />
          </div>
        </foreignObject>
      )}

      {textList.map((text, index) => {
        const segments = parseTextForLinks(text);
        return (
          // one line
          <text
            key={index}
            ref={(node) => {
              if (node) {
                textsRef.current.set(index, node);
              }

              return () => {
                textsRef.current.delete(index);
              };
            }}
            x={size.width / -2 + PADDING_X / 2}
            y={0}
            dy={
              index * TEXT_HEIGHT + ((textList.length - 1) * TEXT_HEIGHT) / -2
            }
            fill={
              markType === "GREEN"
                ? "var(--color-node-mark-green)"
                : markType === "RED"
                  ? "var(--color-node-mark-red)"
                  : "white"
            }
            dominantBaseline="central"
            style={{ fontFamily: "monospace" }}
            className={browseMode ? "select-none" : ""}
            // 给 <text> 元素添加 xml:space="preserve" 属性，可以保留原始空格和换行（类似于 HTML 中的 <pre> 标签）
            xmlSpace="preserve"
          >
            {segments.map((segment, segIndex) =>
              segment.type === "link" ? (
                <a
                  key={segIndex}
                  {...(!browseMode && { href: segment.content, target: "_blank" })}
                  rel="noopener noreferrer"
                  // @ts-expect-error tslint doesn't recognize <a> in SVG
                  dominantBaseline="central"
                  fill="#60a5fa"
                  style={{
                    textDecoration: "underline",
                    cursor: browseMode ? "default" : "pointer",
                    outline: "none",
                  }}
                >
                  {segment.content}
                </a>
              ) : (
                <tspan key={segIndex} dominantBaseline="central">
                  {segment.content}
                </tspan>
              ),
            )}
          </text>
        );
      })}
    </>
  );
}

interface NodeImageProps {
  nodeId: number | string;
  isTempImageUrl?: boolean;
  imageUrl: string;
  imageWidth?: number;
  imageHeight?: number;
  size: Size;
  setSize: React.Dispatch<React.SetStateAction<Size>>;
}

function NodeImage({
  nodeId,
  isTempImageUrl,
  imageUrl,
  imageWidth,
  imageHeight,
  size,
  setSize,
}: NodeImageProps) {
  const imageRef = useRef<SVGImageElement | null>(null);
  const resizeHandleRef = useRef<SVGRectElement | null>(null);
  const paperContext = use(PaperContext);
  const editMode = paperContext?.editMode;
  const flatTree = paperContext?.flatTree;
  const setFlatTree = paperContext?.setFlatTree;
  const viewportZoom = paperContext?.viewportZoom;

  const resizeRef = useRef({
    isResizing: false,
    startX: 0,
    startY: 0,
    startWidth: 0,
    startHeight: 0,
    currentWidth: 0,
    currentHeight: 0,
  });

  // 有了 imageWidth 和 imageHeight，就不需要等图片加载完成了，可以直接设置节点大小
  useLayoutEffect(() => {
    if (imageWidth && imageHeight) {
      setSize({
        width: imageWidth + PADDING_X,
        height: imageHeight + PADDING_X,
      });
    }
  }, [imageWidth, imageHeight, setSize]);

  // 图片加载完成后，根据实际图片大小设置节点大小（如果没有 imageWidth 和 imageHeight 的话）
  const onImageLoad = () => {
    if (imageUrl && imageRef.current && !imageWidth && !imageHeight) {
      const { width, height } = imageRef.current.getBBox();

      setSize({
        width: width + PADDING_X,
        height: height + PADDING_X,
      });
    }
  };

  const displayWidth = size.width - PADDING_X;
  const displayHeight = size.height - PADDING_X;

  const handleResizeStart = (e: React.PointerEvent<SVGRectElement>) => {
    // why doesn't work? (<g>'s onPointerDown will trigger first...)
    // because of the React's synthetic event system
    e.stopPropagation();
    if (!editMode) return;

    const resizeHandle = resizeHandleRef.current;

    resizeHandle?.setPointerCapture(e.pointerId);

    resizeRef.current.isResizing = true;
    resizeRef.current.startX = e.clientX;
    resizeRef.current.startY = e.clientY;
    resizeRef.current.startWidth = displayWidth;
    resizeRef.current.startHeight = displayHeight;
    resizeRef.current.currentWidth = displayWidth;
    resizeRef.current.currentHeight = displayHeight;

    const aspectRatio =
      resizeRef.current.startHeight > 0
        ? resizeRef.current.startWidth / resizeRef.current.startHeight
        : 1;

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

      const newWidth = Math.max(50, resizeRef.current.startWidth + delta);
      const newHeight = Math.max(
        50,
        resizeRef.current.startHeight + delta / aspectRatio,
      );

      // Update local size for immediate feedback
      setSize({
        width: newWidth + PADDING_X,
        height: newHeight + PADDING_X,
      });

      // store current size in ref for use in handleResizeEnd
      resizeRef.current.currentWidth = newWidth;
      resizeRef.current.currentHeight = newHeight;
    };

    const handleResizeEnd = () => {
      resizeRef.current.isResizing = false;
      resizeHandle?.removeEventListener("pointermove", handleResizeMove);
      resizeHandle?.removeEventListener("pointerup", handleResizeEnd);

      // Update flatTree with new dimensions
      if (setFlatTree && flatTree) {
        setFlatTree((prev) =>
          prev.map((node) =>
            node.id === nodeId
              ? {
                  ...node,
                  imageWidth: resizeRef.current.currentWidth,
                  imageHeight: resizeRef.current.currentHeight,
                  opStatus: node.opStatus === "new" ? "new" : "edited",
                }
              : node,
          ),
        );
      }
    };

    resizeHandle?.addEventListener("pointermove", handleResizeMove);
    resizeHandle?.addEventListener("pointerup", handleResizeEnd);
  };

  return (
    <>
      <rect
        x={size.width / -2}
        y={size.height / -2}
        width={size.width}
        height={size.height}
        fill={"var(--color-node)"}
        rx="6"
        ry="6"
      />
      <image
        ref={imageRef}
        href={getImageNodeUrl(imageUrl, isTempImageUrl)}
        x={-displayWidth / 2}
        y={-displayHeight / 2}
        {...(displayWidth > 0 && displayHeight > 0 && { width: displayWidth, height: displayHeight })}
        onLoad={onImageLoad}
      />
      {editMode && (
        <rect
          ref={resizeHandleRef}
          data-el-type={"resize-handle"}
          x={displayWidth / 2 - 6 * (viewportZoom || 1)}
          y={displayHeight / 2 - 6 * (viewportZoom || 1)}
          width={12 * (viewportZoom || 1)}
          height={12 * (viewportZoom || 1)}
          fill="var(--color-primary, #3b82f6)"
          stroke="white"
          strokeWidth={2 * (viewportZoom || 1)}
          rx={2 * (viewportZoom || 1)}
          className="cursor-se-resize"
          onPointerDown={handleResizeStart}
        />
      )}
    </>
  );
}

import { useLayoutEffect, useRef, useState } from "react";
import { CircleCheck, Link2, Share2 } from "lucide-react";

import imageNotFoundUrl from "../../assets/image_not_found.webp";
import type { NodeData, NodeType } from "../types";
import type { Size } from "../types/note";
import { getImageNodeUrl } from "../utils";

interface NoteNodeViewProps {
  node: NodeData;
  graphType: "directory" | "detail";
  browseMode?: boolean;
  selected?: boolean;
  size?: Size;
  onSizeChange?: React.Dispatch<React.SetStateAction<Size>>;
}

export default function NoteNodeView({
  node,
  graphType,
  browseMode = false,
  selected = false,
  size: controlledSize,
  onSizeChange,
}: NoteNodeViewProps) {
  const [internalSize, setInternalSize] = useState<Size>({
    width: 0,
    height: 0,
  });
  const size = controlledSize ?? internalSize;
  const setSize = onSizeChange ?? setInternalSize;

  return (
    <>
      {(graphType === "directory" || node.contentType !== "IMAGE") && (
        <NodeLabel
          label={node.label}
          markType={node.markType}
          nodeType={node.nodeType}
          shared={node.shared}
          article={node.article}
          isReference={node.contentType?.startsWith("REF_")}
          browseMode={browseMode}
          size={size}
          setSize={setSize}
        />
      )}

      {node.contentType === "IMAGE" && (
        <NodeImage
          isTempImageUrl={node.imageUrl ? node.isTempImageUrl : true}
          imageUrl={node.imageUrl || imageNotFoundUrl}
          imageWidth={node.imageWidth}
          imageHeight={node.imageHeight}
          size={size}
          setSize={setSize}
        />
      )}

      {selected && (
        <foreignObject
          x={size.width / -2 - 10}
          y={size.height / -2 - 10}
          width={20}
          height={20}
        >
          <div
            title="已选择"
            style={{
              width: 20,
              height: 20,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <CircleCheck size={16} color="#818cf8" />
          </div>
        </foreignObject>
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
    </>
  );
}

/**
 * 左右边距总和
 */
export const NODE_PADDING_X = 16;
/**
 * 上下边距总和
 */
const PADDING_Y = 10;
const TEXT_HEIGHT = 20.5;

interface TextSegment {
  type: "TEXT" | "link";
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
        type: "TEXT",
        content: text.slice(lastIndex, match.index),
      });
    }

    segments.push({ type: "link", content: cleanUrl });
    lastIndex = match.index + cleanUrl.length;
  }

  if (lastIndex < text.length) {
    segments.push({ type: "TEXT", content: text.slice(lastIndex) });
  }

  return segments;
};

interface NodeLabelProps {
  label: string;
  markType?: "GREEN" | "RED" | null;
  nodeType?: NodeType;
  shared?: boolean;
  article?: boolean;
  isReference?: boolean;
  browseMode: boolean;
  size: Size;
  setSize: React.Dispatch<React.SetStateAction<Size>>;
}

function NodeLabel({
  label,
  markType,
  nodeType,
  shared,
  article,
  isReference,
  browseMode,
  size,
  setSize,
}: NodeLabelProps) {
  // lines
  const textList = label.split("\n");
  const textsRef = useRef<Map<number, SVGTextElement>>(new Map());

  useLayoutEffect(() => {
    if (textsRef.current) {
      const widthList: number[] = [];

      for (const [, text] of textsRef.current) {
        const bbox = text.getBBox();
        // console.log("Text bounding box:", bbox);

        widthList.push(bbox.width);
      }

      setSize({
        width: Math.max(...widthList) + NODE_PADDING_X,
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
        fill={
          article
            ? "var(--color-node-article)"
            : nodeType === "DETAIL"
              ? "var(--color-node-detail)"
              : "var(--color-node)"
        }
        rx="6"
        ry="6"
      />

      {nodeType === "DETAIL" && shared && (
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

      {isReference && (
        <foreignObject
          x={size.width / 2 - 10}
          y={size.height / -2 - 10}
          width={20}
          height={20}
        >
          <div
            title="引用节点"
            style={{
              width: 20,
              height: 20,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Link2 size={14} color="#a78bfa" />
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
            x={size.width / -2 + NODE_PADDING_X / 2}
            y={0}
            dy={
              index * TEXT_HEIGHT +
              ((textList.length - 1) * TEXT_HEIGHT) / -2
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
                  {...(!browseMode && {
                    href: segment.content,
                    target: "_blank",
                  })}
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
  isTempImageUrl?: boolean;
  imageUrl: string;
  imageWidth?: number;
  imageHeight?: number;
  size: Size;
  setSize: React.Dispatch<React.SetStateAction<Size>>;
}

function NodeImage({
  isTempImageUrl,
  imageUrl,
  imageWidth,
  imageHeight,
  size,
  setSize,
}: NodeImageProps) {
  const imageRef = useRef<SVGImageElement | null>(null);

  // 有了 imageWidth 和 imageHeight，就不需要等图片加载完成了，可以直接设置节点大小
  useLayoutEffect(() => {
    if (imageWidth && imageHeight) {
      setSize({
        width: imageWidth + NODE_PADDING_X,
        height: imageHeight + NODE_PADDING_X,
      });
    }
  }, [imageWidth, imageHeight, setSize]);

  // 图片加载完成后，根据实际图片大小设置节点大小（如果没有 imageWidth 和 imageHeight 的话）
  const onImageLoad = () => {
    if (imageUrl && imageRef.current && !imageWidth && !imageHeight) {
      const { width, height } = imageRef.current.getBBox();

      setSize({
        width: width + NODE_PADDING_X,
        height: height + NODE_PADDING_X,
      });
    }
  };

  const displayWidth = size.width - NODE_PADDING_X;
  const displayHeight = size.height - NODE_PADDING_X;

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
        {...(displayWidth > 0 &&
          displayHeight > 0 && {
            width: displayWidth,
            height: displayHeight,
          })}
        onLoad={onImageLoad}
      />
    </>
  );
}

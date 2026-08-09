
export interface NodeData {
  id: number | string;
  parentId?: number | string | null;
  uuid?: string;
  parentUuid?: string | null;
  label: string;
  x: number;
  y: number;
  markType?: MarkType;
  nodeType?: NodeType;
  isShared?: boolean;

  children?: NodeData[];
  expanded?: boolean;
  opStatus?: OpStatus;
  contentType?: NodeContentType;
  isTempImageUrl?: boolean;
  imageUrl?: string;
  imageWidth?: number;
  imageHeight?: number;
}

export type NodeType = "DIRECTORY" | "DETAIL";
export type MarkType = "GREEN" | "RED" | null;
export type OpStatus = "new" | "edited" | "deleted";
export type NodeContentType = 'TEXT' | 'IMAGE'

export interface NoteDetailData {
  directoryNodeId: number;
}

export interface Point {
  x: number;
  y: number;
}


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
  shared?: boolean;

  children?: NodeData[];
  expanded?: boolean;
  opStatus?: OpStatus;
  contentType?: NodeContentType;
  article?: boolean;
  isTempImageUrl?: boolean;
  imageUrl?: string;
  imageWidth?: number;
  imageHeight?: number;
  refDirectoryNodeId?: number | null;
  refDetailNodeId?: number | null;
  tagIds?: number[];
  createdAt?: string;
  updatedAt?: string;
}

export type NodeType = "DIRECTORY" | "DETAIL";
export type MarkType = "GREEN" | "RED" | null;
export type OpStatus = "new" | "edited" | "deleted";
export type NodeContentType = 'TEXT' | 'IMAGE' | 'REF_NOTE' | 'REF_DETAIL' | 'REF_ARTICLE'

interface NodeMutationFields {
  label: string | null;
  x: number;
  y: number;
  markType?: MarkType;
  imageWidth?: number;
  imageHeight?: number;
}

/** 新增节点接口参数。uuid 是新增节点在一次批量更新中的唯一标识。 */
export interface AddedNodeDto extends NodeMutationFields {
  uuid: string;
  parentId?: number | null;
  parentUuid?: string | null;
  nodeType?: NodeType;
  contentType?: NodeContentType;
  article?: boolean;
  refDirectoryNodeId?: number | null;
  refDetailNodeId?: number | null;
  tagIds?: number[];
}

/** 更新已有节点接口参数。id 和 parentId 只允许使用数据库数字 ID。 */
export interface UpdatedNodeDto extends NodeMutationFields {
  id: number;
  parentId?: number | null;
  parentUuid?: string | null;
  tagIds?: number[];
}

export interface BatchUpdateNodesDto {
  added: AddedNodeDto[];
  updated: UpdatedNodeDto[];
  deletedNodeIds: number[];
}

export interface NoteDetailData {
  directoryNodeId: number;
}

export interface Point {
  x: number;
  y: number;
}

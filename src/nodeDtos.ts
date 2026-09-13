import type { AddedNodeDto, NodeData, UpdatedNodeDto } from './types'

const getMutationFields = (node: NodeData) => ({
    // 图片内容由 multipart 文件承载，后端要求图片节点的 label 为 null。
    label: node.contentType === 'IMAGE' ? null : node.label,
    x: node.x,
    y: node.y,
    markType: node.markType,
    imageWidth: node.imageWidth,
    imageHeight: node.imageHeight,
})

const getParentReference = (node: NodeData) => {
    if (typeof node.parentId === 'string') {
        return {
            // 新父节点只有临时 UUID，不能作为 parentId 发送。
            parentId: undefined,
            parentUuid: node.parentUuid ?? node.parentId,
        }
    }

    return {
        // 已有父节点使用数据库 ID；null 表示断开父节点。
        parentId: node.parentId,
        parentUuid: null,
    }
}

export const toAddedNodeDto = (node: NodeData): AddedNodeDto => {
    if (!node.uuid) {
        throw new Error(`New node ${String(node.id)} is missing uuid`)
    }

    return {
        ...getMutationFields(node),
        uuid: node.uuid,
        nodeType: node.nodeType,
        contentType: node.contentType,
        article: node.article,
        tagIds: node.nodeType === 'DETAIL' ? node.tagIds : undefined,
        ...getParentReference(node),
    }
}

export const toUpdatedNodeDto = (node: NodeData): UpdatedNodeDto => {
    if (typeof node.id !== 'number') {
        throw new Error(`Updated node id must be a number, received ${String(node.id)}`)
    }

    return {
        ...getMutationFields(node),
        id: node.id,
        tagIds: node.nodeType === 'DETAIL' ? node.tagIds : undefined,
        ...getParentReference(node),
    }
}

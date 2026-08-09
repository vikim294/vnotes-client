import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { ArrowLeft, Home, Search } from 'lucide-react'
import { debounce, findDescendantsByIdInFlatTree, getDistanceBetweenTwoPoints } from '../lib'
import { useNavigate } from 'react-router'
import Button from '../components/Button'
import NodeMenu, { type NodeMenuExpose } from '../components/NodeMenu'
import NoteTree from '../components/NoteTree'
import PaperContext from '../context/paperContext'
import useModal from '../components/useModal'
import { Toast } from '../components/Toast'
import SearchModal from '../components/SearchModal'
import {
    type MarkType,
    type NodeContentType,
    type NodeData,
    type NodeType,
    type NoteDetailData,
} from '../types'
import { API_BASE_URL, toggleNoteShare, moveNode, type Note } from '../api'
import FilePicker from './FilePicker'
import MoveSuccessModal from '../components/MoveSuccessModal'

interface GestureInfo {
    type: 'none' | 'panning' | 'pinchAndZoom'
    startX1: number
    startY1: number
    startX2: number
    startY2: number
    startD: number
    centerPointX: number
    centerPointY: number
    viewportStartX: number
    viewportStartY: number
    viewportStartZoom: number
}

interface NoteGraphProps {
    graphType: 'directory' | 'detail'
    noteTitle?: string
    noteDetail?: NoteDetailData | null
    flatTree: NodeData[]
    setFlatTree: React.Dispatch<React.SetStateAction<NodeData[]>>
    onExitEdit: () => void
    allowOperate?: boolean
}

const VIEWPORT_STORAGE_KEY = 'vnote-directory-viewport'

const loadViewportState = () => {
    try {
        const stored = localStorage.getItem(VIEWPORT_STORAGE_KEY)
        if (stored) {
            return JSON.parse(stored)
        }
    } catch {
        // Ignore parse errors
    }
    return null
}

const saveViewportState = (viewport: { x: number; y: number; zoom: number }) => {
    try {
        localStorage.setItem(VIEWPORT_STORAGE_KEY, JSON.stringify(viewport))
    } catch {
        // Ignore storage errors
    }
}

const NoteGraph = memo<NoteGraphProps>(
    ({
        graphType,
        noteTitle,
        noteDetail,
        flatTree,
        setFlatTree,
        onExitEdit,
        allowOperate = true,
    }) => {
        const navigate = useNavigate()
        const hasMountedRef = useRef(false)

        const [paperSize, setPaperSize] = useState({ width: 0, height: 0 })
        const [viewport, setViewport] = useState({
            x: 0,
            y: 0,
            width: 0,
            height: 0,
            zoom: 1,
        })
        const viewportRef = useRef(viewport)
        const paperRef = useRef<SVGSVGElement>(null)
        const gestureInfo = useRef<GestureInfo>({
            type: 'none',
            startX1: 0,
            startY1: 0,
            startX2: 0,
            startY2: 0,
            startD: 0,
            centerPointX: 0,
            centerPointY: 0,
            viewportStartX: 0,
            viewportStartY: 0,
            viewportStartZoom: 1,
        })

        // Debounced save for zoom operations (pinch/zoom and wheel)
        const debouncedSaveViewport = useMemo(
            () =>
                debounce<{ x: number; y: number; zoom: number }>(({ x, y, zoom }) => {
                    if (graphType === 'directory') {
                        saveViewportState({ x, y, zoom })
                    }
                }, 300),
            [graphType]
        )

        // const [isAllExpanded, setIsAllExpand] = useState(true);

        // browse mode
        const [browseMode, setBrowseMode] = useState(true)

        // edit mode
        const [editMode, setEditMode] = useState(false)
        const [isSaving, setIsSaving] = useState(false)
        const [nodeMenuVisible, setNodeMenuVisible] = useState(false)
        const nodeMenuRef = useRef<NodeMenuExpose | null>(null)
        const [selectedNodeId, setSelectedNodeId] = useState<number | string | null>(null)
        const selectedNode = useMemo(() => {
            return flatTree.find((node) => node.id === selectedNodeId) ?? null
        }, [flatTree, selectedNodeId])
        // detail node is only for directory graph
        const [nodeType, setNodeType] = useState<NodeType>('DIRECTORY')

        // add new node
        const {
            Modal: NewNodeAddModal,
            openModal: openNewNodeAddModal,
            closeModal: closeNewNodeAddModal,
        } = useModal({
            onModalVisible: useCallback(() => newNodeAddModalInputRef.current?.focus(), []),
        })
        const newNodeAddModalInputRef = useRef<HTMLTextAreaElement>(null)
        // for choosing new node content type: text or image
        const [nodeContentType, setNodeContentType] = useState<NodeContentType>('TEXT')
        // for previewing the selected image file before uploading
        const [tempFileUrl, setTempFileUrl] = useState<string | null>(null)
        // for uploading
        const tempFileRef = useRef<File | null>(null)
        // for uploading(add)
        const uuidToFileMapRef = useRef<Record<string, File>>({})
        // for uploading(edit)
        const idToFileMapRef = useRef<Record<number | string, File>>({})

        // edit node
        const {
            Modal: NodeEditModal,
            openModal: openNodeEditModal,
            closeModal: closeNodeEditModal,
        } = useModal({
            onModalVisible: useCallback(() => {
                nodeEditModalInputRef.current?.focus()
                // ⚠️ textarea 会把光标移动到文本前面，这里把光标移动到文本后面
                const len = nodeEditModalInputRef.current?.value.length ?? 0
                nodeEditModalInputRef.current?.setSelectionRange(len, len)
            }, []),
        })
        const [nodeEditContent, setNodeEditContent] = useState('')
        const nodeEditModalInputRef = useRef<HTMLTextAreaElement>(null)

        // add node
        const {
            Modal: NodeAddModal,
            openModal: openNodeAddModal,
            closeModal: closeNodeAddModal,
        } = useModal({
            onModalVisible: useCallback(() => nodeAddModalInputRef.current?.focus(), []),
        })
        const nodeAddModalInputRef = useRef<HTMLTextAreaElement>(null)

        // set parent node
        const [isChoosingParent, setIsChoosingParent] = useState(false)
        const [chosenParentNodeId, setChosenParentNodeId] = useState<number | string | null>(null)

        // delete node
        const {
            Modal: NodeDeleteConfirmModal,
            openModal: openNodeDeleteConfirmModal,
            closeModal: closeNodeDeleteConfirmModal,
        } = useModal()

        // mark color
        const {
            Modal: NodeMarkModal,
            openModal: openNodeMarkModal,
            closeModal: closeNodeMarkModal,
        } = useModal()
        const [markValue, setMarkValue] = useState<MarkType>(null)

        // exit confirmation modal
        const {
            Modal: ExitConfirmModal,
            openModal: openExitConfirmModal,
            closeModal: closeExitConfirmModal,
        } = useModal()

        // search modal
        const [isSearchModalOpen, setIsSearchModalOpen] = useState(false)

        // move node flow
        const [isMoveSearchOpen, setIsMoveSearchOpen] = useState(false)
        const [moveSourceNodeId, setMoveSourceNodeId] = useState<number | null>(null)
        const [moveSuccessTarget, setMoveSuccessTarget] = useState<{
            id: number
            label: string
        } | null>(null)

        // context
        const paperContext = useMemo(
            () => ({
                graphType,
                browseMode,
                flatTree,
                editMode,
                viewportZoom: viewport.zoom,
                selectedNodeId,
                setSelectedNodeId,
                nodeMenuRef,
                isChoosingParent,
                setFlatTree,
                setNodeMenuVisible,
                setChosenParentNodeId,
            }),
            [
                graphType,
                browseMode,
                flatTree,
                setFlatTree,
                editMode,
                viewport.zoom,
                selectedNodeId,
                isChoosingParent,
            ]
        )

        const handleAddNewNode = () => {
            setNodeEditContent('')
            setNodeType('DIRECTORY')
            setNodeContentType('TEXT')
            setTempFileUrl(null)
            openNewNodeAddModal()
        }

        const handleSaveEdit = async () => {
            setIsSaving(true)
            try {
                // console.log("save edit:", flatTree);

                // added 新增的结点
                // 必有 uuid，无 id，无视 id
                // 如果是新增的子结点，则
                //                     有 parentUuid（如果是新增结点的子结点）
                //                     有 pid（如果是旧结点的新增子结点）
                // updated 旧结点
                //     必有 id，无视 uuid
                //     如果旧结点只更新了除 parentId 之外的数据，pid 没变
                //     如果旧结点更新了 parentId 为 某个旧结点的 id
                //     如果旧结点更新了 parentId 为 某个新结点的 uuid

                // 保存本次编辑结果到后端 API
                const added: NodeData[] = []
                const updated: NodeData[] = []
                const deletedNodeIds: (number | string)[] = []

                const ft = flatTree.map(node => ({
                    ...node,
                    x: Number(node.x.toFixed(2)),
                    y: Number(node.y.toFixed(2)),
                }))

                for (const node of ft) {
                    if (node.opStatus === 'new') {
                        if (node.parentUuid !== null) {
                            // 是新增结点的新增子结点，要把 parentId 置为 null
                            added.push({
                                ...node,
                                parentId: null,
                            })
                        } else if (node.contentType === 'IMAGE') {
                            added.push({
                                ...node,
                                // 无需传
                                isTempImageUrl: undefined,
                                imageUrl: undefined,
                            })
                        } else {
                            added.push(node)
                        }
                    } else if (node.opStatus === 'edited') {
                        if (node.contentType === 'IMAGE') {
                            updated.push({
                                ...node,
                                // 无需传
                                isTempImageUrl: undefined,
                                imageUrl: undefined,
                            })
                        } else {
                            updated.push(node)
                        }
                    } else if (node.opStatus === 'deleted') {
                        deletedNodeIds.push(node.id)
                    }
                }

                const params: {
                    added: NodeData[]
                    updated: NodeData[]
                    deletedNodeIds: (number | string)[]
                    noteDetailId?: number
                } = {
                    added,
                    updated,
                    deletedNodeIds,
                }

                // if (graphType === 'detail') {
                //     params.noteDetailId = noteDetail?.id
                // }

                const url =
                    graphType === 'directory'
                        ? `${API_BASE_URL}/note/directory/batch`
                        : `${API_BASE_URL}/note/directory/${noteDetail!.directoryNodeId}/detail-nodes/batch`

                // console.log(added, updated, deletedNodeIds);

                // const fd = new FormData()
                // fd.append('params', JSON.stringify(params))
                // for (const [uuid, file] of Object.entries(uuidToFileMapRef.current)) {
                //     fd.append(uuid, file)
                // }
                // for (const [id, file] of Object.entries(idToFileMapRef.current)) {
                //     fd.append(id, file)
                // }

                const token = localStorage.getItem('vnotes-token')
                const response = await fetch(url, {
                    method: 'PATCH',
                    headers: token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : {},
                    body: JSON.stringify(params),
                })
                if (response.status === 401) {
                    localStorage.removeItem('vnotes-token')
                    window.location.href = '/'
                    return
                }
                const res = await response.json()
                if (res.code === 0) {
                    // reset
                    uuidToFileMapRef.current = {}
                    idToFileMapRef.current = {}

                    // 根据返回结果，更新 flatTree
                    const newFlatTree = []

                    // added -> update id, parentId
                    // updated -> update parentId
                    // deleted -> remove from flatTree

                    for (const item of flatTree) {
                        if (deletedNodeIds.includes(item.id)) {
                            continue
                        } else {
                            // reset opStatus
                            const newItem: NodeData = { ...item, opStatus: undefined }

                            if (res.data.uuidToId[item.id]) {
                                newItem.id = res.data.uuidToId[item.id]
                                newItem.uuid = undefined
                            }

                            if (item.parentId && res.data.uuidToId[item.parentId]) {
                                newItem.parentId = res.data.uuidToId[item.parentId]
                                newItem.parentUuid = undefined
                            }

                            newFlatTree.push(newItem)
                        }
                    }

                    setFlatTree(newFlatTree)
                    setEditMode(false)
                }
            } finally {
                setIsSaving(false)
            }
        }

        const handleExitEdit = () => {
            // Check if there are any unsaved modifications
            const hasModifications = flatTree.some(
                (node) =>
                    node.opStatus === 'new' ||
                    node.opStatus === 'edited' ||
                    node.opStatus === 'deleted'
            )

            if (hasModifications) {
                openExitConfirmModal()
            } else {
                setEditMode(false)
                // No modifications, no need to refetch data
            }
        }

        const handleConfirmExit = () => {
            closeExitConfirmModal()
            setEditMode(false)
            onExitEdit()
        }

        const resetView = () => {
            // Clear cached viewport for directory
            if (graphType === 'directory') {
                localStorage.removeItem(VIEWPORT_STORAGE_KEY)
            }

            const firstRootNode = flatTree.find((node) => node.parentId === null) as NodeData | undefined

            if (firstRootNode) {
                setViewport((prev) => ({
                    ...prev,
                    width: paperSize.width,
                    height: paperSize.height,
                    zoom: 1,
                    x: firstRootNode.x - paperSize.width / 2,
                    y: firstRootNode.y - paperSize.height / 2,
                }))
            } else {
                setViewport((prev) => ({
                    ...prev,
                    width: paperSize.width,
                    height: paperSize.height,
                    zoom: 1,
                }))
            }
        }

        const handleNodeEdit = () => {
            // show the current value
            setNodeEditContent(flatTree.find((node) => node.id === selectedNodeId)?.label ?? '')
            setTempFileUrl(null)
            if (selectedNode?.contentType === 'IMAGE') {
                setNodeContentType('IMAGE')
            }
            openNodeEditModal()
        }

        const handleNodeAddChild = () => {
            setNodeEditContent('')
            setNodeType('DIRECTORY')
            setNodeContentType('TEXT')
            setTempFileUrl(null)
            openNodeAddModal()
        }

        const handleNodeSetParent = () => {
            setNodeMenuVisible(false)
            setIsChoosingParent(true)
        }

        const handleNodeDisconnectFromParent = () => {
            if (!selectedNodeId) return

            setFlatTree((prev) => {
                return prev.map((node) => {
                    if (node.id === selectedNodeId) {
                        return {
                            ...node,
                            parentId: null,
                            parentUuid: null,
                            opStatus: node.opStatus === 'new' ? 'new' : 'edited',
                        }
                    }
                    return node
                })
            })
        }

        const handleNodeOpenMark = () => {
            if (selectedNodeId === null) return

            setMarkValue(selectedNode?.markType ?? null)
            setNodeMenuVisible(false)
            openNodeMarkModal()
        }

        const handleNodeMarkConfirm = () => {
            if (selectedNodeId === null) return

            setFlatTree((prev) => {
                return prev.map((node) => {
                    if (node.id === selectedNodeId) {
                        return {
                            ...node,
                            markType: markValue,
                            opStatus: node.opStatus === 'new' ? 'new' : 'edited',
                        }
                    }
                    return node
                })
            })

            closeNodeMarkModal()
        }

        const handleNodeToggleShare = async () => {
            const nodeId = selectedNode?.id
            if (!nodeId || typeof nodeId !== 'number') return

            const result = await toggleNoteShare(nodeId)
            if (result) {
                setFlatTree((prev) => {
                    return prev.map((node) => {
                        if (node.id === selectedNodeId) {
                            return {
                                ...node,
                                isShared: result.isShared,
                            }
                        }
                        return node
                    })
                })
            }
            handleNodeMenuClose()
        }

        const handleNodeDelete = () => {
            openNodeDeleteConfirmModal()
        }

        const handleNodeMenuClose = () => {
            setNodeMenuVisible(false)
        }

        const handleNodeMoveTo = () => {
            if (selectedNodeId === null) return
            setNodeMenuVisible(false)
            setMoveSourceNodeId(selectedNodeId as number)
            setIsMoveSearchOpen(true)
        }

        const handleMoveSelectNote = async (note: Note) => {
            setIsMoveSearchOpen(false)
            if (moveSourceNodeId === null) return

            const result = await moveNode(moveSourceNodeId, note.id)
            if (result) {
                // Find all descendants to remove from flatTree
                const descendants = findDescendantsByIdInFlatTree(flatTree, moveSourceNodeId)
                const allIdsToRemove = new Set([moveSourceNodeId, ...descendants.map((d) => d.id)])

                setFlatTree((prev) => prev.filter((node) => !allIdsToRemove.has(node.id)))
                setEditMode(false)
                setMoveSuccessTarget({ id: note.id, label: note.label })
            }
            setMoveSourceNodeId(null)
        }

        const handleNewNodeAddConfirm = () => {
            const id = uuidv4()
            const newNode: NodeData = {
                id,
                uuid: id,
                label: nodeEditContent,
                x: viewport.x + viewport.width / 2,
                y: viewport.y + viewport.height / 2,
                parentId: null,
                parentUuid: null,
                opStatus: 'new',
                markType: graphType === 'detail' ? null : undefined,
                // directory graph only
                nodeType,
                contentType: nodeContentType,
                isTempImageUrl: nodeContentType === 'IMAGE' ? true : undefined,
                imageUrl: nodeContentType === 'IMAGE' ? (tempFileUrl ?? undefined) : undefined,
            }

            if (nodeContentType === 'IMAGE' && tempFileRef.current) {
                uuidToFileMapRef.current[newNode.id] = tempFileRef.current
                tempFileRef.current = null
            }

            setFlatTree((prev) => [...prev, newNode])

            closeNewNodeAddModal()
        }

        const handleNodeEditConfirm = () => {
            if (!selectedNodeId) return
            if (selectedNode?.contentType === 'IMAGE' && !tempFileUrl) {
                Toast.error('请上传图片后再确认')
                return
            }

            setFlatTree((prev) => {
                const res = prev.map((node) => {
                    if (node.id === selectedNodeId) {
                        const newNode: NodeData = {
                            ...node,
                            label: nodeEditContent,
                            opStatus: node.opStatus === 'new' ? 'new' : 'edited',
                            isTempImageUrl: nodeContentType === 'IMAGE' ? true : undefined,
                            imageUrl:
                                nodeContentType === 'IMAGE'
                                    ? (tempFileUrl ?? undefined)
                                    : undefined,
                        }
                        if (nodeContentType === 'IMAGE' && tempFileRef.current) {
                            idToFileMapRef.current[newNode.id] = tempFileRef.current
                            tempFileRef.current = null
                        }
                        return newNode
                    } else return node
                })

                return res
            })

            closeNodeEditModal()
            handleNodeMenuClose()
        }

        const handleNodeAddConfirm = () => {
            if (!selectedNodeId) return

            const pNode = flatTree.find((item) => item.id === selectedNodeId) as NodeData

            const id = uuidv4()

            let newNode: NodeData | null = null

            if (pNode.opStatus === 'new') {
                // 新结点的新增子结点
                newNode = {
                    id,
                    uuid: id,
                    parentId: pNode.id,
                    parentUuid: pNode.uuid,
                    label: nodeEditContent,
                    x: pNode.x + 100,
                    y: pNode.y + 100,
                    opStatus: 'new',
                    markType: graphType === 'detail' ? null : undefined,
                    // directory graph only
                    nodeType,
                    contentType: nodeContentType,
                    isTempImageUrl: nodeContentType === 'IMAGE' ? true : undefined,
                    imageUrl: nodeContentType === 'IMAGE' ? (tempFileUrl ?? undefined) : undefined,
                }
            } else {
                // 旧结点的新增子结点
                newNode = {
                    id,
                    uuid: id,
                    parentId: pNode.id,
                    parentUuid: null,
                    label: nodeEditContent,
                    x: pNode.x + 100,
                    y: pNode.y + 100,
                    opStatus: 'new',
                    markType: graphType === 'detail' ? null : undefined,
                    // directory graph only
                    nodeType,
                    contentType: nodeContentType,
                    isTempImageUrl: nodeContentType === 'IMAGE' ? true : undefined,
                    imageUrl: nodeContentType === 'IMAGE' ? (tempFileUrl ?? undefined) : undefined,
                }
            }

            if (nodeContentType === 'IMAGE' && tempFileRef.current) {
                uuidToFileMapRef.current[newNode.id] = tempFileRef.current
                tempFileRef.current = null
            }

            setFlatTree((prev) => [...prev, newNode])

            closeNodeAddModal()
            handleNodeMenuClose()
        }

        const handleNodeDeleteConfirm = () => {
            if (!selectedNodeId) return

            const nodeIdsToBeDeleted = [
                selectedNodeId,
                ...findDescendantsByIdInFlatTree(flatTree, selectedNodeId).map((item) => item.id),
            ]

            const newFlatTree: NodeData[] = []

            for (const node of flatTree) {
                // 待删结点
                if (nodeIdsToBeDeleted.includes(node.id)) {
                    // 临时结点不保留
                    if (node.opStatus === 'new') {
                        continue
                    }
                    // 旧结点改 deleted
                    else {
                        newFlatTree.push({
                            ...node,
                            opStatus: 'deleted',
                        })
                    }
                } else {
                    // 非待删结点
                    newFlatTree.push(node)
                }
            }

            setFlatTree(newFlatTree)

            closeNodeDeleteConfirmModal()
            handleNodeMenuClose()
        }

        const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
            const file = e.target.files?.[0]
            if (!file) return

            // console.log("selected file:", file);
            const fr = new FileReader()
            fr.readAsDataURL(file)
            fr.onload = () => {
                const result = fr.result as string
                setTempFileUrl(result)
                tempFileRef.current = file
            }
        }

        useLayoutEffect(() => {
            viewportRef.current = viewport
        }, [viewport])

        useLayoutEffect(() => {
            const updatePaperSize = () => {
                setPaperSize({ width: window.innerWidth, height: window.innerHeight })
            }

            const updateViewport = () => {
                setViewport((prev) => ({
                    ...prev,
                    width: window.innerWidth,
                    height: window.innerHeight,
                }))
            }

            window.addEventListener('resize', updatePaperSize)
            updatePaperSize()
            updateViewport()

            return () => {
                window.removeEventListener('resize', updatePaperSize)
            }
        }, [])

        // panning and pinch & zoom
        useEffect(() => {
            const paperEl = paperRef.current
            const gestureData = gestureInfo.current

            const onPointerDown = (e: PointerEvent) => {
                if (editMode && e.target !== paperEl) return
                if (!browseMode && e.target !== paperEl) return

                // return if it's not left click
                if (e.pointerType === 'mouse' && e.button !== 0) return

                if (browseMode) {
                    paperEl?.setPointerCapture(e.pointerId)
                }

                if (e.isPrimary) {
                    gestureData.type = 'panning'
                    gestureData.startX1 = e.clientX
                    gestureData.startY1 = e.clientY
                } else {
                    gestureData.type = 'pinchAndZoom'
                    gestureData.startX2 = e.clientX
                    gestureData.startY2 = e.clientY

                    const v = viewportRef.current
                    const p1 = { x: gestureData.startX1, y: gestureData.startY1 }
                    const p2 = { x: gestureData.startX2, y: gestureData.startY2 }

                    gestureData.startD = getDistanceBetweenTwoPoints(p1, p2)
                    gestureData.centerPointX = (p1.x + p2.x) / 2
                    gestureData.centerPointY = (p1.y + p2.y) / 2
                    gestureData.viewportStartX = v.x
                    gestureData.viewportStartY = v.y
                    gestureData.viewportStartZoom = v.zoom
                }
            }

            const onPointerMove = (e: PointerEvent) => {
                if (gestureData.type === 'panning') {
                    const deltaX = e.clientX - gestureData.startX1
                    const deltaY = e.clientY - gestureData.startY1

                    gestureData.startX1 = e.clientX
                    gestureData.startY1 = e.clientY

                    setViewport((prev) => ({
                        ...prev,
                        x: prev.x + -deltaX * prev.zoom,
                        y: prev.y + -deltaY * prev.zoom,
                    }))
                } else if (gestureData.type === 'pinchAndZoom') {
                    let newD = 0
                    let p1 = { x: e.clientX, y: e.clientY }
                    let p2 = { x: e.clientX, y: e.clientY }

                    if (e.isPrimary) {
                        p2 = { x: gestureData.startX2, y: gestureData.startY2 }
                        // 更新 gestureData
                        gestureData.startX1 = e.clientX
                        gestureData.startY1 = e.clientY
                    } else {
                        p1 = { x: gestureData.startX1, y: gestureData.startY1 }
                        // 更新 gestureData
                        gestureData.startX2 = e.clientX
                        gestureData.startY2 = e.clientY
                    }

                    newD = getDistanceBetweenTwoPoints(p1, p2)

                    let newZoom = gestureData.viewportStartZoom

                    // startD: newD = startZoom: newZoom
                    const ratio = newD / gestureData.startD
                    if (ratio !== 1) {
                        // zoom in or zoom out
                        newZoom = (1 / ratio) * gestureData.viewportStartZoom
                    }

                    if (newZoom === 0) return

                    // the position ratio of pointer in the paper
                    const ratioX = gestureData.centerPointX / paperSize.width
                    const ratioY = gestureData.centerPointY / paperSize.height
                    const deltaX =
                        paperSize.width * -(newZoom - gestureData.viewportStartZoom) * ratioX
                    const deltaY =
                        paperSize.height * -(newZoom - gestureData.viewportStartZoom) * ratioY

                    setViewport({
                        x: gestureData.viewportStartX + deltaX,
                        y: gestureData.viewportStartY + deltaY,
                        width: paperSize.width * newZoom,
                        height: paperSize.height * newZoom,
                        zoom: newZoom,
                    })
                }
            }

            const onPointerUp = () => {
                if (
                    (gestureData.type === 'panning' || gestureData.type === 'pinchAndZoom') &&
                    graphType === 'directory'
                ) {
                    const v = viewportRef.current
                    saveViewportState({ x: v.x, y: v.y, zoom: v.zoom })
                }

                gestureData.type = 'none'
            }

            const touchHandler = (e: TouchEvent) => {
                // Allow link clicks - don't prevent default if touching a link
                const target = e.target as HTMLElement
                if (target.tagName === 'a' || target.closest('a')) {
                    return
                }
                e.preventDefault()
            }

            // https://javascript.info/default-browser-action#the-passive-handler-option
            // The optional passive: true option of addEventListener signals the browser that the handler is not going to call preventDefault().
            // For some browsers (Firefox, Chrome), passive is true by default for touchstart and touchmove events.
            // passive: false 使得 e.preventDefault() 能够生效
            paperEl?.addEventListener('touchstart', touchHandler, {
                passive: false,
            })
            paperEl?.addEventListener('touchmove', touchHandler, {
                passive: false,
            })

            paperEl?.addEventListener('pointerdown', onPointerDown)
            paperEl?.addEventListener('pointermove', onPointerMove)
            paperEl?.addEventListener('pointerup', onPointerUp)

            return () => {
                paperEl?.removeEventListener('touchstart', touchHandler)
                paperEl?.removeEventListener('touchmove', touchHandler)

                paperEl?.removeEventListener('pointerdown', onPointerDown)
                paperEl?.removeEventListener('pointermove', onPointerMove)
                paperEl?.removeEventListener('pointerup', onPointerUp)
            }
        }, [graphType, paperSize, editMode, browseMode, debouncedSaveViewport])

        // zooming
        useEffect(() => {
            const paperEl = paperRef.current

            const onWheel = (e: WheelEvent) => {
                // console.log(e);

                setViewport((prev) => {
                    const zoom = prev.zoom
                    let newZoom = prev.zoom

                    if (e.deltaY < 0) {
                        // up -> zoom in
                        newZoom /= 1.1
                    } else if (e.deltaY > 0) {
                        // down -> zoom out
                        newZoom *= 1.1
                    }

                    // console.log(newZoom)

                    // the position ratio of pointer in the paper
                    const ratioX = e.clientX / paperSize.width
                    const ratioY = e.clientY / paperSize.height
                    const deltaX = paperSize.width * -(newZoom - zoom) * ratioX
                    const deltaY = paperSize.height * -(newZoom - zoom) * ratioY

                    const newX = prev.x + deltaX
                    const newY = prev.y + deltaY

                    if (graphType === 'directory') {
                        debouncedSaveViewport({
                            x: newX,
                            y: newY,
                            zoom: newZoom,
                        })
                    }

                    return {
                        x: newX,
                        y: newY,
                        width: paperSize.width * newZoom,
                        height: paperSize.height * newZoom,
                        zoom: newZoom,
                    }
                })
            }

            paperEl?.addEventListener('wheel', onWheel)

            return () => {
                paperEl?.removeEventListener('wheel', onWheel)
            }
        }, [graphType, paperSize, debouncedSaveViewport])

        // init viewport
        useEffect(() => {
            if (hasMountedRef.current) return

            if (flatTree.length > 0 && viewport.width > 0 && viewport.height > 0) {
                hasMountedRef.current = true

                const firstRootNode = flatTree.find((node) => node.parentId === null) as NodeData

                if (graphType === 'directory') {
                    const cached = loadViewportState()
                    if (
                        cached &&
                        cached.x !== undefined &&
                        cached.y !== undefined &&
                        cached.zoom !== undefined
                    ) {
                        setViewport((prev) => ({
                            ...prev,
                            x: cached.x,
                            y: cached.y,
                            zoom: cached.zoom,
                            width: paperSize.width * cached.zoom,
                            height: paperSize.height * cached.zoom,
                        }))
                        return
                    }
                }

                setViewport((prev) => ({
                    ...prev,
                    x: firstRootNode.x - viewport.width / 2,
                    y: firstRootNode.y - viewport.height / 2,
                }))
            }
        }, [graphType, paperSize, flatTree, viewport.width, viewport.height])

        return (
            <PaperContext value={paperContext}>
                <div className="h-full bg-black">
                    <svg
                        ref={paperRef}
                        data-testid="note-graph"
                        width={paperSize.width}
                        height={paperSize.height}
                        // ⭐ viewBox 会先应用 x 和 y，然后才应用 width 和 height
                        // viewBox 的效果：以 (x, y) 为左上角，显示 width × height 区域，并投影到 svg 画布上
                        viewBox={`${viewport.x} ${viewport.y} ${viewport.width} ${viewport.height}`}
                        onContextMenu={(e) => e.preventDefault()}
                    >
                        <NoteTree flatTree={flatTree} />
                    </svg>
                    {noteTitle && (
                        <div className="fixed top-0 left-0 flex items-center gap-2 select-none">
                            <button
                                onClick={() => navigate(-1)}
                                className="cursor-pointer p-1 text-[#ffffff5c] transition-colors hover:text-white"
                                title="Go back"
                            >
                                <ArrowLeft className="h-5 w-5" />
                            </button>
                            <button
                                onClick={() => navigate('/')}
                                className="cursor-pointer p-1 text-[#ffffff5c] transition-colors hover:text-white"
                                title="Go to directory"
                            >
                                <Home className="h-5 w-5" />
                            </button>
                            <span className="text-[#ffffff5c]">{noteTitle}</span>
                        </div>
                    )}

                    <div className="fixed top-0 right-0 text-[#ffffff5c] select-none">
                        <button
                            onClick={resetView}
                            className="hover:text-primary cursor-pointer transition-colors"
                        >
                            {/* {viewport.zoom.toFixed(2)}  */}
                            reset view
                        </button>
                    </div>

                    {!isChoosingParent && chosenParentNodeId === null && (
                        <div className="fixed top-25 right-0 w-36">
                            {!isSaving && (
                                <div>
                                    <Button
                                        className="block w-full"
                                        onClick={() => {
                                            const newValue = !browseMode
                                            setBrowseMode(newValue)
                                        }}
                                    >
                                        {browseMode ? 'select mode' : 'browse mode'}
                                    </Button>
                                </div>
                            )}

                            {allowOperate && (
                                <>
                                    {/* search button */}
                                    <div>
                                        <Button
                                            className="flex w-full items-center justify-center"
                                            onClick={() => setIsSearchModalOpen(true)}
                                        >
                                            <Search className="h-4 w-4" />
                                        </Button>
                                    </div>
                                    {/* edit mode */}
                                    {!editMode && (
                                        <Button
                                            className="block w-full"
                                            type="primary"
                                            onClick={() => setEditMode(true)}
                                        >
                                            edit mode
                                        </Button>
                                    )}

                                    {editMode && (
                                        <>
                                            {!isSaving && (
                                                <div>
                                                    <Button
                                                        className="block w-full"
                                                        type="secondary"
                                                        onClick={handleAddNewNode}
                                                    >
                                                        add new node
                                                    </Button>
                                                </div>
                                            )}
                                            <div>
                                                <Button
                                                    className="block w-full"
                                                    type="primary"
                                                    onClick={handleSaveEdit}
                                                    disabled={isSaving}
                                                >
                                                    {isSaving ? 'saving...' : 'save'}
                                                </Button>
                                            </div>
                                            {!isSaving && (
                                                <div>
                                                    <Button
                                                        className="block w-full"
                                                        onClick={handleExitEdit}
                                                    >
                                                        exit
                                                    </Button>
                                                </div>
                                            )}
                                        </>
                                    )}
                                </>
                            )}
                        </div>
                    )}

                    {/* node menu */}
                    <NodeMenu
                        ref={nodeMenuRef}
                        visible={nodeMenuVisible}
                        onEdit={handleNodeEdit}
                        onAddChild={handleNodeAddChild}
                        onSetParent={handleNodeSetParent}
                        onDisconnectFromParent={handleNodeDisconnectFromParent}
                        onOpenMark={handleNodeOpenMark}
                        onToggleShare={handleNodeToggleShare}
                        onMoveTo={handleNodeMoveTo}
                        onDelete={handleNodeDelete}
                        onClose={handleNodeMenuClose}
                    />

                    {/* choosing a parent node */}
                    {isChoosingParent && chosenParentNodeId === null && (
                        <div className="fixed top-10 left-1/2 -translate-x-1/2 text-white">
                            please choose a parent node
                        </div>
                    )}
                    {chosenParentNodeId !== null && (
                        <div className="fixed top-10 left-1/2 flex -translate-x-1/2 gap-2">
                            <Button
                                onClick={() => {
                                    setIsChoosingParent(false)
                                    setChosenParentNodeId(null)
                                    setNodeMenuVisible(true)
                                }}
                            >
                                cancel
                            </Button>
                            <Button
                                onClick={() => {
                                    // set parent node
                                    setFlatTree((prev) =>
                                        prev.map((item) => {
                                            if (item.id === selectedNodeId) {
                                                const pNode = prev.find(
                                                    (item) => item.id === chosenParentNodeId
                                                ) as NodeData

                                                if (pNode.opStatus === 'new') {
                                                    // 旧结点把 新增结点设为了父结点
                                                    return {
                                                        ...item,
                                                        parentId: chosenParentNodeId,
                                                        parentUuid: pNode.uuid,
                                                        opStatus:
                                                            item.opStatus === 'new'
                                                                ? 'new'
                                                                : 'edited',
                                                    }
                                                } else {
                                                    // 旧结点把 另一个旧结点设为了父结点
                                                    return {
                                                        ...item,
                                                        parentId: chosenParentNodeId,
                                                        parentUuid: null,
                                                        opStatus:
                                                            item.opStatus === 'new'
                                                                ? 'new'
                                                                : 'edited',
                                                    }
                                                }
                                            }
                                            return item
                                        })
                                    )
                                    setIsChoosingParent(false)
                                    setChosenParentNodeId(null)
                                    handleNodeMenuClose()
                                }}
                            >
                                confirm
                            </Button>
                        </div>
                    )}

                    {/* modals */}
                    <>
                        <NodeMarkModal
                            width={420}
                            header="Mark node"
                            closeOnClickMask
                            footer={
                                <div className="flex items-center gap-3">
                                    <Button onClick={closeNodeMarkModal}>cancel</Button>
                                    <Button type="primary" onClick={handleNodeMarkConfirm}>
                                        confirm
                                    </Button>
                                </div>
                            }
                        >
                            <fieldset>
                                <legend className="mb-4 text-sm text-slate-400">
                                    Choose a color for this node
                                </legend>
                                <div className="grid gap-3">
                                    {(
                                        [
                                            {
                                                value: 'GREEN',
                                                label: 'Green',
                                                description: 'Highlight with the current green color',
                                                color: 'var(--color-node-mark-green)',
                                            },
                                            {
                                                value: 'RED',
                                                label: 'Red',
                                                description: 'Highlight with a vivid red color',
                                                color: 'var(--color-node-mark-red)',
                                            },
                                            {
                                                value: null,
                                                label: 'Unmark',
                                                description: 'Restore the default text color',
                                                color: '#f8fafc',
                                            },
                                        ] as const
                                    ).map((option) => (
                                        <label
                                            key={option.label}
                                            className={`flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 transition-colors ${
                                                markValue === option.value
                                                    ? 'border-indigo-500 bg-indigo-500/10'
                                                    : 'border-slate-700 bg-slate-800/50 hover:border-slate-600'
                                            }`}
                                        >
                                            <input
                                                type="radio"
                                                name="node-mark"
                                                value={option.value ?? 'UNMARK'}
                                                checked={markValue === option.value}
                                                onChange={() => setMarkValue(option.value)}
                                                className="accent-indigo-500"
                                            />
                                            <span
                                                className="h-3.5 w-3.5 shrink-0 rounded-full"
                                                style={{ backgroundColor: option.color }}
                                                aria-hidden="true"
                                            />
                                            <span className="min-w-0">
                                                <span className="block text-sm font-medium text-slate-100">
                                                    {option.label}
                                                </span>
                                                <span className="block text-xs text-slate-400">
                                                    {option.description}
                                                </span>
                                            </span>
                                        </label>
                                    ))}
                                </div>
                            </fieldset>
                        </NodeMarkModal>

                        <NewNodeAddModal
                            width={800}
                            header="添加新结点"
                            footer={
                                <div className="flex items-center gap-4">
                                    {graphType === 'directory' && (
                                        <label>
                                            <input
                                                type="checkbox"
                                                checked={nodeType === 'DETAIL'}
                                                onChange={(e) => setNodeType(e.target.checked ? 'DETAIL' : 'DIRECTORY')}
                                            />
                                            detail node
                                        </label>
                                    )}
                                    <Button onClick={closeNewNodeAddModal}>取消</Button>
                                    <Button type="primary" onClick={handleNewNodeAddConfirm}>
                                        确认
                                    </Button>
                                </div>
                            }
                        >
                            <div className="mb-4">
                                <label className="mr-4">
                                    text
                                    <input
                                        type="radio"
                                        name="opStatus"
                                        checked={nodeContentType === 'TEXT'}
                                        onChange={() => setNodeContentType('TEXT')}
                                    />
                                </label>
                                {graphType === 'detail' && (
                                    <label>
                                        image
                                        <input
                                            type="radio"
                                            name="opStatus"
                                            checked={nodeContentType === 'IMAGE'}
                                            onChange={() => setNodeContentType('IMAGE')}
                                        />
                                    </label>
                                )}
                            </div>
                            <div>
                                {nodeContentType === 'TEXT' ? (
                                    <textarea
                                        ref={newNodeAddModalInputRef}
                                        className="bg-textarea w-full resize-none p-2 outline-none"
                                        rows={6}
                                        maxLength={500}
                                        value={nodeEditContent}
                                        onChange={(e) => setNodeEditContent(e.target.value)}
                                    />
                                ) : (
                                    <>
                                        <FilePicker handleFileChange={handleFileChange} />
                                        <div className="mt-4">
                                            {/* image preview */}
                                            {tempFileUrl && <img src={tempFileUrl} />}
                                        </div>
                                    </>
                                )}
                            </div>
                        </NewNodeAddModal>

                        <NodeEditModal
                            width={800}
                            header="编辑结点"
                            footer={
                                <div className="flex items-center gap-4">
                                    <Button onClick={closeNodeEditModal}>取消</Button>
                                    <Button type="primary" onClick={handleNodeEditConfirm}>
                                        确认
                                    </Button>
                                </div>
                            }
                        >
                            {selectedNode?.contentType !== 'IMAGE' && (
                                <textarea
                                    ref={nodeEditModalInputRef}
                                    className="bg-textarea w-full resize-none p-2 outline-none"
                                    rows={6}
                                    maxLength={500}
                                    value={nodeEditContent}
                                    onChange={(e) => setNodeEditContent(e.target.value)}
                                />
                            )}

                            {selectedNode?.contentType === 'IMAGE' && (
                                <>
                                    <FilePicker handleFileChange={handleFileChange} />
                                    <div className="mt-4">
                                        {/* image preview */}
                                        {tempFileUrl && <img src={tempFileUrl} />}
                                    </div>
                                </>
                            )}
                        </NodeEditModal>

                        <NodeAddModal
                            width={800}
                            header="添加子结点"
                            footer={
                                <div className="flex items-center gap-4">
                                    {graphType === 'directory' && (
                                        <label>
                                            <input
                                                type="checkbox"
                                                checked={nodeType === 'DETAIL'}
                                                onChange={(e) => setNodeType(e.target.checked ? 'DETAIL' : 'DIRECTORY')}
                                            />
                                            detail node
                                        </label>
                                    )}
                                    <Button onClick={closeNodeAddModal}>取消</Button>
                                    <Button type="primary" onClick={handleNodeAddConfirm}>
                                        确认
                                    </Button>
                                </div>
                            }
                        >
                            <div className="mb-4">
                                <label className="mr-4">
                                    text
                                    <input
                                        type="radio"
                                        name="opStatus"
                                        checked={nodeContentType === 'TEXT'}
                                        onChange={() => setNodeContentType('TEXT')}
                                    />
                                </label>
                                {graphType === 'detail' && (
                                    <label>
                                        image
                                        <input
                                            type="radio"
                                            name="opStatus"
                                            checked={nodeContentType === 'IMAGE'}
                                            onChange={() => setNodeContentType('IMAGE')}
                                        />
                                    </label>
                                )}
                            </div>
                            <div>
                                {nodeContentType === 'TEXT' ? (
                                    <textarea
                                        ref={nodeAddModalInputRef}
                                        className="bg-textarea w-full resize-none p-2 outline-none"
                                        rows={6}
                                        maxLength={500}
                                        value={nodeEditContent}
                                        onChange={(e) => setNodeEditContent(e.target.value)}
                                    />
                                ) : (
                                    <>
                                        <FilePicker handleFileChange={handleFileChange} />
                                        <div className="mt-4">
                                            {/* image preview */}
                                            {tempFileUrl && <img src={tempFileUrl} />}
                                        </div>
                                    </>
                                )}
                            </div>
                        </NodeAddModal>

                        <NodeDeleteConfirmModal
                            header="确认要删除该结点吗？"
                            footer={
                                <div>
                                    <Button onClick={closeNodeDeleteConfirmModal}>取消</Button>
                                    <Button type="primary" onClick={handleNodeDeleteConfirm}>
                                        确认
                                    </Button>
                                </div>
                            }
                        ></NodeDeleteConfirmModal>

                        <ExitConfirmModal
                            header="确认退出编辑？"
                            footer={
                                <div className="flex justify-end gap-2">
                                    <Button onClick={closeExitConfirmModal}>取消</Button>
                                    <Button type="danger" onClick={handleConfirmExit}>
                                        确认退出
                                    </Button>
                                </div>
                            }
                        >
                            <p>您有未保存的修改，退出后将丢失所有更改。</p>
                        </ExitConfirmModal>

                        <SearchModal
                            isOpen={isSearchModalOpen}
                            onClose={() => setIsSearchModalOpen(false)}
                            onSelectNote={(note: Note) =>
                                navigate(
                                    `/noteDetails/${note.id}?label=${encodeURIComponent(note.label)}`
                                )
                            }
                        />
                        {/* Move search modal */}
                        {isMoveSearchOpen && (
                            <SearchModal
                                isOpen={isMoveSearchOpen}
                                onClose={() => {
                                    setIsMoveSearchOpen(false)
                                    setMoveSourceNodeId(null)
                                }}
                                onSelectNote={handleMoveSelectNote}
                                mode="select"
                                // excludeNoteId={noteDetail?.noteId}
                            />
                        )}

                        {/* Move success modal */}
                        {moveSuccessTarget && (
                            <MoveSuccessModal
                                isOpen={true}
                                onClose={() => setMoveSuccessTarget(null)}
                                targetNoteId={moveSuccessTarget.id}
                                targetNoteLabel={moveSuccessTarget.label}
                            />
                        )}
                    </>
                </div>
            </PaperContext>
        )
    }
)

export default NoteGraph

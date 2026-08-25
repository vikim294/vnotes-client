import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { v4 as uuidv4 } from 'uuid'
import {
    ArrowLeft,
    CircleUserRound,
    Download,
    FileJson,
    Home,
    LoaderCircle,
    LogOut,
    RotateCcw,
    Search,
    Trash2,
    Upload,
} from 'lucide-react'
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
    type AddedNodeDto,
    type BatchUpdateNodesDto,
    type MarkType,
    type NodeContentType,
    type NodeData,
    type NodeType,
    type NoteDetailData,
    type UpdatedNodeDto,
} from '../types'
import {
    API_BASE_URL,
    authFetch,
    exportNotesAsJson,
    getUserProfile,
    IMAGE_BASE_URL,
    importNotesFromJson,
    moveDetailNode,
    toggleNoteShare,
    uploadUserAvatar,
    type ImportStrategy,
    type Note,
    type UserProfile,
} from '../api'
import FilePicker from './FilePicker'
import MoveSuccessModal from '../components/MoveSuccessModal'
import { toAddedNodeDto, toUpdatedNodeDto } from '../nodeDtos'
import ProfilePanel from './ProfilePanel'
import TrashBinModal from './TrashBinModal'

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
const NODE_LABEL_MAX_LENGTH = 8192

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
        const [tempImageSize, setTempImageSize] = useState<{
            width: number
            height: number
        } | null>(null)
        // for uploading
        const tempFileRef = useRef<File | null>(null)
        // for uploading(add)
        const uuidToFileMapRef = useRef<Record<string, File>>({})

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
        const [isTrashBinOpen, setIsTrashBinOpen] = useState(false)

        // profile
        const {
            Modal: ProfileModal,
            openModal: openProfileModal,
            closeModal: closeProfileModal,
        } = useModal()
        const [profile, setProfile] = useState<UserProfile | null>(null)
        const [isProfileLoading, setIsProfileLoading] = useState(false)
        const [profileError, setProfileError] = useState<string | null>(null)
        const [isAvatarUploading, setIsAvatarUploading] = useState(false)

        // export notes
        const {
            Modal: ExportModal,
            openModal: openExportModal,
            closeModal: closeExportModal,
        } = useModal()
        const [isExporting, setIsExporting] = useState(false)

        // import notes
        const {
            Modal: ImportModal,
            openModal: openImportModal,
            closeModal: closeImportModal,
        } = useModal()
        const [importFile, setImportFile] = useState<File | null>(null)
        const [importStrategy, setImportStrategy] = useState<ImportStrategy>('APPEND')
        const [isImporting, setIsImporting] = useState(false)

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
            setTempImageSize(null)
            tempFileRef.current = null
            openNewNodeAddModal()
        }

        const handleSaveEdit = async () => {
            setIsSaving(true)
            try {
                // console.log("save edit:", flatTree);

                // 保存本次编辑结果到后端 API
                const added: AddedNodeDto[] = []
                const updated: UpdatedNodeDto[] = []
                const deletedNodeIds: number[] = []

                const ft = flatTree.map(node => ({
                    ...node,
                    x: Number(node.x.toFixed(2)),
                    y: Number(node.y.toFixed(2)),
                    imageWidth: node.imageWidth ? Number(node.imageWidth.toFixed(2)) : undefined,
                    imageHeight: node.imageHeight ? Number(node.imageHeight.toFixed(2)) : undefined,
                }))

                for (const node of ft) {
                    if (node.opStatus === 'new') {
                        added.push(toAddedNodeDto(node))
                    } else if (node.opStatus === 'edited') {
                        updated.push(toUpdatedNodeDto(node))
                    } else if (node.opStatus === 'deleted') {
                        if (typeof node.id !== 'number') {
                            throw new Error(
                                `Deleted node id must be a number, received ${String(node.id)}`
                            )
                        }
                        deletedNodeIds.push(node.id)
                    }
                }

                const params: BatchUpdateNodesDto = {
                    added,
                    updated,
                    deletedNodeIds,
                }

                const url =
                    graphType === 'directory'
                        ? `${API_BASE_URL}/note/directory/batch`
                        : `${API_BASE_URL}/note/directory/${noteDetail!.directoryNodeId}/detail-nodes/batch`

                let response: Response
                if (graphType === 'detail') {
                    const formData = new FormData()
                    formData.append(
                        'request',
                        new Blob([JSON.stringify(params)], { type: 'application/json' })
                    )

                    for (const node of added) {
                        if (node.contentType !== 'IMAGE') continue

                        const file = uuidToFileMapRef.current[node.uuid]
                        if (!file) {
                            throw new Error(`图片节点 ${node.uuid} 缺少待上传文件`)
                        }
                        formData.append(`file.${node.uuid}`, file)
                    }

                    // 不手动设置 Content-Type，浏览器需要自动附加 multipart boundary。
                    response = await authFetch(url, {
                        method: 'PATCH',
                        body: formData,
                    })
                } else {
                    response = await authFetch(url, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(params),
                    })
                }

                const res = await response.json()
                if (res.code === 0) {
                    // reset
                    uuidToFileMapRef.current = {}

                    // 根据返回结果，更新 flatTree
                    const newFlatTree = []

                    // added -> update id, parentId
                    // updated -> update parentId
                    // deleted -> remove from flatTree

                    for (const item of flatTree) {
                        if (typeof item.id === 'number' && deletedNodeIds.includes(item.id)) {
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
                } else {
                    Toast.error(res.message || '保存失败')
                }
            } catch (error) {
                Toast.error(error instanceof Error ? error.message : '保存失败')
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
            setTempImageSize(null)
            tempFileRef.current = null
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

            if (typeof selectedNodeId !== 'number') {
                setNodeMenuVisible(false)
                Toast.warning('请先保存新增节点，再执行移动')
                return
            }

            setNodeMenuVisible(false)
            setMoveSourceNodeId(selectedNodeId)
            setIsMoveSearchOpen(true)
        }

        const handleAvatarSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
            const input = event.currentTarget
            const file = input.files?.[0]
            input.value = ''
            if (!file) return

            setIsAvatarUploading(true)
            try {
                const uploadedUrl = await uploadUserAvatar(file)
                setProfile((current) =>
                    current
                        ? {
                              ...current,
                              avatarUrl: uploadedUrl,
                          }
                        : current
                )
                Toast.success('头像已更新')
            } catch (error) {
                Toast.error(error instanceof Error ? error.message : '头像上传失败')
            } finally {
                setIsAvatarUploading(false)
            }
        }

        const loadProfile = async () => {
            setIsProfileLoading(true)
            setProfileError(null)
            try {
                setProfile(await getUserProfile())
            } catch (error) {
                const message = error instanceof Error ? error.message : '个人资料加载失败'
                setProfile(null)
                setProfileError(message)
                Toast.error(message)
            } finally {
                setIsProfileLoading(false)
            }
        }

        const handleOpenProfile = () => {
            openProfileModal()
            void loadProfile()
        }

        const handleLogout = () => {
            localStorage.removeItem('vnotes-token')
            navigate('/login', { replace: true })
        }

        const handleExportNotes = async () => {
            setIsExporting(true)
            try {
                const { blob, filename } = await exportNotesAsJson()
                const downloadUrl = URL.createObjectURL(blob)
                const anchor = document.createElement('a')
                anchor.href = downloadUrl
                anchor.download = filename
                document.body.appendChild(anchor)
                anchor.click()
                anchor.remove()
                window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 0)
                Toast.success('笔记已导出')
            } catch (error) {
                Toast.error(error instanceof Error ? error.message : '笔记导出失败')
            } finally {
                setIsExporting(false)
            }
        }

        const handleExportConfirm = () => {
            closeExportModal()
            void handleExportNotes()
        }

        const handleOpenImport = () => {
            setImportFile(null)
            setImportStrategy('APPEND')
            openImportModal()
        }

        const handleImportConfirm = async () => {
            if (!importFile) {
                Toast.error('请先选择 JSON 文件')
                return
            }

            setIsImporting(true)
            try {
                await importNotesFromJson(importFile, importStrategy)
                closeImportModal()
                setImportFile(null)
                Toast.success('笔记已导入')
                onExitEdit()
            } catch (error) {
                Toast.error(error instanceof Error ? error.message : '笔记导入失败')
            } finally {
                setIsImporting(false)
            }
        }

        const handleMoveSelectNote = async (note: Note) => {
            setIsMoveSearchOpen(false)
            if (moveSourceNodeId === null || !noteDetail) return

            try {
                await moveDetailNode(
                    noteDetail.directoryNodeId,
                    moveSourceNodeId,
                    note.id
                )
                // Find all descendants to remove from flatTree
                const descendants = findDescendantsByIdInFlatTree(flatTree, moveSourceNodeId)
                const allIdsToRemove = new Set([moveSourceNodeId, ...descendants.map((d) => d.id)])

                setFlatTree((prev) => prev.filter((node) => !allIdsToRemove.has(node.id)))
                setEditMode(false)
                setMoveSuccessTarget({ id: note.id, label: note.label })
            } catch (error) {
                Toast.error(error instanceof Error ? error.message : '详情节点移动失败')
            } finally {
                setMoveSourceNodeId(null)
            }
        }

        const handleNewNodeAddConfirm = () => {
            if (nodeContentType === 'IMAGE' && (!tempFileRef.current || !tempImageSize)) {
                Toast.error('请上传图片后再确认')
                return
            }

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
                imageWidth: nodeContentType === 'IMAGE' ? tempImageSize?.width : undefined,
                imageHeight: nodeContentType === 'IMAGE' ? tempImageSize?.height : undefined,
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
            if (selectedNode?.contentType === 'IMAGE') return

            setFlatTree((prev) => {
                const res = prev.map((node) => {
                    if (node.id === selectedNodeId) {
                        const newNode: NodeData = {
                            ...node,
                            label: nodeEditContent,
                            opStatus: node.opStatus === 'new' ? 'new' : 'edited',
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
            if (nodeContentType === 'IMAGE' && (!tempFileRef.current || !tempImageSize)) {
                Toast.error('请上传图片后再确认')
                return
            }

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
                    imageWidth: nodeContentType === 'IMAGE' ? tempImageSize?.width : undefined,
                    imageHeight: nodeContentType === 'IMAGE' ? tempImageSize?.height : undefined,
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
                    imageWidth: nodeContentType === 'IMAGE' ? tempImageSize?.width : undefined,
                    imageHeight: nodeContentType === 'IMAGE' ? tempImageSize?.height : undefined,
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
                const image = new Image()
                image.onload = () => {
                    setTempFileUrl(result)
                    setTempImageSize({
                        width: image.naturalWidth,
                        height: image.naturalHeight,
                    })
                    tempFileRef.current = file
                }
                image.onerror = () => Toast.error('无法读取所选图片')
                image.src = result
            }
            fr.onerror = () => Toast.error('无法读取所选图片')
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

                    {graphType === 'directory' && (
                        <div className="fixed top-4 left-4 flex flex-col gap-2">
                            <button
                                type="button"
                                onClick={handleOpenProfile}
                                className="grid h-10 w-10 cursor-pointer place-items-center rounded-full border border-slate-700 bg-slate-900/85 text-slate-400 shadow-lg backdrop-blur-sm transition-colors hover:border-indigo-500/70 hover:text-indigo-300"
                                title="个人资料"
                                aria-label="打开个人资料"
                            >
                                <CircleUserRound className="h-5 w-5" />
                            </button>
                            <button
                                type="button"
                                onClick={openExportModal}
                                disabled={isExporting}
                                className="grid h-10 w-10 cursor-pointer place-items-center rounded-full border border-slate-700 bg-slate-900/85 text-slate-400 shadow-lg backdrop-blur-sm transition-colors hover:border-indigo-500/70 hover:text-indigo-300 disabled:cursor-wait disabled:opacity-60"
                                title={isExporting ? '正在导出' : '导出笔记'}
                                aria-label={isExporting ? '正在导出笔记' : '导出笔记'}
                            >
                                {isExporting ? (
                                    <LoaderCircle className="h-5 w-5 animate-spin" />
                                ) : (
                                    <Download className="h-5 w-5" />
                                )}
                            </button>
                            <button
                                type="button"
                                onClick={handleOpenImport}
                                disabled={isImporting}
                                className="grid h-10 w-10 cursor-pointer place-items-center rounded-full border border-slate-700 bg-slate-900/85 text-slate-400 shadow-lg backdrop-blur-sm transition-colors hover:border-indigo-500/70 hover:text-indigo-300 disabled:cursor-wait disabled:opacity-60"
                                title={isImporting ? '正在导入' : '导入笔记'}
                                aria-label={isImporting ? '正在导入笔记' : '导入笔记'}
                            >
                                {isImporting ? (
                                    <LoaderCircle className="h-5 w-5 animate-spin" />
                                ) : (
                                    <Upload className="h-5 w-5" />
                                )}
                            </button>
                            <button
                                type="button"
                                onClick={() => setIsTrashBinOpen(true)}
                                className="grid h-10 w-10 cursor-pointer place-items-center rounded-full border border-slate-700 bg-slate-900/85 text-slate-400 shadow-lg backdrop-blur-sm transition-colors hover:border-rose-500/70 hover:text-rose-300"
                                title="回收站"
                                aria-label="打开回收站"
                            >
                                <Trash2 className="h-5 w-5" />
                            </button>
                            <button
                                type="button"
                                onClick={handleLogout}
                                className="grid h-10 w-10 cursor-pointer place-items-center rounded-full border border-slate-700 bg-slate-900/85 text-slate-400 shadow-lg backdrop-blur-sm transition-colors hover:border-rose-500/70 hover:text-rose-300"
                                title="退出登录"
                                aria-label="退出登录"
                            >
                                <LogOut className="h-5 w-5" />
                            </button>
                        </div>
                    )}

                    <div className="fixed top-4 right-4 select-none">
                        <button
                            type="button"
                            onClick={resetView}
                            className="grid h-10 w-10 cursor-pointer place-items-center rounded-full border border-slate-700 bg-slate-900/85 text-slate-400 shadow-lg backdrop-blur-sm transition-colors hover:border-indigo-500/70 hover:text-indigo-300"
                            title="重置视图"
                            aria-label="重置视图"
                        >
                            <RotateCcw className="h-5 w-5" />
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
                        <ProfileModal
                            width={440}
                            header="个人资料"
                            closeOnClickMask
                            footer={<Button onClick={closeProfileModal}>关闭</Button>}
                        >
                            {isProfileLoading ? (
                                <div className="flex min-h-72 flex-col items-center justify-center gap-3 text-sm text-slate-400">
                                    <LoaderCircle className="h-7 w-7 animate-spin text-indigo-400" />
                                    正在加载个人资料
                                </div>
                            ) : profile ? (
                                <ProfilePanel
                                    profile={profile}
                                    avatarUrl={
                                        profile.avatarUrl
                                            ? `${profile.avatarUrl}`
                                            : null
                                    }
                                    isUploading={isAvatarUploading}
                                    onAvatarSelect={handleAvatarSelect}
                                />
                            ) : (
                                <div className="flex min-h-52 flex-col items-center justify-center gap-4 text-center">
                                    <p className="text-sm text-slate-400">
                                        {profileError ?? '个人资料加载失败'}
                                    </p>
                                    <Button onClick={() => void loadProfile()}>重新加载</Button>
                                </div>
                            )}
                        </ProfileModal>

                        <ExportModal
                            width={420}
                            header="导出笔记"
                            closeOnClickMask
                            footer={
                                <div className="flex items-center gap-3">
                                    <Button onClick={closeExportModal}>取消</Button>
                                    <Button type="primary" onClick={handleExportConfirm}>
                                        确认导出
                                    </Button>
                                </div>
                            }
                        >
                            <fieldset>
                                <legend className="mb-4 text-sm text-slate-400">
                                    选择导出格式
                                </legend>
                                <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-indigo-500 bg-indigo-500/10 px-4 py-3">
                                    <input
                                        type="radio"
                                        name="export-format"
                                        value="json"
                                        defaultChecked
                                        className="accent-indigo-500"
                                    />
                                    <FileJson
                                        className="h-5 w-5 shrink-0 text-indigo-300"
                                        aria-hidden="true"
                                    />
                                    <span className="min-w-0">
                                        <span className="block text-sm font-medium text-slate-100">
                                            导出为 JSON 文件
                                        </span>
                                        <span className="mt-0.5 block text-xs text-slate-400">
                                            导出当前账号下的所有笔记
                                        </span>
                                    </span>
                                </label>
                            </fieldset>
                        </ExportModal>

                        <ImportModal
                            width={420}
                            header="导入笔记"
                            closeOnClickMask={!isImporting}
                            footer={
                                <div className="flex items-center gap-3">
                                    <Button onClick={closeImportModal} disabled={isImporting}>
                                        取消
                                    </Button>
                                    <Button
                                        type="primary"
                                        onClick={() => void handleImportConfirm()}
                                        disabled={!importFile || isImporting}
                                    >
                                        {isImporting ? (
                                            <span className="flex items-center gap-2">
                                                <LoaderCircle className="h-4 w-4 animate-spin" />
                                                正在导入
                                            </span>
                                        ) : (
                                            '确认导入'
                                        )}
                                    </Button>
                                </div>
                            }
                        >
                            <fieldset>
                                <legend className="mb-4 text-sm text-slate-400">
                                    选择导入格式
                                </legend>
                                <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-indigo-500 bg-indigo-500/10 px-4 py-3">
                                    <input
                                        type="radio"
                                        name="import-format"
                                        value="json"
                                        defaultChecked
                                        className="accent-indigo-500"
                                    />
                                    <FileJson
                                        className="h-5 w-5 shrink-0 text-indigo-300"
                                        aria-hidden="true"
                                    />
                                    <span className="text-sm font-medium text-slate-100">
                                        JSON 文件
                                    </span>
                                </label>
                            </fieldset>

                            <fieldset className="mt-5">
                                <legend className="mb-4 text-sm text-slate-400">
                                    选择导入策略
                                </legend>
                                <div className="grid gap-3">
                                    <label
                                        className={`flex cursor-pointer items-start gap-3 rounded-lg border px-4 py-3 transition-colors ${
                                            importStrategy === 'APPEND'
                                                ? 'border-indigo-500 bg-indigo-500/10'
                                                : 'border-slate-700 bg-slate-800/50 hover:border-slate-600'
                                        }`}
                                    >
                                        <input
                                            type="radio"
                                            name="import-strategy"
                                            value="APPEND"
                                            checked={importStrategy === 'APPEND'}
                                            disabled={isImporting}
                                            onChange={() => setImportStrategy('APPEND')}
                                            className="mt-0.5 accent-indigo-500"
                                        />
                                        <span className="min-w-0">
                                            <span className="block text-sm font-medium text-slate-100">
                                                追加导入
                                            </span>
                                            <span className="mt-0.5 block text-xs text-slate-400">
                                                保留现有笔记，将文件中的笔记追加进来
                                            </span>
                                        </span>
                                    </label>
                                    <label
                                        className={`flex cursor-pointer items-start gap-3 rounded-lg border px-4 py-3 transition-colors ${
                                            importStrategy === 'CLEAR'
                                                ? 'border-rose-500 bg-rose-500/10'
                                                : 'border-slate-700 bg-slate-800/50 hover:border-slate-600'
                                        }`}
                                    >
                                        <input
                                            type="radio"
                                            name="import-strategy"
                                            value="CLEAR"
                                            checked={importStrategy === 'CLEAR'}
                                            disabled={isImporting}
                                            onChange={() => setImportStrategy('CLEAR')}
                                            className="mt-0.5 accent-rose-500"
                                        />
                                        <span className="min-w-0">
                                            <span className="block text-sm font-medium text-slate-100">
                                                清空后导入
                                            </span>
                                            <span className="mt-0.5 block text-xs text-rose-300/80">
                                                先删除当前账号的所有笔记，再导入文件内容
                                            </span>
                                        </span>
                                    </label>
                                </div>
                            </fieldset>

                            <div className="mt-5">
                                <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-slate-600 bg-slate-800/50 px-4 py-4 text-sm text-slate-300 transition-colors hover:border-indigo-500/70 hover:bg-indigo-500/10 hover:text-indigo-200">
                                    <Upload className="h-4 w-4" aria-hidden="true" />
                                    <span>{importFile ? '重新选择 JSON 文件' : '上传 JSON 文件'}</span>
                                    <input
                                        type="file"
                                        accept="application/json,.json"
                                        className="sr-only"
                                        disabled={isImporting}
                                        onChange={(event) => {
                                            setImportFile(event.currentTarget.files?.[0] ?? null)
                                        }}
                                    />
                                </label>
                                {importFile && (
                                    <p className="mt-3 truncate text-xs text-slate-400" title={importFile.name}>
                                        已选择：{importFile.name}
                                    </p>
                                )}
                            </div>
                        </ImportModal>

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
                                        maxLength={NODE_LABEL_MAX_LENGTH}
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
                                    maxLength={NODE_LABEL_MAX_LENGTH}
                                    value={nodeEditContent}
                                    onChange={(e) => setNodeEditContent(e.target.value)}
                                />
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
                                        maxLength={NODE_LABEL_MAX_LENGTH}
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
                        <TrashBinModal
                            isOpen={isTrashBinOpen}
                            onClose={() => setIsTrashBinOpen(false)}
                            onRestored={onExitEdit}
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
                                excludeNoteId={noteDetail?.directoryNodeId}
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

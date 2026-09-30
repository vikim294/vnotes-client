import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { v4 as uuidv4 } from 'uuid'
import {
    ArrowLeft,
    Bell,
    CircleUserRound,
    Copy,
    Download,
    Eye,
    FileJson,
    FileText,
    Home,
    KeyRound,
    ListTree,
    LoaderCircle,
    LogOut,
    Hand,
    MousePointer2,
    Pencil,
    Plus,
    Search,
    Save,
    Tags,
    Trash2,
    Upload,
    X,
} from 'lucide-react'
import { findDescendantsByIdInFlatTree } from '../lib'
import { useLocation, useNavigate } from 'react-router'
import { clearAuthSession } from '../authSession'
import Button from '../components/Button'
import NodeMenu, { type NodeMenuExpose } from '../components/NodeMenu'
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
    changePassword,
    exportNotesAsJson,
    getArticle,
    getDetailNodeLocation,
    getDirectoryTags,
    getNoteShareAccessLogs,
    getNoteShareDetail,
    getTags,
    getUserProfile,
    getSharedArticle,
    importNotesFromJson,
    moveDetailNode,
    shareNote,
    unshareNote,
    updateArticle,
    uploadUserAvatar,
    type Article,
    type ImportStrategy,
    type Note,
    type NoteShareAccessLog,
    type NoteShareDetail,
    type Tag,
    type UserProfile,
} from '../api'
import FilePicker from './FilePicker'
import MoveSuccessModal from '../components/MoveSuccessModal'
import { toAddedNodeDto, toUpdatedNodeDto } from '../nodeDtos'
import ProfilePanel from './ProfilePanel'
import TrashBinModal from './TrashBinModal'
import NotificationModal from './NotificationModal'
import TagManagementModal from './TagManagementModal'
import DirectoryTags, { NoteTagList } from './DirectoryTags'
import TagCheckboxGroup from './TagCheckboxGroup'
import DetailNodePickerModal from './DetailNodePickerModal'
import GraphViewer, {
    type GraphViewerHandle,
    type GraphViewport,
    type StoredGraphViewport,
} from './GraphViewer'

interface NoteGraphProps {
    graphType: 'directory' | 'detail'
    viewMode?: 'owner' | 'shared'
    shareToken?: string
    noteTitle?: string
    noteTags?: Tag[]
    noteDetail?: NoteDetailData | null
    flatTree: NodeData[]
    setFlatTree: React.Dispatch<React.SetStateAction<NodeData[]>>
    onExitEdit: () => void
    allowOperate?: boolean
}

const VIEWPORT_STORAGE_KEY = 'vnote-directory-viewport'
const DETAIL_VIEWPORT_STORAGE_PREFIX = 'vnote-detail-viewport'
const DETAIL_RESET_CONSUMED_PREFIX = 'vnote-detail-reset-consumed'
const DETAIL_FOCUS_CONSUMED_PREFIX = 'vnote-detail-focus-consumed'
const NODE_LABEL_MAX_LENGTH = 8192
const NODE_INDENT = '    '
const NODE_TEXTAREA_CLASS_NAME =
    'node-text-font bg-textarea w-full resize-none overflow-x-auto whitespace-pre [overflow-wrap:normal] rounded-lg border border-slate-700/70 p-3 outline-none! transition-colors focus:border-indigo-500/60 focus:ring-2 focus:ring-indigo-500/15'
const NODE_TEXTAREA_DESKTOP_MEDIA = '(min-width: 768px)'
const NODE_TEXTAREA_MAX_HEIGHT = 350
const SHARE_NOTE_BASE_URL = `${window.location.origin}/share-note`

const resizeNodeTextarea = (textarea: HTMLTextAreaElement | null) => {
    if (!textarea) return

    if (!window.matchMedia(NODE_TEXTAREA_DESKTOP_MEDIA).matches) {
        textarea.style.height = ''
        textarea.style.overflowY = ''
        return
    }

    // 先恢复 rows 决定的默认高度，再测量完整内容高度；这样内容删除后也能缩回去
    textarea.style.height = ''
    
    const minHeight = textarea.offsetHeight
    const borderHeight = textarea.offsetHeight - textarea.clientHeight

    textarea.style.height = '0px'
    const contentHeight = textarea.scrollHeight + borderHeight
    const nextHeight = Math.min(
        Math.max(minHeight, contentHeight),
        NODE_TEXTAREA_MAX_HEIGHT
    )

    textarea.style.height = `${nextHeight}px`
    textarea.style.overflowY = contentHeight > NODE_TEXTAREA_MAX_HEIGHT ? 'auto' : 'hidden'
}

const getNodeListLabel = (node: NodeData) => {
    const label = node.label?.trim()
    if (label) return label
    if (node.contentType === 'IMAGE') return '图片节点'
    if (node.article) return '文章节点'
    return '未命名节点'
}

type NodeCreationKind = 'TEXT' | 'IMAGE' | 'ARTICLE' | 'REF'
type RefTargetType = 'NOTE' | 'DETAIL' | 'ARTICLE'

const REF_CONTENT_TYPE: Record<RefTargetType, NodeContentType> = {
    NOTE: 'REF_NOTE',
    DETAIL: 'REF_DETAIL',
    ARTICLE: 'REF_ARTICLE',
}

const DETAIL_NODE_CREATION_OPTIONS: Array<{
    value: NodeCreationKind
    label: string
}> = [
    { value: 'TEXT', label: 'text' },
    { value: 'IMAGE', label: 'image' },
    { value: 'ARTICLE', label: 'article' },
    { value: 'REF', label: 'ref' },
]

interface TextareaIndentEdit {
    value: string
    selectionStart: number
    selectionEnd: number
}

const editTextareaIndentation = (
    value: string,
    selectionStart: number,
    selectionEnd: number,
    outdent: boolean
): TextareaIndentEdit => {
    if (!outdent && selectionStart === selectionEnd) {
        return {
            value: `${value.slice(0, selectionStart)}${NODE_INDENT}${value.slice(selectionEnd)}`,
            selectionStart: selectionStart + NODE_INDENT.length,
            selectionEnd: selectionStart + NODE_INDENT.length,
        }
    }

    const blockStart = value.lastIndexOf('\n', Math.max(0, selectionStart - 1)) + 1
    const effectiveEnd =
        selectionEnd > selectionStart && value[selectionEnd - 1] === '\n'
            ? selectionEnd - 1
            : selectionEnd
    const nextLineBreak = value.indexOf('\n', effectiveEnd)
    const blockEnd = nextLineBreak === -1 ? value.length : nextLineBreak
    const block = value.slice(blockStart, blockEnd)
    const lines = block.split('\n')

    if (!outdent) {
        const indentedBlock = lines.map((line) => `${NODE_INDENT}${line}`).join('\n')
        return {
            value: `${value.slice(0, blockStart)}${indentedBlock}${value.slice(blockEnd)}`,
            selectionStart: selectionStart + NODE_INDENT.length,
            selectionEnd: selectionEnd + NODE_INDENT.length * lines.length,
        }
    }

    const removals = lines.map((line) => {
        if (line.startsWith('\t')) return 1
        return Math.min(line.match(/^ */)?.[0].length ?? 0, NODE_INDENT.length)
    })
    const outdentedBlock = lines
        .map((line, index) => line.slice(removals[index]))
        .join('\n')

    const removedBefore = (position: number) => {
        let lineOffset = 0
        let removed = 0

        lines.forEach((line, index) => {
            const lineStart = blockStart + lineOffset
            removed += Math.min(
                removals[index],
                Math.max(0, position - lineStart)
            )
            lineOffset += line.length + 1
        })

        return removed
    }

    return {
        value: `${value.slice(0, blockStart)}${outdentedBlock}${value.slice(blockEnd)}`,
        selectionStart: selectionStart - removedBefore(selectionStart),
        selectionEnd: selectionEnd - removedBefore(selectionEnd),
    }
}

const formatShareTime = (value: string) => {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('zh-CN')
}

const loadViewportState = (): StoredGraphViewport | null => {
    try {
        const stored = localStorage.getItem(VIEWPORT_STORAGE_KEY)
        if (stored) {
            return JSON.parse(stored) as StoredGraphViewport
        }
    } catch {
        // Ignore parse errors
    }
    return null
}

const saveViewportState = (viewport: StoredGraphViewport) => {
    try {
        localStorage.setItem(VIEWPORT_STORAGE_KEY, JSON.stringify(viewport))
    } catch {
        // Ignore storage errors
    }
}

const loadDetailViewportState = (storageKey: string): StoredGraphViewport | null => {
    try {
        const stored = sessionStorage.getItem(storageKey)
        return stored ? (JSON.parse(stored) as StoredGraphViewport) : null
    } catch {
        return null
    }
}

const saveDetailViewportState = (storageKey: string, viewport: StoredGraphViewport) => {
    try {
        sessionStorage.setItem(storageKey, JSON.stringify(viewport))
    } catch {
        // Ignore storage errors
    }
}

const hasConsumedDetailReset = (storageKey: string) => {
    try {
        return sessionStorage.getItem(storageKey) === 'true'
    } catch {
        return false
    }
}

const markDetailResetConsumed = (storageKey: string) => {
    try {
        sessionStorage.setItem(storageKey, 'true')
    } catch {
        // Ignore storage errors
    }
}

const hasConsumedDetailFocus = (storageKey: string) => {
    try {
        return sessionStorage.getItem(storageKey) === 'true'
    } catch {
        return false
    }
}

const markDetailFocusConsumed = (storageKey: string) => {
    try {
        sessionStorage.setItem(storageKey, 'true')
    } catch {
        // Ignore storage errors
    }
}

const NoteGraph = memo<NoteGraphProps>(
    ({
        graphType,
        viewMode = 'owner',
        shareToken,
        noteTitle,
        noteTags = [],
        noteDetail,
        flatTree,
        setFlatTree,
        onExitEdit,
        allowOperate = true,
    }) => {
        const navigate = useNavigate()
        const location = useLocation()
        const isSharedView = viewMode === 'shared'
        const detailHistoryKey =
            graphType === 'detail' && !isSharedView && noteDetail
                ? `${noteDetail.directoryNodeId}:${location.key}`
                : null
        const detailViewportStorageKey = detailHistoryKey
            ? `${DETAIL_VIEWPORT_STORAGE_PREFIX}:${detailHistoryKey}`
            : null
        const detailResetConsumedKey = detailHistoryKey
            ? `${DETAIL_RESET_CONSUMED_PREFIX}:${detailHistoryKey}`
            : null
        const navigationState = location.state as {
            resetView?: boolean
            focusNodeId?: number
        } | null
        const shouldResetDetailView = navigationState?.resetView === true
        const focusNodeId =
            typeof navigationState?.focusNodeId === 'number'
                ? navigationState.focusNodeId
                : null
        const detailFocusConsumedKey =
            detailHistoryKey && focusNodeId !== null
                ? `${DETAIL_FOCUS_CONSUMED_PREFIX}:${detailHistoryKey}:${focusNodeId}`
                : null
        const [graphInitialView] = useState<{
            viewport: StoredGraphViewport | null
            resetOnMount: boolean
            initialCenter: { x: number; y: number } | null
        }>(() => {
            const resetWasConsumed = detailResetConsumedKey
                ? hasConsumedDetailReset(detailResetConsumedKey)
                : false
            const focusWasConsumed = detailFocusConsumedKey
                ? hasConsumedDetailFocus(detailFocusConsumedKey)
                : false
            const focusNode =
                focusNodeId === null
                    ? null
                    : flatTree.find((node) => node.id === focusNodeId) ?? null
            const initialCenter =
                graphType === 'detail' && focusNode && !focusWasConsumed
                    ? { x: focusNode.x, y: focusNode.y }
                    : null
            const resetOnMount =
                initialCenter === null &&
                graphType === 'detail' &&
                shouldResetDetailView &&
                !resetWasConsumed

            if (graphType === 'directory') {
                return {
                    viewport: loadViewportState(),
                    resetOnMount: false,
                    initialCenter: null,
                }
            }
            if (initialCenter) {
                return { viewport: null, resetOnMount: false, initialCenter }
            }
            if (detailViewportStorageKey && !resetOnMount) {
                return {
                    viewport: loadDetailViewportState(detailViewportStorageKey),
                    resetOnMount,
                    initialCenter: null,
                }
            }
            return { viewport: null, resetOnMount, initialCenter: null }
        })

        const [viewport, setViewport] = useState<GraphViewport>({
            x: 0,
            y: 0,
            width: 0,
            height: 0,
            zoom: 1,
        })
        const graphViewerRef = useRef<GraphViewerHandle>(null)
        const saveActiveViewport = useCallback(
            (nextViewport: StoredGraphViewport) => {
                if (graphType === 'directory') {
                    saveViewportState(nextViewport)
                } else if (detailViewportStorageKey) {
                    saveDetailViewportState(detailViewportStorageKey, nextViewport)
                }
            },
            [detailViewportStorageKey, graphType]
        )

        useEffect(() => {
            if (graphInitialView.resetOnMount && detailResetConsumedKey) {
                markDetailResetConsumed(detailResetConsumedKey)
            }
        }, [detailResetConsumedKey, graphInitialView.resetOnMount])

        useEffect(() => {
            if (graphInitialView.initialCenter && detailFocusConsumedKey) {
                markDetailFocusConsumed(detailFocusConsumedKey)
            }
        }, [detailFocusConsumedKey, graphInitialView.initialCenter])

        // const [isAllExpanded, setIsAllExpand] = useState(true);

        // browse mode
        const [browseMode, setBrowseMode] = useState(true)

        // edit mode
        const [editMode, setEditMode] = useState(false)
        const [isSaving, setIsSaving] = useState(false)
        const [isRootNodeListOpen, setIsRootNodeListOpen] = useState(false)
        const [nodeMenuVisible, setNodeMenuVisible] = useState(false)
        const nodeMenuRef = useRef<NodeMenuExpose | null>(null)

        const leaveEditMode = () => {
            setEditMode(false)
            setNodeMenuVisible(false)
        }

        const [selectedNodeId, setSelectedNodeId] = useState<number | string | null>(null)
        const selectedNode = useMemo(() => {
            return flatTree.find((node) => node.id === selectedNodeId) ?? null
        }, [flatTree, selectedNodeId])
        const visibleNodes = useMemo(
            () => flatTree.filter((node) => node.opStatus !== 'deleted'),
            [flatTree]
        )
        const rootNodes = useMemo(
            () => visibleNodes.filter((node) => node.parentId == null),
            [visibleNodes]
        )
        // detail node is only for directory graph
        const [nodeType, setNodeType] = useState<NodeType>('DIRECTORY')
        const [selectableTags, setSelectableTags] = useState<Tag[]>([])
        const [selectedTagIds, setSelectedTagIds] = useState<number[]>([])
        const [isTagSelectionLoading, setIsTagSelectionLoading] = useState(false)
        const [tagSelectionError, setTagSelectionError] = useState<string | null>(null)
        const [isTagSelectionReady, setIsTagSelectionReady] = useState(false)
        const tagSelectionRequestRef = useRef<AbortController | null>(null)

        // add new node
        const {
            Modal: NewNodeAddModal,
            openModal: openNewNodeAddModal,
            closeModal: closeNewNodeAddModal,
        } = useModal({
            onModalVisible: useCallback(() => {
                resizeNodeTextarea(newNodeAddModalInputRef.current)
                newNodeAddModalInputRef.current?.focus()
            }, []),
        })
        const newNodeAddModalInputRef = useRef<HTMLTextAreaElement>(null)
        // for choosing new node content type: text or image
        const [nodeContentType, setNodeContentType] = useState<NodeContentType>('TEXT')
        const [isArticleNode, setIsArticleNode] = useState(false)
        const [refTargetType, setRefTargetType] = useState<RefTargetType>('NOTE')
        const [selectedRefTarget, setSelectedRefTarget] = useState<Note | null>(null)
        const [selectedRefDetailTarget, setSelectedRefDetailTarget] =
            useState<NodeData | null>(null)
        const [isRefSearchOpen, setIsRefSearchOpen] = useState(false)
        const [isRefNodePickerOpen, setIsRefNodePickerOpen] = useState(false)
        const nodeCreationKind: NodeCreationKind = nodeContentType.startsWith('REF_')
            ? 'REF'
            : nodeContentType === 'IMAGE'
              ? 'IMAGE'
              : isArticleNode
                ? 'ARTICLE'
                : 'TEXT'
        // for previewing the selected image file before uploading
        const [tempFileUrl, setTempFileUrl] = useState<string | null>(null)
        const [tempImageSize, setTempImageSize] = useState<{
            width: number
            height: number
        } | null>(null)
        const [imagePickerResetKey, setImagePickerResetKey] = useState(0)
        // for uploading
        const tempFileRef = useRef<File | null>(null)
        const imageReadRequestRef = useRef(0)
        // for uploading(add)
        const uuidToFileMapRef = useRef<Record<string, File>>({})

        // edit node
        const {
            Modal: NodeEditModal,
            openModal: openNodeEditModal,
            closeModal: closeNodeEditModal,
        } = useModal({
            onModalVisible: useCallback(() => {
                resizeNodeTextarea(nodeEditModalInputRef.current)
                nodeEditModalInputRef.current?.focus()
                // ⚠️ textarea 会把光标移动到文本前面，这里把光标移动到文本后面
                const len = nodeEditModalInputRef.current?.value.length ?? 0
                nodeEditModalInputRef.current?.setSelectionRange(len, len)
            }, []),
        })
        const [nodeEditContent, setNodeEditContent] = useState('')
        const nodeEditModalInputRef = useRef<HTMLTextAreaElement>(null)
        const handleNodeEditContentChange = (
            event: React.ChangeEvent<HTMLTextAreaElement>
        ) => {
            setNodeEditContent(event.target.value)
            resizeNodeTextarea(event.currentTarget)
        }

        // article content belongs to a persisted detail node and is saved independently.
        const {
            Modal: ArticleModal,
            openModal: openArticleModal,
            closeModal: closeArticleModal,
        } = useModal()
        const [articleDetailNodeId, setArticleDetailNodeId] = useState<number | null>(null)
        const [articleModalMode, setArticleModalMode] = useState<'view' | 'edit'>('view')
        const [article, setArticle] = useState<Article | null>(null)
        const [articleContent, setArticleContent] = useState('')
        const [isArticleLoading, setIsArticleLoading] = useState(false)
        const [isArticleSaving, setIsArticleSaving] = useState(false)
        const [articleError, setArticleError] = useState<string | null>(null)
        const articleRequestRef = useRef(0)

        // add node
        const {
            Modal: NodeAddModal,
            openModal: openNodeAddModal,
            closeModal: closeNodeAddModal,
        } = useModal({
            onModalVisible: useCallback(() => {
                resizeNodeTextarea(nodeAddModalInputRef.current)
                nodeAddModalInputRef.current?.focus()
            }, []),
        })
        const nodeAddModalInputRef = useRef<HTMLTextAreaElement>(null)

        useEffect(() => {
            const desktopMedia = window.matchMedia(NODE_TEXTAREA_DESKTOP_MEDIA)
            const syncTextareaHeights = () => {
                resizeNodeTextarea(newNodeAddModalInputRef.current)
                resizeNodeTextarea(nodeEditModalInputRef.current)
                resizeNodeTextarea(nodeAddModalInputRef.current)
            }

            desktopMedia.addEventListener('change', syncTextareaHeights)
            return () => desktopMedia.removeEventListener('change', syncTextareaHeights)
        }, [])

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

        // share note
        const {
            Modal: ShareNoteModal,
            openModal: openShareNoteModal,
            closeModal: closeShareNoteModal,
        } = useModal()
        const [shareDetail, setShareDetail] = useState<NoteShareDetail | null>(null)
        const [shareDetailNodeId, setShareDetailNodeId] = useState<number | null>(null)
        const [isShareDetailLoading, setIsShareDetailLoading] = useState(false)
        const [shareDetailError, setShareDetailError] = useState<string | null>(null)
        const [isUnsharing, setIsUnsharing] = useState(false)
        const [shareAccessLogs, setShareAccessLogs] = useState<NoteShareAccessLog[]>([])
        const [isShareAccessLogsLoading, setIsShareAccessLogsLoading] = useState(false)
        const [shareAccessLogsError, setShareAccessLogsError] = useState<string | null>(null)
        const shareDetailRequestRef = useRef(0)
        const shareAccessLogsRequestRef = useRef(0)
        const shareLink = shareDetail
            ? `${SHARE_NOTE_BASE_URL}/${encodeURIComponent(shareDetail.shareToken)}`
            : ''

        // exit confirmation modal
        const {
            Modal: ExitConfirmModal,
            openModal: openExitConfirmModal,
            closeModal: closeExitConfirmModal,
        } = useModal()

        // search modal
        const [isSearchModalOpen, setIsSearchModalOpen] = useState(false)
        const [isTrashBinOpen, setIsTrashBinOpen] = useState(false)
        const [isNotificationOpen, setIsNotificationOpen] = useState(false)
        const [isTagManagementOpen, setIsTagManagementOpen] = useState(false)

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

        // change password
        const oldPasswordInputRef = useRef<HTMLInputElement>(null)
        const {
            Modal: ChangePasswordModal,
            openModal: openChangePasswordModal,
            closeModal: closeChangePasswordModal,
        } = useModal({
            onModalVisible: useCallback(() => oldPasswordInputRef.current?.focus(), []),
        })
        const [oldPassword, setOldPassword] = useState('')
        const [newPassword, setNewPassword] = useState('')
        const [changePasswordError, setChangePasswordError] = useState<string | null>(null)
        const [isChangingPassword, setIsChangingPassword] = useState(false)

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
        } | null>(null)

        const loadArticle = useCallback(async (detailNodeId: number) => {
            const requestId = ++articleRequestRef.current
            setArticle(null)
            setArticleContent('')
            setArticleError(null)
            setIsArticleLoading(true)

            try {
                const nextArticle = isSharedView
                    ? await getSharedArticle(detailNodeId, shareToken ?? '')
                    : await getArticle(detailNodeId)
                if (requestId !== articleRequestRef.current) return
                setArticle(nextArticle)
                setArticleContent(nextArticle.content ?? '')
            } catch (error) {
                if (requestId !== articleRequestRef.current) return
                setArticleError(error instanceof Error ? error.message : '文章加载失败')
            } finally {
                if (requestId === articleRequestRef.current) {
                    setIsArticleLoading(false)
                }
            }
        }, [isSharedView, shareToken])

        const openArticle = useCallback(
            (detailNodeId: number, mode: 'view' | 'edit') => {
                setNodeMenuVisible(false)
                setArticleDetailNodeId(detailNodeId)
                setArticleModalMode(mode)
                openArticleModal()
                void loadArticle(detailNodeId)
            },
            [loadArticle, openArticleModal]
        )

        const openReferencedDetailNode = useCallback(
            (detailNodeId: number) => {
                if (isSharedView) {
                    Toast.warning('分享页面暂不支持跳转到引用的详情节点')
                    return
                }

                void getDetailNodeLocation(detailNodeId)
                    .then((locationInfo) => {
                        if (locationInfo.directoryNodeId === noteDetail?.directoryNodeId) {
                            const targetNode = flatTree.find(
                                (node) =>
                                    node.id === locationInfo.id &&
                                    node.opStatus !== 'deleted'
                            )
                            if (!targetNode) {
                                Toast.error('引用的详情节点不存在')
                                return
                            }
                            graphViewerRef.current?.centerOn(targetNode.x, targetNode.y)
                            return
                        }

                        navigate(`/noteDetails/${locationInfo.directoryNodeId}`, {
                            state: { focusNodeId: locationInfo.id },
                        })
                    })
                    .catch((error: unknown) => {
                        Toast.error(
                            error instanceof Error
                                ? error.message
                                : '引用的详情节点加载失败'
                        )
                    })
            },
            [flatTree, isSharedView, navigate, noteDetail?.directoryNodeId]
        )

        // context
        const paperContext = useMemo(
            () => ({
                graphType,
                browseMode,
                flatTree,
                editMode,
                isSaving,
                viewportZoom: viewport.zoom,
                selectedNodeId,
                setSelectedNodeId,
                nodeMenuRef,
                isChoosingParent,
                setFlatTree,
                setNodeMenuVisible,
                setChosenParentNodeId,
                openArticle,
                openReferencedDetailNode,
            }),
            [
                graphType,
                browseMode,
                flatTree,
                setFlatTree,
                editMode,
                isSaving,
                viewport.zoom,
                selectedNodeId,
                isChoosingParent,
                openArticle,
                openReferencedDetailNode,
            ]
        )

        const resetTagSelection = () => {
            tagSelectionRequestRef.current?.abort()
            tagSelectionRequestRef.current = null
            setSelectableTags([])
            setSelectedTagIds([])
            setIsTagSelectionLoading(false)
            setTagSelectionError(null)
            setIsTagSelectionReady(false)
        }

        const handleNodeTextareaKeyDown = (
            event: React.KeyboardEvent<HTMLTextAreaElement>
        ) => {
            if (event.key !== 'Tab') return

            event.preventDefault()
            const textarea = event.currentTarget
            const edit = editTextareaIndentation(
                textarea.value,
                textarea.selectionStart,
                textarea.selectionEnd,
                event.shiftKey
            )

            if (edit.value.length > NODE_LABEL_MAX_LENGTH || edit.value === textarea.value) {
                return
            }

            setNodeEditContent(edit.value)
            window.requestAnimationFrame(() => {
                if (textarea.isConnected) {
                    textarea.setSelectionRange(edit.selectionStart, edit.selectionEnd)
                }
            })
        }

        const handleArticleTextareaKeyDown = (
            event: React.KeyboardEvent<HTMLTextAreaElement>
        ) => {
            if (event.key !== 'Tab') return

            event.preventDefault()
            const textarea = event.currentTarget
            const edit = editTextareaIndentation(
                textarea.value,
                textarea.selectionStart,
                textarea.selectionEnd,
                event.shiftKey
            )

            if (edit.value === textarea.value) return

            setArticleContent(edit.value)
            window.requestAnimationFrame(() => {
                if (textarea.isConnected) {
                    textarea.setSelectionRange(edit.selectionStart, edit.selectionEnd)
                }
            })
        }

        const loadTagSelection = async (
            directoryNodeId?: number,
            fallbackSelectedTagIds: number[] = []
        ) => {
            tagSelectionRequestRef.current?.abort()
            const controller = new AbortController()
            tagSelectionRequestRef.current = controller

            setSelectedTagIds(fallbackSelectedTagIds)
            setIsTagSelectionLoading(true)
            setTagSelectionError(null)
            setIsTagSelectionReady(false)

            try {
                const [tags, directoryTags] = await Promise.all([
                    getTags(controller.signal),
                    directoryNodeId === undefined
                        ? Promise.resolve<Tag[]>([])
                        : getDirectoryTags(directoryNodeId, controller.signal),
                ])

                if (controller.signal.aborted) return
                setSelectableTags(tags)
                setSelectedTagIds(
                    directoryNodeId === undefined
                        ? fallbackSelectedTagIds
                        : directoryTags.map((tag) => tag.id)
                )
                setIsTagSelectionReady(true)
            } catch (loadError) {
                if (loadError instanceof DOMException && loadError.name === 'AbortError') return
                setSelectableTags([])
                setTagSelectionError(
                    loadError instanceof Error ? loadError.message : '标签列表加载失败'
                )
            } finally {
                if (!controller.signal.aborted) setIsTagSelectionLoading(false)
            }
        }

        const handleDirectoryNodeTypeChange = (isDetail: boolean) => {
            setNodeType(isDetail ? 'DETAIL' : 'DIRECTORY')
            if (isDetail) void loadTagSelection()
            else resetTagSelection()
        }

        const toggleSelectedTag = (tagId: number) => {
            setSelectedTagIds((current) =>
                current.includes(tagId)
                    ? current.filter((id) => id !== tagId)
                    : [...current, tagId]
            )
        }

        const resetNodeCreationType = () => {
            setNodeContentType('TEXT')
            setIsArticleNode(false)
            setRefTargetType('NOTE')
            setSelectedRefTarget(null)
            setSelectedRefDetailTarget(null)
            setIsRefSearchOpen(false)
            setIsRefNodePickerOpen(false)
        }

        const handleNodeCreationKindChange = (kind: NodeCreationKind) => {
            setSelectedRefTarget(null)
            setSelectedRefDetailTarget(null)
            setIsRefSearchOpen(false)
            setIsRefNodePickerOpen(false)

            if (kind === 'ARTICLE') {
                setNodeContentType('TEXT')
                setIsArticleNode(true)
                return
            }

            setIsArticleNode(false)
            if (kind === 'REF') {
                setRefTargetType('NOTE')
                setNodeContentType('REF_NOTE')
                return
            }

            setNodeContentType(kind)
        }

        const handleRefTargetTypeChange = (targetType: RefTargetType) => {
            setRefTargetType(targetType)
            setNodeContentType(REF_CONTENT_TYPE[targetType])
            setSelectedRefTarget(null)
            setSelectedRefDetailTarget(null)
            setIsRefSearchOpen(false)
            setIsRefNodePickerOpen(false)
        }

        const validateRefNodeForCreate = () => {
            if (!nodeContentType.startsWith('REF_')) return true
            if (!nodeEditContent.trim()) {
                Toast.error('请输入引用节点的文本内容')
                return false
            }

            if (nodeContentType === 'REF_NOTE' && !selectedRefTarget) {
                Toast.error('请先选择引用目标')
                return false
            }
            if (
                nodeContentType === 'REF_NOTE' &&
                selectedRefTarget?.id === noteDetail?.directoryNodeId
            ) {
                Toast.error('不能引用当前笔记')
                return false
            }
            if (nodeContentType !== 'REF_NOTE' && !selectedRefDetailTarget) {
                Toast.error('请先选择引用目标')
                return false
            }
            return true
        }

        const renderNodeCreationTypeControls = () => {
            if (graphType !== 'detail') return null

            return (
                <div className="mb-4 grid gap-4">
                    <fieldset>
                        <legend className="mb-2 text-sm text-slate-400">节点内容类型</legend>
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                            {DETAIL_NODE_CREATION_OPTIONS.map((option) => (
                                <label
                                    key={option.value}
                                    className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
                                        nodeCreationKind === option.value
                                            ? 'border-indigo-500 bg-indigo-500/10 text-indigo-200'
                                            : 'border-slate-700/60 bg-black/20 text-slate-400 hover:bg-white/5 hover:text-slate-200'
                                    }`}
                                >
                                    <input
                                        type="radio"
                                        name="node-creation-kind"
                                        checked={nodeCreationKind === option.value}
                                        onChange={() =>
                                            handleNodeCreationKindChange(option.value)
                                        }
                                        className="accent-indigo-500"
                                    />
                                    {option.label}
                                </label>
                            ))}
                        </div>
                    </fieldset>

                    {nodeCreationKind === 'REF' && (
                        <label className="grid gap-2 text-sm text-slate-400">
                            引用目标类型
                            <select
                                value={refTargetType}
                                onChange={(event) =>
                                    handleRefTargetTypeChange(
                                        event.target.value as RefTargetType
                                    )
                                }
                                className="h-10 rounded-lg border border-slate-700/70 bg-black/25 px-3 text-sm text-slate-200 outline-none transition-colors focus:border-indigo-500/60 focus:ring-2 focus:ring-indigo-500/15"
                            >
                                <option value="NOTE">笔记</option>
                                <option value="DETAIL">详情节点</option>
                                <option value="ARTICLE">文章节点</option>
                            </select>
                        </label>
                    )}
                </div>
            )
        }

        const renderRefTargetSelection = () => {
            if (nodeCreationKind !== 'REF') return null

            return (
                <div className="mt-4">
                    <Button
                        type="secondary"
                        className="max-w-full gap-2"
                        onClick={() => setIsRefSearchOpen(true)}
                    >
                        <Search className="h-4 w-4 shrink-0" aria-hidden="true" />
                        <span className="truncate">
                            {refTargetType === 'NOTE' && selectedRefTarget
                                ? `引用目标：${selectedRefTarget.label}`
                                : refTargetType !== 'NOTE' && selectedRefDetailTarget
                                  ? `引用目标：${
                                        selectedRefDetailTarget.contentType === 'IMAGE'
                                            ? '图片节点'
                                            : selectedRefDetailTarget.label
                                    }`
                                  : refTargetType === 'NOTE'
                                    ? '选择目标'
                                    : '选择目录'}
                        </span>
                    </Button>
                </div>
            )
        }

        const clearPendingImage = () => {
            imageReadRequestRef.current += 1
            tempFileRef.current = null
            setTempFileUrl(null)
            setTempImageSize(null)
            setImagePickerResetKey((current) => current + 1)
        }

        const loadPendingImage = (file: File, source: 'picker' | 'clipboard') => {
            if (!file.type.startsWith('image/')) {
                Toast.error('请选择或粘贴图片文件')
                return
            }

            const requestId = ++imageReadRequestRef.current
            const reader = new FileReader()

            reader.onload = () => {
                if (requestId !== imageReadRequestRef.current) return

                const result = reader.result
                if (typeof result !== 'string') {
                    Toast.error('无法读取图片')
                    return
                }

                const image = new Image()
                image.onload = () => {
                    if (requestId !== imageReadRequestRef.current) return

                    tempFileRef.current = file
                    setTempFileUrl(result)
                    setTempImageSize({
                        width: image.naturalWidth,
                        height: image.naturalHeight,
                    })
                    if (source === 'clipboard') Toast.success('图片已粘贴')
                }
                image.onerror = () => Toast.error('无法读取图片内容')
                image.src = result
            }
            reader.onerror = () => Toast.error('无法读取图片文件')
            reader.readAsDataURL(file)
        }

        const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
            const file = event.target.files?.[0]
            if (file) loadPendingImage(file, 'picker')
        }

        const handleImagePaste = (event: React.ClipboardEvent<HTMLDivElement>) => {
            if (graphType !== 'detail') return

            const imageItem = Array.from(event.clipboardData.items).find(
                (item) => item.kind === 'file' && item.type.startsWith('image/')
            )
            if (!imageItem) return

            const clipboardFile = imageItem.getAsFile()
            if (!clipboardFile) return

            event.preventDefault()
            setNodeContentType('IMAGE')
            setIsArticleNode(false)
            setSelectedRefTarget(null)
            setImagePickerResetKey((current) => current + 1)

            const extension = clipboardFile.type.split('/')[1]?.replace('jpeg', 'jpg') || 'png'
            const file = clipboardFile.name
                ? clipboardFile
                : new File([clipboardFile], `pasted-image-${Date.now()}.${extension}`, {
                      type: clipboardFile.type,
                  })
            loadPendingImage(file, 'clipboard')
        }

        const renderImageInput = () => (
            <div
                tabIndex={0}
                className="rounded-xl border border-dashed border-slate-600 bg-slate-950/40 p-4 outline-none transition-colors focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
            >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <FilePicker
                        handleFileChange={handleFileChange}
                        resetKey={imagePickerResetKey}
                    />
                    <p className="text-xs text-slate-400">
                        或直接按 <kbd className="rounded bg-slate-800 px-1.5 py-0.5">Ctrl / ⌘ + V</kbd>{' '}
                        粘贴图片
                    </p>
                </div>

                {tempFileUrl && tempImageSize ? (
                    <div className="mt-4 overflow-hidden rounded-lg border border-slate-700 bg-black/40">
                        <img
                            src={tempFileUrl}
                            alt="待添加图片预览"
                            className="mx-auto max-h-80 max-w-full object-contain"
                        />
                        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-700 px-3 py-2.5">
                            <span className="min-w-0 truncate text-xs text-slate-400">
                                {tempFileRef.current?.name || '剪贴板图片'} · {tempImageSize.width} ×{' '}
                                {tempImageSize.height}
                            </span>
                            <Button type="danger" className="gap-2" onClick={clearPendingImage}>
                                <Trash2 className="h-4 w-4" />
                                删除图片
                            </Button>
                        </div>
                    </div>
                ) : (
                    <div className="mt-4 grid min-h-32 place-items-center rounded-lg bg-slate-900/60 px-4 text-center text-sm text-slate-500">
                        请选择图片文件，或将截图和剪贴板图片直接粘贴到弹窗中
                    </div>
                )}
            </div>
        )

        const handleAddNewNode = () => {
            setNodeEditContent('')
            setNodeType('DIRECTORY')
            resetTagSelection()
            resetNodeCreationType()
            clearPendingImage()
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
                    leaveEditMode()
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
                leaveEditMode()
                // No modifications, no need to refetch data
            }
        }

        const handleConfirmExit = () => {
            closeExitConfirmModal()
            leaveEditMode()
            onExitEdit()
        }

        const handleBeforeResetView = useCallback(() => {
            // Clear cached viewport for directory
            if (graphType === 'directory') {
                localStorage.removeItem(VIEWPORT_STORAGE_KEY)
            }
        }, [graphType])

        const handleNodeEdit = () => {
            const nodeToEdit = flatTree.find((node) => node.id === selectedNodeId)
            // show the current value
            setNodeEditContent(nodeToEdit?.label ?? '')
            setTempFileUrl(null)
            if (selectedNode?.contentType === 'IMAGE') {
                setNodeContentType('IMAGE')
            }

            if (graphType === 'directory' && nodeToEdit?.nodeType === 'DETAIL') {
                void loadTagSelection(
                    typeof nodeToEdit.id === 'number' ? nodeToEdit.id : undefined,
                    nodeToEdit.tagIds ?? []
                )
            } else {
                resetTagSelection()
            }
            openNodeEditModal()
        }

        const handleNodeAddChild = () => {
            setNodeEditContent('')
            setNodeType('DIRECTORY')
            resetTagSelection()
            resetNodeCreationType()
            clearPendingImage()
            openNodeAddModal()
        }

        const handleNodeSetParent = () => {
            setNodeMenuVisible(false)
            setChosenParentNodeId(null)
            setIsChoosingParent(true)
        }

        const handleCancelChooseParent = () => {
            setIsChoosingParent(false)
            setChosenParentNodeId(null)
            setNodeMenuVisible(false)
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

        const handleNodeOpenArticle = () => {
            const detailNodeId = selectedNode?.id
            if (
                graphType !== 'detail' ||
                selectedNode?.article !== true ||
                typeof detailNodeId !== 'number'
            ) {
                return
            }

            openArticle(detailNodeId, 'edit')
        }

        const handleCloseArticle = () => {
            articleRequestRef.current += 1
            closeArticleModal()
            setArticleDetailNodeId(null)
            setArticleModalMode('view')
            setArticle(null)
            setArticleContent('')
            setArticleError(null)
            setIsArticleLoading(false)
        }

        const handleSaveArticle = async () => {
            if (
                articleModalMode !== 'edit' ||
                articleDetailNodeId === null ||
                !article ||
                isArticleSaving
            ) {
                return
            }

            setIsArticleSaving(true)
            try {
                await updateArticle(articleDetailNodeId, articleContent)
                handleCloseArticle()
                Toast.success('文章已保存')
            } catch (error) {
                Toast.error(error instanceof Error ? error.message : '文章保存失败')
            } finally {
                setIsArticleSaving(false)
            }
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

        const loadShareAccessLogs = async (noteShareId: number) => {
            const requestId = ++shareAccessLogsRequestRef.current
            setShareAccessLogs([])
            setShareAccessLogsError(null)
            setIsShareAccessLogsLoading(true)

            try {
                const accessLogs = await getNoteShareAccessLogs(noteShareId)
                if (requestId !== shareAccessLogsRequestRef.current) return
                setShareAccessLogs(accessLogs)
            } catch (error) {
                if (requestId !== shareAccessLogsRequestRef.current) return
                setShareAccessLogsError(
                    error instanceof Error ? error.message : '访问记录加载失败'
                )
            } finally {
                if (requestId === shareAccessLogsRequestRef.current) {
                    setIsShareAccessLogsLoading(false)
                }
            }
        }

        const loadShareDetail = async (nodeId: number) => {
            const requestId = ++shareDetailRequestRef.current
            shareAccessLogsRequestRef.current += 1
            setShareDetailNodeId(nodeId)
            setShareDetail(null)
            setShareDetailError(null)
            setIsShareDetailLoading(true)
            setShareAccessLogs([])
            setShareAccessLogsError(null)
            setIsShareAccessLogsLoading(false)
            openShareNoteModal()

            try {
                const detail = await getNoteShareDetail(nodeId)
                if (requestId !== shareDetailRequestRef.current) return
                setShareDetail(detail)
                setIsShareDetailLoading(false)
                void loadShareAccessLogs(detail.id)
            } catch (error) {
                if (requestId !== shareDetailRequestRef.current) return
                setShareDetailError(
                    error instanceof Error ? error.message : '分享详情加载失败'
                )
                setIsShareDetailLoading(false)
            }
        }

        const handleNodeToggleShare = async () => {
            const nodeId = selectedNode?.id
            if (
                !nodeId ||
                typeof nodeId !== 'number' ||
                graphType !== 'directory' ||
                selectedNode?.nodeType !== 'DETAIL'
            ) {
                return
            }

            const wasShared = selectedNode.shared === true
            handleNodeMenuClose()

            if (wasShared) {
                void loadShareDetail(nodeId)
                return
            }

            try {
                await shareNote(nodeId)
                setFlatTree((prev) => {
                    return prev.map((node) => {
                        if (node.id === nodeId) {
                            return {
                                ...node,
                                shared: true,
                            }
                        }
                        return node
                    })
                })
                Toast.success('分享成功')
                void loadShareDetail(nodeId)
            } catch (error) {
                Toast.error(error instanceof Error ? error.message : '分享状态更新失败')
            }
        }

        const handleCloseShareDetail = () => {
            shareDetailRequestRef.current += 1
            shareAccessLogsRequestRef.current += 1
            closeShareNoteModal()
            setShareDetail(null)
            setShareDetailNodeId(null)
            setShareDetailError(null)
            setShareAccessLogs([])
            setShareAccessLogsError(null)
            setIsShareDetailLoading(false)
            setIsShareAccessLogsLoading(false)
        }

        const handleCopyShareLink = async () => {
            if (!shareLink) return

            try {
                await navigator.clipboard.writeText(shareLink)
                Toast.success('分享链接已复制')
            } catch {
                Toast.error('复制失败，请手动复制链接')
            }
        }

        const handleUnshareFromDetail = async () => {
            if (shareDetailNodeId === null || isUnsharing) return

            setIsUnsharing(true)
            try {
                await unshareNote(shareDetailNodeId)
                setFlatTree((prev) =>
                    prev.map((node) =>
                        node.id === shareDetailNodeId ? { ...node, shared: false } : node
                    )
                )
                handleCloseShareDetail()
                Toast.success('已取消分享')
            } catch (error) {
                Toast.error(error instanceof Error ? error.message : '取消分享失败')
            } finally {
                setIsUnsharing(false)
            }
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

        const resetChangePasswordForm = () => {
            setOldPassword('')
            setNewPassword('')
            setChangePasswordError(null)
        }

        const handleOpenChangePassword = () => {
            resetChangePasswordForm()
            closeProfileModal()
            openChangePasswordModal()
        }

        const handleCancelChangePassword = () => {
            closeChangePasswordModal()
            resetChangePasswordForm()
            openProfileModal()
        }

        const handleChangePasswordConfirm = async () => {
            if (oldPassword.length < 8 || newPassword.length < 8) {
                setChangePasswordError('旧密码和新密码都不能少于 8 位')
                return
            }
            if (oldPassword === newPassword) {
                setChangePasswordError('新密码不能与旧密码相同')
                return
            }

            setIsChangingPassword(true)
            setChangePasswordError(null)
            try {
                await changePassword(oldPassword, newPassword)
                closeChangePasswordModal()
                resetChangePasswordForm()
                Toast.success('密码修改成功')
            } catch (error) {
                setChangePasswordError(
                    error instanceof Error ? error.message : '修改密码失败'
                )
            } finally {
                setIsChangingPassword(false)
            }
        }

        const handleLogout = () => {
            clearAuthSession()
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
                leaveEditMode()
                setMoveSuccessTarget({ id: note.id })
            } catch (error) {
                Toast.error(error instanceof Error ? error.message : '详情节点移动失败')
            } finally {
                setMoveSourceNodeId(null)
            }
        }

        const handleNewNodeAddConfirm = () => {
            if (graphType === 'directory' && nodeType === 'DETAIL' && isTagSelectionLoading) {
                Toast.warning('标签正在加载，请稍候')
                return
            }

            if (nodeContentType === 'IMAGE' && (!tempFileRef.current || !tempImageSize)) {
                Toast.error('请上传图片后再确认')
                return
            }
            if (!validateRefNodeForCreate()) return

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
                article:
                    graphType === 'detail' && nodeContentType === 'TEXT'
                        ? isArticleNode
                        : undefined,
                refDirectoryNodeId:
                    nodeContentType === 'REF_NOTE' ? selectedRefTarget?.id : undefined,
                refDetailNodeId:
                    nodeContentType === 'REF_DETAIL' || nodeContentType === 'REF_ARTICLE'
                        ? typeof selectedRefDetailTarget?.id === 'number'
                            ? selectedRefDetailTarget.id
                            : undefined
                        : undefined,
                // directory graph only
                nodeType,
                tagIds:
                    graphType === 'directory' &&
                    nodeType === 'DETAIL' &&
                    isTagSelectionReady
                        ? [...selectedTagIds]
                        : undefined,
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

            clearPendingImage()
            resetTagSelection()
            closeNewNodeAddModal()
        }

        const handleNodeEditConfirm = () => {
            if (!selectedNodeId) return
            if (selectedNode?.contentType === 'IMAGE') return
            if (
                graphType === 'directory' &&
                selectedNode?.nodeType === 'DETAIL' &&
                isTagSelectionLoading
            ) {
                Toast.warning('标签正在加载，请稍候')
                return
            }

            setFlatTree((prev) => {
                const res = prev.map((node) => {
                    if (node.id === selectedNodeId) {
                        const newNode: NodeData = {
                            ...node,
                            label: nodeEditContent,
                            tagIds:
                                graphType === 'directory' && node.nodeType === 'DETAIL'
                                    ? isTagSelectionReady
                                        ? [...selectedTagIds]
                                        : node.tagIds
                                    : undefined,
                            opStatus: node.opStatus === 'new' ? 'new' : 'edited',
                        }
                        return newNode
                    } else return node
                })

                return res
            })

            resetTagSelection()
            closeNodeEditModal()
            handleNodeMenuClose()
        }

        const handleNodeAddConfirm = () => {
            if (!selectedNodeId) return
            if (graphType === 'directory' && nodeType === 'DETAIL' && isTagSelectionLoading) {
                Toast.warning('标签正在加载，请稍候')
                return
            }
            if (nodeContentType === 'IMAGE' && (!tempFileRef.current || !tempImageSize)) {
                Toast.error('请上传图片后再确认')
                return
            }
            if (!validateRefNodeForCreate()) return

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
                    article:
                        graphType === 'detail' && nodeContentType === 'TEXT'
                            ? isArticleNode
                            : undefined,
                    refDirectoryNodeId:
                        nodeContentType === 'REF_NOTE' ? selectedRefTarget?.id : undefined,
                    refDetailNodeId:
                        nodeContentType === 'REF_DETAIL' || nodeContentType === 'REF_ARTICLE'
                            ? typeof selectedRefDetailTarget?.id === 'number'
                                ? selectedRefDetailTarget.id
                                : undefined
                            : undefined,
                    // directory graph only
                    nodeType,
                    tagIds:
                        graphType === 'directory' &&
                        nodeType === 'DETAIL' &&
                        isTagSelectionReady
                            ? [...selectedTagIds]
                            : undefined,
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
                    article:
                        graphType === 'detail' && nodeContentType === 'TEXT'
                            ? isArticleNode
                            : undefined,
                    refDirectoryNodeId:
                        nodeContentType === 'REF_NOTE' ? selectedRefTarget?.id : undefined,
                    refDetailNodeId:
                        nodeContentType === 'REF_DETAIL' || nodeContentType === 'REF_ARTICLE'
                            ? typeof selectedRefDetailTarget?.id === 'number'
                                ? selectedRefDetailTarget.id
                                : undefined
                            : undefined,
                    // directory graph only
                    nodeType,
                    tagIds:
                        graphType === 'directory' &&
                        nodeType === 'DETAIL' &&
                        isTagSelectionReady
                            ? [...selectedTagIds]
                            : undefined,
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

            clearPendingImage()
            resetTagSelection()
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

        return (
            <PaperContext value={paperContext}>
                <div className="h-full bg-black">
                    <GraphViewer
                        ref={graphViewerRef}
                        nodes={flatTree}
                        panFromNodes={browseMode && !editMode}
                        initialViewport={graphInitialView.viewport}
                        initialCenter={graphInitialView.initialCenter}
                        resetOnMount={graphInitialView.resetOnMount}
                        onViewportChange={setViewport}
                        onViewportCommit={saveActiveViewport}
                        onResetView={handleBeforeResetView}
                    />
                    {noteTitle && (
                        <div
                            className={`fixed flex items-center gap-2 select-none ${
                                isSharedView ? 'top-4 left-4' : 'top-0 left-0'
                            }`}
                        >
                            {!isSharedView && (
                                <>
                                    <button
                                        onClick={() => navigate(-1)}
                                        className="cursor-pointer p-1 text-[#ffffff5c] transition-colors hover:text-white"
                                        title="Go back"
                                    >
                                        <ArrowLeft className="h-6 w-6" strokeWidth={1} />
                                    </button>
                                    <button
                                        onClick={() => navigate('/')}
                                        className="cursor-pointer p-1 text-[#ffffff5c] transition-colors hover:text-white"
                                        title="Go to directory"
                                    >
                                        <Home className="h-6 w-6" strokeWidth={1} />
                                    </button>
                                </>
                            )}
                            <span className="text-[#ffffff5c]">{noteTitle}</span>
                            {graphType === 'detail' && isSharedView && (
                                <NoteTagList tags={noteTags} />
                            )}
                            {graphType === 'detail' && !isSharedView && noteDetail && (
                                <DirectoryTags directoryNodeId={noteDetail.directoryNodeId} />
                            )}
                        </div>
                    )}

                    <div
                            className={`fixed z-30 ${
                                graphType === 'directory'
                                    ? 'top-4 left-4'
                                    : 'top-12 left-4'
                            }`}
                        >
                            <button
                                type="button"
                                onClick={() => setIsRootNodeListOpen((current) => !current)}
                                className={`grid h-10 w-10 cursor-pointer place-items-center rounded-full shadow-lg backdrop-blur-sm transition-colors ${
                                    isRootNodeListOpen
                                        ? 'bg-indigo-500/15 text-indigo-300'
                                        : 'bg-slate-900/60 text-slate-400 hover:bg-slate-800/75 hover:text-indigo-300'
                                }`}
                                title="根节点列表"
                                aria-label="打开根节点列表"
                                aria-expanded={isRootNodeListOpen}
                            >
                                <ListTree className="h-6 w-6" strokeWidth={1} />
                            </button>

                            {isRootNodeListOpen && (
                                <div
                                    className={`absolute top-0 left-full ml-2 flex h-64 flex-col overflow-hidden rounded-xl border border-slate-700/70 bg-slate-950/30 shadow-2xl backdrop-blur-md ${
                                        graphType === 'directory'
                                            ? 'w-[min(16rem,calc(100vw-8rem))]'
                                            : 'w-[min(16rem,calc(100vw-5rem))]'
                                    }`}
                                >
                                    <div className="flex shrink-0 items-center justify-between border-b border-slate-700 px-3 py-2.5">
                                        <span className="text-sm font-medium text-slate-200">
                                            根节点
                                        </span>
                                        <span className="text-xs text-slate-500">
                                            {rootNodes.length} 个
                                        </span>
                                    </div>
                                    <ul className="min-h-0 flex-1 overflow-y-auto p-2">
                                        {rootNodes.map((node) => {
                                            const label = getNodeListLabel(node)

                                            return (
                                                <li key={node.id}>
                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            graphViewerRef.current?.centerOn(
                                                                node.x,
                                                                node.y
                                                            )
                                                        }
                                                        title={label}
                                                        className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm text-slate-300 transition-colors hover:bg-slate-700/70 hover:text-white"
                                                    >
                                                        <span
                                                            className="h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-400"
                                                            aria-hidden="true"
                                                        />
                                                        <span className="min-w-0 flex-1 truncate">
                                                            {label}
                                                        </span>
                                                    </button>
                                                </li>
                                            )
                                        })}
                                    </ul>
                                </div>
                            )}
                    </div>

                    {graphType === 'directory' && (
                        <div className="fixed top-16 left-4 flex flex-col gap-2">
                            <button
                                type="button"
                                onClick={handleOpenProfile}
                                className="grid h-10 w-10 cursor-pointer place-items-center rounded-full bg-slate-900/60 text-slate-400 shadow-lg backdrop-blur-sm transition-colors hover:bg-slate-800/75 hover:text-indigo-300"
                                title="个人资料"
                                aria-label="打开个人资料"
                            >
                                <CircleUserRound className="h-6 w-6" strokeWidth={1} />
                            </button>
                            <button
                                type="button"
                                onClick={() => setIsNotificationOpen(true)}
                                className="grid h-10 w-10 cursor-pointer place-items-center rounded-full bg-slate-900/60 text-slate-400 shadow-lg backdrop-blur-sm transition-colors hover:bg-slate-800/75 hover:text-indigo-300"
                                title="消息通知"
                                aria-label="打开消息通知"
                            >
                                <Bell className="h-6 w-6" strokeWidth={1} />
                            </button>
                            <button
                                type="button"
                                onClick={() => setIsTagManagementOpen(true)}
                                className="grid h-10 w-10 cursor-pointer place-items-center rounded-full bg-slate-900/60 text-slate-400 shadow-lg backdrop-blur-sm transition-colors hover:bg-slate-800/75 hover:text-indigo-300"
                                title="标签管理"
                                aria-label="打开标签管理"
                            >
                                <Tags className="h-6 w-6" strokeWidth={1} />
                            </button>
                            <button
                                type="button"
                                onClick={openExportModal}
                                disabled={isExporting}
                                className="grid h-10 w-10 cursor-pointer place-items-center rounded-full bg-slate-900/60 text-slate-400 shadow-lg backdrop-blur-sm transition-colors hover:bg-slate-800/75 hover:text-indigo-300 disabled:cursor-wait disabled:opacity-60"
                                title={isExporting ? '正在导出' : '导出笔记'}
                                aria-label={isExporting ? '正在导出笔记' : '导出笔记'}
                            >
                                {isExporting ? (
                                    <LoaderCircle className="h-6 w-6 animate-spin" strokeWidth={1} />
                                ) : (
                                    <Download className="h-6 w-6" strokeWidth={1} />
                                )}
                            </button>
                            <button
                                type="button"
                                onClick={handleOpenImport}
                                disabled={isImporting}
                                className="grid h-10 w-10 cursor-pointer place-items-center rounded-full bg-slate-900/60 text-slate-400 shadow-lg backdrop-blur-sm transition-colors hover:bg-slate-800/75 hover:text-indigo-300 disabled:cursor-wait disabled:opacity-60"
                                title={isImporting ? '正在导入' : '导入笔记'}
                                aria-label={isImporting ? '正在导入笔记' : '导入笔记'}
                            >
                                {isImporting ? (
                                    <LoaderCircle className="h-6 w-6 animate-spin" strokeWidth={1} />
                                ) : (
                                    <Upload className="h-6 w-6" strokeWidth={1} />
                                )}
                            </button>
                            <button
                                type="button"
                                onClick={() => setIsTrashBinOpen(true)}
                                className="grid h-10 w-10 cursor-pointer place-items-center rounded-full bg-slate-900/60 text-slate-400 shadow-lg backdrop-blur-sm transition-colors hover:bg-rose-950/60 hover:text-rose-300"
                                title="回收站"
                                aria-label="打开回收站"
                            >
                                <Trash2 className="h-6 w-6" strokeWidth={1} />
                            </button>
                            <button
                                type="button"
                                onClick={handleLogout}
                                className="grid h-10 w-10 cursor-pointer place-items-center rounded-full bg-slate-900/60 text-slate-400 shadow-lg backdrop-blur-sm transition-colors hover:bg-rose-950/60 hover:text-rose-300"
                                title="退出登录"
                                aria-label="退出登录"
                            >
                                <LogOut className="h-6 w-6" strokeWidth={1} />
                            </button>
                        </div>
                    )}

                    {!isChoosingParent && chosenParentNodeId === null && (
                        <div className="fixed top-28 right-2 z-30 flex w-12 flex-col gap-1 rounded-xl border border-slate-700/70 bg-slate-950/30 p-1.5 shadow-2xl backdrop-blur-md sm:right-4 sm:w-44">
                            {!isSaving && (
                                <div>
                                    <Button
                                        glass
                                        className="w-full px-0 py-2.5 sm:justify-start sm:px-3"
                                        onClick={() => {
                                            const newValue = !browseMode
                                            setBrowseMode(newValue)
                                        }}
                                    >
                                        <div className="flex items-center gap-2">
                                            {browseMode ? (
                                                <MousePointer2 className="h-5 w-5 text-indigo-400 sm:h-4 sm:w-4" />
                                            ) : (
                                                <Hand className="h-5 w-5 text-amber-400 sm:h-4 sm:w-4" />
                                            )}
                                            <span className="sr-only sm:not-sr-only">
                                                {browseMode ? 'select mode' : 'browse mode'}
                                            </span>
                                        </div>
                                    </Button>
                                </div>
                            )}

                            {!isSharedView && allowOperate && (
                                <>
                                    {/* search button */}
                                    <div>
                                        <Button
                                            glass
                                            className="w-full px-0 py-2.5 sm:justify-start sm:px-3"
                                            onClick={() => setIsSearchModalOpen(true)}
                                        >
                                            <div className="flex items-center gap-2">
                                                <Search className="h-5 w-5 text-cyan-400 sm:h-4 sm:w-4" />
                                                <span className="sr-only sm:not-sr-only">search</span>
                                            </div>
                                        </Button>
                                    </div>
                                    {/* edit mode */}
                                    {!editMode && (
                                        <Button
                                            glass
                                            className="w-full px-0 py-2.5 sm:justify-start sm:px-3"
                                            type="primary"
                                            onClick={() => setEditMode(true)}
                                        >
                                            <div className="flex items-center gap-2">
                                                <Pencil className="h-5 w-5 text-sky-400 sm:h-4 sm:w-4" />
                                                <span className="sr-only sm:not-sr-only">edit mode</span>
                                            </div>
                                        </Button>
                                    )}

                                    {editMode && (
                                        <>
                                            {!isSaving && (
                                                <div>
                                                    <Button
                                                        glass
                                                        className="w-full px-0 py-2.5 sm:justify-start sm:px-3"
                                                        type="secondary"
                                                        onClick={handleAddNewNode}
                                                    >
                                                        <div className="flex items-center gap-2">
                                                            <Plus className="h-5 w-5 text-emerald-400 sm:h-4 sm:w-4" />
                                                            <span className="sr-only sm:not-sr-only">add new node</span>
                                                        </div>
                                                    </Button>
                                                </div>
                                            )}
                                            <div>
                                                <Button
                                                    glass
                                                    className="w-full px-0 py-2.5 sm:justify-start sm:px-3"
                                                    type="primary"
                                                    onClick={handleSaveEdit}
                                                    disabled={isSaving}
                                                >
                                                    <div className="flex items-center gap-2">
                                                        {isSaving ? (
                                                            <LoaderCircle className="h-5 w-5 animate-spin text-emerald-400 sm:h-4 sm:w-4" />
                                                        ) : (
                                                            <Save className="h-5 w-5 text-emerald-400 sm:h-4 sm:w-4" />
                                                        )}
                                                        <span className="sr-only sm:not-sr-only">
                                                            {isSaving ? 'saving...' : 'save'}
                                                        </span>
                                                    </div>
                                                </Button>
                                            </div>
                                            {!isSaving && (
                                                <div>
                                                    <Button
                                                        glass
                                                        className="w-full px-0 py-2.5 sm:justify-start sm:px-3"
                                                        onClick={handleExitEdit}
                                                    >
                                                        <div className="flex items-center gap-2">
                                                            <X className="h-5 w-5 text-amber-400 sm:h-4 sm:w-4" />
                                                            <span className="sr-only sm:not-sr-only">exit</span>
                                                        </div>
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
                    {!isSharedView && (
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
                            onOpenArticle={handleNodeOpenArticle}
                            onDelete={handleNodeDelete}
                            onClose={handleNodeMenuClose}
                        />
                    )}

                    {/* choosing a parent node */}
                    {isChoosingParent && chosenParentNodeId === null && (
                        <div className="fixed top-10 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-lg border border-slate-700 bg-slate-900/90 px-3 py-2 text-sm text-slate-200 shadow-lg backdrop-blur-sm">
                            <span>please choose a parent node</span>
                            <Button onClick={handleCancelChooseParent}>cancel</Button>
                        </div>
                    )}
                    {chosenParentNodeId !== null && (
                        <div className="fixed top-10 left-1/2 flex -translate-x-1/2 gap-2">
                            <Button onClick={handleCancelChooseParent}>
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
                            footer={
                                <div className="flex items-center gap-3">
                                    <Button
                                        type="secondary"
                                        className="gap-2"
                                        onClick={handleOpenChangePassword}
                                    >
                                        <KeyRound className="h-4 w-4" aria-hidden="true" />
                                        修改密码
                                    </Button>
                                    <Button onClick={closeProfileModal}>关闭</Button>
                                </div>
                            }
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

                        <ChangePasswordModal
                            width={440}
                            header="修改密码"
                            footer={
                                <div className="flex items-center gap-3">
                                    <Button
                                        onClick={handleCancelChangePassword}
                                        disabled={isChangingPassword}
                                    >
                                        取消
                                    </Button>
                                    <Button
                                        type="primary"
                                        onClick={() => void handleChangePasswordConfirm()}
                                        disabled={isChangingPassword}
                                    >
                                        {isChangingPassword ? '正在修改...' : '确认修改'}
                                    </Button>
                                </div>
                            }
                        >
                            <div className="grid gap-5">
                                <label className="grid gap-2">
                                    <span className="text-sm text-slate-300">旧密码</span>
                                    <input
                                        ref={oldPasswordInputRef}
                                        type="password"
                                        autoComplete="current-password"
                                        className="input-base outline-none"
                                        value={oldPassword}
                                        disabled={isChangingPassword}
                                        onChange={(event) => {
                                            setOldPassword(event.target.value)
                                            setChangePasswordError(null)
                                        }}
                                    />
                                </label>
                                <label className="grid gap-2">
                                    <span className="text-sm text-slate-300">新密码</span>
                                    <input
                                        type="password"
                                        autoComplete="new-password"
                                        className="input-base outline-none"
                                        value={newPassword}
                                        disabled={isChangingPassword}
                                        onChange={(event) => {
                                            setNewPassword(event.target.value)
                                            setChangePasswordError(null)
                                        }}
                                    />
                                    <span className="text-xs text-slate-500">
                                        新密码至少需要 8 位
                                    </span>
                                </label>
                                {changePasswordError && (
                                    <p
                                        className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300"
                                        role="alert"
                                    >
                                        {changePasswordError}
                                    </p>
                                )}
                            </div>
                        </ChangePasswordModal>

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

                        <ShareNoteModal
                            width={620}
                            header="分享详情"
                            footer={
                                <div className="flex flex-wrap items-center justify-end gap-2">
                                    <Button
                                        type="primary"
                                        className="gap-2"
                                        disabled={!shareDetail || isUnsharing}
                                        onClick={() => void handleCopyShareLink()}
                                    >
                                        <Copy className="h-4 w-4" aria-hidden="true" />
                                        复制链接
                                    </Button>
                                    <Button
                                        type="danger"
                                        disabled={
                                            !shareDetail ||
                                            shareDetail.status !== 'ACTIVE' ||
                                            isUnsharing
                                        }
                                        onClick={() => void handleUnshareFromDetail()}
                                    >
                                        {isUnsharing ? '正在取消...' : '取消分享'}
                                    </Button>
                                    <Button
                                        onClick={handleCloseShareDetail}
                                        disabled={isUnsharing}
                                    >
                                        关闭
                                    </Button>
                                </div>
                            }
                        >
                            {isShareDetailLoading ? (
                                <div className="flex min-h-40 flex-col items-center justify-center gap-3 text-sm text-slate-400">
                                    <LoaderCircle className="h-6 w-6 animate-spin text-indigo-400" />
                                    正在加载分享详情
                                </div>
                            ) : shareDetailError ? (
                                <div className="flex min-h-40 flex-col items-center justify-center gap-4 text-center">
                                    <p className="text-sm text-rose-400">{shareDetailError}</p>
                                    {shareDetailNodeId !== null && (
                                        <Button
                                            onClick={() =>
                                                void loadShareDetail(shareDetailNodeId)
                                            }
                                        >
                                            重新加载
                                        </Button>
                                    )}
                                </div>
                            ) : shareDetail ? (
                                <div className="space-y-5">
                                    <dl className="grid gap-4 sm:grid-cols-[96px_minmax(0,1fr)] sm:items-start">
                                        <dt className="text-sm text-slate-400">Share Token</dt>
                                        <dd className="break-all font-mono text-sm text-slate-200">
                                            {shareDetail.shareToken}
                                        </dd>
                                        <dt className="text-sm text-slate-400">分享时间</dt>
                                        <dd className="text-sm text-slate-200">
                                            {formatShareTime(shareDetail.updatedAt)}
                                        </dd>
                                    </dl>
                                    <div>
                                        <label
                                            htmlFor="share-note-link"
                                            className="mb-2 block text-sm text-slate-400"
                                        >
                                            分享链接
                                        </label>
                                        <input
                                            id="share-note-link"
                                            type="text"
                                            readOnly
                                            value={shareLink}
                                            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                                            onFocus={(event) => event.currentTarget.select()}
                                        />
                                    </div>
                                    <section aria-labelledby="share-access-logs-title">
                                        <div className="mb-2 flex items-center justify-between gap-3">
                                            <h4
                                                id="share-access-logs-title"
                                                className="text-sm font-medium text-slate-200"
                                            >
                                                访问记录
                                            </h4>
                                            {!isShareAccessLogsLoading && !shareAccessLogsError && (
                                                <span className="text-xs text-slate-500">
                                                    共 {shareAccessLogs.length} 条
                                                </span>
                                            )}
                                        </div>
                                        <div className="h-48 overflow-auto rounded-lg border border-slate-700 bg-slate-950/70">
                                            {isShareAccessLogsLoading ? (
                                                <div className="flex h-full items-center justify-center gap-2 text-sm text-slate-500">
                                                    <LoaderCircle className="h-4 w-4 animate-spin text-indigo-400" />
                                                    正在加载访问记录
                                                </div>
                                            ) : shareAccessLogsError ? (
                                                <div className="flex h-full flex-col items-center justify-center gap-3 px-4 text-center">
                                                    <p className="text-sm text-rose-400">
                                                        {shareAccessLogsError}
                                                    </p>
                                                    <Button
                                                        onClick={() =>
                                                            void loadShareAccessLogs(shareDetail.id)
                                                        }
                                                    >
                                                        重新加载
                                                    </Button>
                                                </div>
                                            ) : shareAccessLogs.length === 0 ? (
                                                <div className="flex h-full items-center justify-center text-sm text-slate-500">
                                                    暂无访问记录
                                                </div>
                                            ) : (
                                                <table className="w-full min-w-[36rem] table-fixed text-left text-sm">
                                                    <thead className="sticky top-0 z-10 bg-slate-900 text-xs text-slate-400">
                                                        <tr>
                                                            <th className="w-28 whitespace-nowrap px-4 py-2 font-medium">
                                                                访问类型
                                                            </th>
                                                            <th className="w-40 whitespace-nowrap px-4 py-2 font-medium">
                                                                目标节点
                                                            </th>
                                                            <th className="w-28 whitespace-nowrap px-4 py-2 font-medium">
                                                                访客
                                                            </th>
                                                            <th className="w-36 whitespace-nowrap px-4 py-2 font-medium">
                                                                访问时间
                                                            </th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-slate-800">
                                                        {shareAccessLogs.map((accessLog) => (
                                                            <tr key={accessLog.id}>
                                                                <td className="whitespace-nowrap px-4 py-3 align-middle">
                                                                    <span className="inline-flex items-center gap-2 text-slate-300">
                                                                        <Eye
                                                                            className="h-4 w-4 shrink-0 text-indigo-300"
                                                                            aria-hidden="true"
                                                                        />
                                                                        {accessLog.target === 'ARTICLE'
                                                                            ? '文章'
                                                                            : '笔记'}
                                                                    </span>
                                                                </td>
                                                                <td
                                                                    className={`truncate px-4 py-3 align-middle ${
                                                                        accessLog.targetLabel === null
                                                                            ? 'text-rose-400'
                                                                            : 'text-slate-300'
                                                                    }`}
                                                                    title={
                                                                        accessLog.targetLabel ??
                                                                        '节点已被删除'
                                                                    }
                                                                >
                                                                    {accessLog.targetLabel ??
                                                                        '节点已被删除'}
                                                                </td>
                                                                <td className="whitespace-nowrap px-4 py-3 align-middle">
                                                                    <span
                                                                        className="inline-block rounded bg-slate-800 px-2 py-1 font-mono text-xs text-slate-400"
                                                                        title={
                                                                            accessLog.visitorId ??
                                                                            '未知访客'
                                                                        }
                                                                    >
                                                                        {accessLog.visitorId
                                                                            ? accessLog.visitorId.slice(
                                                                                  0,
                                                                                  8
                                                                              )
                                                                            : '未知'}
                                                                    </span>
                                                                </td>
                                                                <td className="whitespace-nowrap px-4 py-3 align-middle">
                                                                    <time
                                                                        dateTime={accessLog.createdAt}
                                                                        className="text-xs text-slate-500"
                                                                    >
                                                                        {formatShareTime(
                                                                            accessLog.createdAt
                                                                        )}
                                                                    </time>
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            )}
                                        </div>
                                    </section>
                                </div>
                            ) : (
                                <div className="min-h-40" />
                            )}
                        </ShareNoteModal>

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

                        <ArticleModal
                            width={900}
                            header={articleModalMode === 'edit' ? '编辑文章' : '查看文章'}
                            closeOnClickMask={!isArticleSaving}
                            footer={
                                <div className="flex items-center gap-3">
                                    <Button
                                        onClick={handleCloseArticle}
                                        disabled={isArticleSaving}
                                    >
                                        关闭
                                    </Button>
                                    {articleModalMode === 'edit' && (
                                        <Button
                                            type="primary"
                                            onClick={() => void handleSaveArticle()}
                                            disabled={!article || isArticleLoading || isArticleSaving}
                                        >
                                            {isArticleSaving ? '正在保存...' : '保存文章'}
                                        </Button>
                                    )}
                                </div>
                            }
                        >
                            {isArticleLoading ? (
                                <div className="flex min-h-80 flex-col items-center justify-center gap-3 text-sm text-slate-400">
                                    <LoaderCircle className="h-6 w-6 animate-spin text-cyan-400" />
                                    正在加载文章
                                </div>
                            ) : articleError ? (
                                <div className="flex min-h-80 flex-col items-center justify-center gap-4 text-center">
                                    <p className="text-sm text-rose-400">{articleError}</p>
                                    {articleDetailNodeId !== null && (
                                        <Button
                                            onClick={() => void loadArticle(articleDetailNodeId)}
                                        >
                                            重新加载
                                        </Button>
                                    )}
                                </div>
                            ) : article && articleModalMode === 'edit' ? (
                                <label className="block">
                                    <span className="mb-2 flex items-center gap-2 text-sm text-slate-400">
                                        <FileText className="h-4 w-4 text-cyan-400" />
                                        正文
                                    </span>
                                    <textarea
                                        className="bg-textarea min-h-96 w-full resize-y overflow-x-auto whitespace-pre [overflow-wrap:normal] rounded-lg border border-slate-700/70 p-4 leading-7 text-slate-100 outline-none! transition-colors focus:border-cyan-500/60 focus:ring-2 focus:ring-cyan-500/15"
                                        wrap="off"
                                        value={articleContent}
                                        onChange={(event) => setArticleContent(event.target.value)}
                                        onKeyDown={handleArticleTextareaKeyDown}
                                        disabled={isArticleSaving}
                                        placeholder="开始编写文章内容..."
                                        spellCheck={false}
                                    />
                                </label>
                            ) : article ? (
                                <article className="min-h-96 overflow-x-auto whitespace-pre [overflow-wrap:normal] rounded-lg border border-slate-700 bg-slate-950/60 p-5 leading-7 text-slate-200">
                                    {article.content || (
                                        <span className="text-slate-500">暂无文章内容</span>
                                    )}
                                </article>
                            ) : (
                                <div className="min-h-80" />
                            )}
                        </ArticleModal>

                        <NewNodeAddModal
                            width={800}
                            header="添加新结点"
                            footer={
                                <div className="flex items-center gap-4">
                                    {graphType === 'directory' && (
                                        <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-700/60 bg-black/20 px-3 py-2 text-sm text-slate-300 transition-colors hover:bg-white/5 hover:text-slate-100">
                                            <input
                                                type="checkbox"
                                                checked={nodeType === 'DETAIL'}
                                                onChange={(e) => handleDirectoryNodeTypeChange(e.target.checked)}
                                                className="h-4 w-4 cursor-pointer accent-indigo-500"
                                            />
                                            <span>detail node</span>
                                        </label>
                                    )}
                                    <Button
                                        onClick={() => {
                                            clearPendingImage()
                                            resetTagSelection()
                                            closeNewNodeAddModal()
                                        }}
                                    >
                                        取消
                                    </Button>
                                    <Button type="primary" onClick={handleNewNodeAddConfirm}>
                                        确认
                                    </Button>
                                </div>
                            }
                        >
                            <div onPaste={handleImagePaste}>
                                {renderNodeCreationTypeControls()}
                                <div>
                                    {nodeContentType !== 'IMAGE' ? (
                                        <textarea
                                            ref={newNodeAddModalInputRef}
                                            className={NODE_TEXTAREA_CLASS_NAME}
                                            wrap="off"
                                            rows={6}
                                            maxLength={NODE_LABEL_MAX_LENGTH}
                                            value={nodeEditContent}
                                            onChange={handleNodeEditContentChange}
                                            onKeyDown={handleNodeTextareaKeyDown}
                                        />
                                    ) : (
                                        renderImageInput()
                                    )}
                                </div>
                                {renderRefTargetSelection()}
                                {graphType === 'directory' && nodeType === 'DETAIL' && (
                                    <TagCheckboxGroup
                                        tags={selectableTags}
                                        selectedTagIds={selectedTagIds}
                                        isLoading={isTagSelectionLoading}
                                        error={tagSelectionError}
                                        onToggle={toggleSelectedTag}
                                        onRetry={() => void loadTagSelection()}
                                    />
                                )}
                            </div>
                        </NewNodeAddModal>

                        <NodeEditModal
                            width={800}
                            header="编辑结点"
                            footer={
                                <div className="flex items-center gap-4">
                                    <Button
                                        onClick={() => {
                                            resetTagSelection()
                                            closeNodeEditModal()
                                        }}
                                    >
                                        取消
                                    </Button>
                                    <Button type="primary" onClick={handleNodeEditConfirm}>
                                        确认
                                    </Button>
                                </div>
                            }
                        >
                            {selectedNode?.contentType !== 'IMAGE' && (
                                <textarea
                                    ref={nodeEditModalInputRef}
                                    className={NODE_TEXTAREA_CLASS_NAME}
                                    wrap="off"
                                    rows={6}
                                    maxLength={NODE_LABEL_MAX_LENGTH}
                                    value={nodeEditContent}
                                    onChange={handleNodeEditContentChange}
                                    onKeyDown={handleNodeTextareaKeyDown}
                                />
                            )}

                            {graphType === 'directory' && selectedNode?.nodeType === 'DETAIL' && (
                                <TagCheckboxGroup
                                    tags={selectableTags}
                                    selectedTagIds={selectedTagIds}
                                    isLoading={isTagSelectionLoading}
                                    error={tagSelectionError}
                                    onToggle={toggleSelectedTag}
                                    onRetry={() =>
                                        void loadTagSelection(
                                            typeof selectedNode.id === 'number'
                                                ? selectedNode.id
                                                : undefined,
                                            selectedNode.tagIds ?? []
                                        )
                                    }
                                />
                            )}

                        </NodeEditModal>

                        <NodeAddModal
                            width={800}
                            header="添加子结点"
                            footer={
                                <div className="flex items-center gap-4">
                                    {graphType === 'directory' && (
                                        <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-700/60 bg-black/20 px-3 py-2 text-sm text-slate-300 transition-colors hover:bg-white/5 hover:text-slate-100">
                                            <input
                                                type="checkbox"
                                                checked={nodeType === 'DETAIL'}
                                                onChange={(e) => handleDirectoryNodeTypeChange(e.target.checked)}
                                                className="h-4 w-4 cursor-pointer accent-indigo-500"
                                            />
                                            <span>detail node</span>
                                        </label>
                                    )}
                                    <Button
                                        onClick={() => {
                                            clearPendingImage()
                                            resetTagSelection()
                                            closeNodeAddModal()
                                        }}
                                    >
                                        取消
                                    </Button>
                                    <Button type="primary" onClick={handleNodeAddConfirm}>
                                        确认
                                    </Button>
                                </div>
                            }
                        >
                            <div onPaste={handleImagePaste}>
                                {renderNodeCreationTypeControls()}
                                <div>
                                    {nodeContentType !== 'IMAGE' ? (
                                        <textarea
                                            ref={nodeAddModalInputRef}
                                            className={NODE_TEXTAREA_CLASS_NAME}
                                            wrap="off"
                                            rows={6}
                                            maxLength={NODE_LABEL_MAX_LENGTH}
                                            value={nodeEditContent}
                                            onChange={handleNodeEditContentChange}
                                            onKeyDown={handleNodeTextareaKeyDown}
                                        />
                                    ) : (
                                        renderImageInput()
                                    )}
                                </div>
                                {renderRefTargetSelection()}
                                {graphType === 'directory' && nodeType === 'DETAIL' && (
                                    <TagCheckboxGroup
                                        tags={selectableTags}
                                        selectedTagIds={selectedTagIds}
                                        isLoading={isTagSelectionLoading}
                                        error={tagSelectionError}
                                        onToggle={toggleSelectedTag}
                                        onRetry={() => void loadTagSelection()}
                                    />
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
                            excludeNoteId={
                                graphType === 'detail' ? noteDetail?.directoryNodeId : undefined
                            }
                            onSelectNote={(note: Note) =>
                                navigate(`/noteDetails/${note.id}`, {
                                    state: { resetView: true },
                                })
                            }
                        />
                        <TrashBinModal
                            isOpen={isTrashBinOpen}
                            onClose={() => setIsTrashBinOpen(false)}
                            onRestored={onExitEdit}
                        />
                        <NotificationModal
                            isOpen={isNotificationOpen}
                            onClose={() => setIsNotificationOpen(false)}
                        />
                        <TagManagementModal
                            isOpen={isTagManagementOpen}
                            onClose={() => setIsTagManagementOpen(false)}
                        />
                        {isRefSearchOpen && (
                            <SearchModal
                                isOpen={isRefSearchOpen}
                                onClose={() => setIsRefSearchOpen(false)}
                                onSelectNote={(note) => {
                                    setSelectedRefTarget(note)
                                    setSelectedRefDetailTarget(null)
                                    setIsRefSearchOpen(false)
                                    if (refTargetType !== 'NOTE') {
                                        setIsRefNodePickerOpen(true)
                                    }
                                }}
                                mode="select"
                                selectionPurpose={
                                    refTargetType === 'NOTE' ? 'reference' : 'reference-node'
                                }
                                excludeNoteId={
                                    refTargetType === 'NOTE'
                                        ? noteDetail?.directoryNodeId
                                        : undefined
                                }
                            />
                        )}
                        <DetailNodePickerModal
                            isOpen={isRefNodePickerOpen}
                            directory={selectedRefTarget}
                            targetType={refTargetType === 'ARTICLE' ? 'ARTICLE' : 'DETAIL'}
                            onClose={() => {
                                setIsRefNodePickerOpen(false)
                                setSelectedRefTarget(null)
                                setSelectedRefDetailTarget(null)
                            }}
                            onConfirm={(node) => {
                                setSelectedRefDetailTarget(node)
                                setIsRefNodePickerOpen(false)
                            }}
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
                            />
                        )}
                    </>
                </div>
            </PaperContext>
        )
    }
)

export default NoteGraph

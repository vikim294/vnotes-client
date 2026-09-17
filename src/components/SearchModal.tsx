import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
    CalendarDays,
    ChevronLeft,
    ChevronRight,
    Clock3,
    FileText,
    Folder,
    LoaderCircle,
    RotateCcw,
    Search,
    Share2,
    SlidersHorizontal,
    Tag as TagIcon,
    X,
} from 'lucide-react'
import {
    getNoteSearchHistory,
    getTags,
    searchDirectoryNodes,
    type Note,
    type NoteSearchHistory,
    type PageResponse,
    type Tag,
} from '../api'
import type { NodeType } from '../types'
import TagCheckboxGroup from './TagCheckboxGroup'

interface SearchModalProps {
    isOpen: boolean
    onClose: () => void
    onSelectNote: (note: Note) => void
    mode?: 'navigate' | 'select'
    selectionPurpose?: 'move' | 'reference' | 'reference-node'
    excludeNoteId?: number
}

const PAGE_SIZE = 10

const EMPTY_PAGE: PageResponse<Note> = {
    list: [],
    page: 1,
    pageSize: PAGE_SIZE,
    total: 0,
}

const getPageItems = (currentPage: number, totalPages: number) => {
    if (totalPages <= 7) {
        return Array.from({ length: totalPages }, (_, index) => index + 1)
    }

    const items: Array<number | 'ellipsis-start' | 'ellipsis-end'> = [1]
    const start = Math.max(2, currentPage - 1)
    const end = Math.min(totalPages - 1, currentPage + 1)

    if (start > 2) items.push('ellipsis-start')
    for (let page = start; page <= end; page += 1) items.push(page)
    if (end < totalPages - 1) items.push('ellipsis-end')
    items.push(totalPages)

    return items
}

export default function SearchModal({
    isOpen,
    onClose,
    onSelectNote,
    mode = 'navigate',
    selectionPurpose = 'move',
    excludeNoteId,
}: SearchModalProps) {
    const [query, setQuery] = useState('')
    const [submittedQuery, setSubmittedQuery] = useState('')
    const [searchRequestKey, setSearchRequestKey] = useState(0)
    const [nodeType, setNodeType] = useState<NodeType | ''>(
        mode === 'select' ? 'DETAIL' : ''
    )
    const [startDate, setStartDate] = useState('')
    const [endDate, setEndDate] = useState('')
    const [tags, setTags] = useState<Tag[]>([])
    const [selectedTagIds, setSelectedTagIds] = useState<number[]>([])
    const [isTagsLoading, setIsTagsLoading] = useState(false)
    const [tagsError, setTagsError] = useState<string | null>(null)
    const [tagsRefreshKey, setTagsRefreshKey] = useState(0)
    const [page, setPage] = useState(1)
    const [result, setResult] = useState<PageResponse<Note>>(EMPTY_PAGE)
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [searchHistory, setSearchHistory] = useState<NoteSearchHistory[]>([])
    const [isHistoryLoading, setIsHistoryLoading] = useState(false)
    const [historyError, setHistoryError] = useState<string | null>(null)
    const inputRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        if (!isOpen) return

        const controller = new AbortController()
        const timer = window.setTimeout(() => {
            setIsHistoryLoading(true)
            setHistoryError(null)

            void getNoteSearchHistory(controller.signal)
                .then(setSearchHistory)
                .catch((requestError: unknown) => {
                    if (
                        requestError instanceof DOMException &&
                        requestError.name === 'AbortError'
                    ) {
                        return
                    }

                    setSearchHistory([])
                    setHistoryError(
                        requestError instanceof Error
                            ? requestError.message
                            : '搜索历史加载失败'
                    )
                })
                .finally(() => {
                    if (!controller.signal.aborted) setIsHistoryLoading(false)
                })
        }, 0)

        return () => {
            window.clearTimeout(timer)
            controller.abort()
        }
    }, [isOpen])

    useEffect(() => {
        if (!isOpen) return

        const controller = new AbortController()
        const timer = window.setTimeout(() => {
            setIsTagsLoading(true)
            setTagsError(null)

            void getTags(controller.signal)
                .then(setTags)
                .catch((requestError: unknown) => {
                    if (
                        requestError instanceof DOMException &&
                        requestError.name === 'AbortError'
                    ) {
                        return
                    }

                    setTags([])
                    setTagsError(
                        requestError instanceof Error
                            ? requestError.message
                            : '标签列表加载失败'
                    )
                })
                .finally(() => {
                    if (!controller.signal.aborted) setIsTagsLoading(false)
                })
        }, 0)

        return () => {
            window.clearTimeout(timer)
            controller.abort()
        }
    }, [isOpen, tagsRefreshKey])

    useEffect(() => {
        if (!isOpen) return

        const controller = new AbortController()
        const timer = window.setTimeout(() => {
            setIsLoading(true)
            setError(null)

            void searchDirectoryNodes(
                {
                    keyword: submittedQuery,
                    nodeType: mode === 'select' ? 'DETAIL' : nodeType || undefined,
                    tagIds: selectedTagIds.length > 0 ? selectedTagIds : undefined,
                    startTime: startDate ? `${startDate}T00:00:00` : undefined,
                    endTime: endDate ? `${endDate}T23:59:59` : undefined,
                    page,
                    pageSize: PAGE_SIZE,
                },
                controller.signal
            )
                .then((data) => setResult(data))
                .catch((requestError: unknown) => {
                    if (
                        requestError instanceof DOMException &&
                        requestError.name === 'AbortError'
                    ) {
                        return
                    }
                    setResult(EMPTY_PAGE)
                    setError(requestError instanceof Error ? requestError.message : '搜索失败')
                })
                .finally(() => {
                    if (!controller.signal.aborted) setIsLoading(false)
                })
        }, 0)

        return () => {
            window.clearTimeout(timer)
            controller.abort()
        }
    }, [endDate, isOpen, mode, nodeType, page, searchRequestKey, selectedTagIds, startDate, submittedQuery])

    useEffect(() => {
        if (!isOpen) return
        window.setTimeout(() => inputRef.current?.focus(), 0)
    }, [isOpen])

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape' && isOpen) onClose()
        }
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [isOpen, onClose])

    const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize))
    const pageItems = getPageItems(page, totalPages)
    const activeFilterCount =
        (mode !== 'select' && nodeType ? 1 : 0) +
        (selectedTagIds.length > 0 ? 1 : 0) +
        (startDate ? 1 : 0) +
        (endDate ? 1 : 0)

    const resetPage = () => setPage(1)

    const resetFilters = () => {
        setNodeType(mode === 'select' ? 'DETAIL' : '')
        setSelectedTagIds([])
        setStartDate('')
        setEndDate('')
        resetPage()
    }

    const handleClose = () => {
        setQuery('')
        setSubmittedQuery('')
        setNodeType(mode === 'select' ? 'DETAIL' : '')
        setSelectedTagIds([])
        setStartDate('')
        setEndDate('')
        setPage(1)
        setResult(EMPTY_PAGE)
        setError(null)
        setSearchHistory([])
        setHistoryError(null)
        onClose()
    }

    const handleSearch = () => {
        setSubmittedQuery(query.trim())
        setPage(1)
        setSearchRequestKey((current) => current + 1)
    }

    const handleSelectNote = (note: Note) => {
        onSelectNote(note)
        if (mode !== 'select') handleClose()
    }

    if (!isOpen) return null

    return createPortal(
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 px-4"
            onPointerDown={handleClose}
        >
            <div
                className="bg-surface-900 border-surface-700 max-h-[90vh] w-full max-w-3xl overflow-hidden rounded-xl border shadow-2xl"
                onPointerDown={(event) => event.stopPropagation()}
            >
                <div className='max-h-[35vh] overflow-auto'>
                    <div className="border-surface-700 border-b bg-gradient-to-b from-slate-800/55 to-slate-900/20 px-5 pt-5 pb-4">
                        <div className="mb-4 flex items-start justify-between gap-4">
                            <div>
                                <h2 className="text-lg font-semibold tracking-tight text-slate-100">
                                    {mode === 'select'
                                        ? selectionPurpose === 'reference-node'
                                            ? '选择目标目录'
                                            : '选择目标笔记'
                                        : '搜索笔记'}
                                </h2>
                                <p className="mt-1 text-xs text-slate-500">
                                    {mode === 'select'
                                        ? selectionPurpose === 'reference-node'
                                            ? '先选择一个带详情的目录节点，再从详情画布中选择引用目标'
                                            : selectionPurpose === 'reference'
                                            ? '查找并选择一个带详情的目录节点作为引用目标'
                                            : '查找并选择一个详情节点作为移动目标'
                                        : '按名称、节点类型或创建日期查找内容'}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={handleClose}
                                className="cursor-pointer rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-700/70 hover:text-slate-100"
                                aria-label="关闭搜索"
                            >
                                <X className="h-5 w-5" />
                            </button>
                        </div>

                        <form
                            className="flex h-12 items-center gap-3 rounded-xl border border-slate-600/80 bg-slate-950/55 pl-4 pr-1.5 shadow-inner transition-colors focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-500/15"
                            onSubmit={(event) => {
                                event.preventDefault()
                                handleSearch()
                            }}
                        >
                            <Search className="h-5 w-5 shrink-0 text-indigo-400" />
                            <input
                                ref={inputRef}
                                type="input"
                                value={query}
                                onChange={(event) => {
                                    setQuery(event.target.value)
                                    resetPage()
                                }}
                                placeholder={
                                    mode === 'select'
                                        ? selectionPurpose === 'reference-node'
                                            ? '输入目标目录名称…'
                                            : '输入目标笔记名称…'
                                        : '输入节点名称…'
                                }
                                className="min-w-0 flex-1 bg-transparent text-sm text-slate-100 outline-none! placeholder:text-slate-500"
                            />
                            {query && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        setQuery('')
                                        resetPage()
                                        inputRef.current?.focus()
                                    }}
                                    className="cursor-pointer rounded-full bg-slate-700/70 p-1 text-slate-400 transition-colors hover:bg-slate-600 hover:text-white"
                                    aria-label="清空搜索内容"
                                >
                                    <X className="h-3.5 w-3.5" />
                                </button>
                            )}
                            <button
                                type="submit"
                                disabled={isLoading}
                                className="h-9 shrink-0 cursor-pointer rounded-lg bg-indigo-600 px-4 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                搜索
                            </button>
                        </form>

                        {(isHistoryLoading || historyError || searchHistory.length > 0) && (
                            <div className="mt-3 flex items-start gap-2">
                                <span className="flex h-7 shrink-0 items-center gap-1.5 text-xs text-slate-500">
                                    <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
                                    搜索历史
                                </span>
                                {isHistoryLoading ? (
                                    <span className="flex h-7 items-center text-xs text-slate-500">
                                        <LoaderCircle
                                            className="mr-1.5 h-3.5 w-3.5 animate-spin"
                                            aria-hidden="true"
                                        />
                                        加载中
                                    </span>
                                ) : historyError ? (
                                    <span className="flex h-7 items-center text-xs text-rose-400">
                                        {historyError}
                                    </span>
                                ) : (
                                    <div className="flex flex-wrap gap-2">
                                        {searchHistory.map((history) => (
                                            <button
                                                key={history.id}
                                                type="button"
                                                onClick={() => {
                                                    setQuery(history.keyword)
                                                    resetPage()
                                                    inputRef.current?.focus()
                                                }}
                                                title={history.keyword}
                                                className="max-w-48 cursor-pointer truncate rounded-md border border-slate-700 bg-slate-800/80 px-2.5 py-1 text-xs text-slate-300 transition-colors hover:border-indigo-500/60 hover:bg-indigo-500/10 hover:text-indigo-200"
                                            >
                                                {history.keyword}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    <div className="bg-slate-900/45 px-5 py-4">
                        <div className="mb-3 flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2 text-xs font-medium text-slate-300">
                                <SlidersHorizontal className="h-4 w-4 text-slate-500" />
                                筛选条件
                                {activeFilterCount > 0 && (
                                    <span className="grid h-5 min-w-5 place-items-center rounded-full bg-indigo-500/15 px-1.5 text-[11px] text-indigo-300">
                                        {activeFilterCount}
                                    </span>
                                )}
                            </div>
                            {activeFilterCount > 0 && (
                                <button
                                    type="button"
                                    onClick={resetFilters}
                                    className="flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 text-xs text-slate-400 transition-colors hover:bg-slate-700/60 hover:text-slate-200"
                                >
                                    <RotateCcw className="h-3.5 w-3.5" />
                                    重置筛选
                                </button>
                            )}
                        </div>

                        <div className="grid gap-3 sm:grid-cols-[160px_1fr_1fr]">
                            <label className="grid gap-1.5 text-xs text-slate-400">
                                节点类型
                                <select
                                    value={mode === 'select' ? 'DETAIL' : nodeType}
                                    disabled={mode === 'select'}
                                    onChange={(event) => {
                                        setNodeType(event.target.value as NodeType | '')
                                        resetPage()
                                    }}
                                    className="h-10 rounded-lg border border-slate-700 bg-slate-800 px-3 text-sm text-slate-200 outline-none transition-colors focus:border-indigo-500 disabled:cursor-not-allowed disabled:opacity-65"
                                >
                                    {mode !== 'select' && <option value="">全部类型</option>}
                                    <option value="DIRECTORY">目录</option>
                                    <option value="DETAIL">详情</option>
                                </select>
                            </label>

                            <label className="grid gap-1.5 text-xs text-slate-400">
                                <span className="flex items-center gap-1.5">
                                    <CalendarDays className="h-3.5 w-3.5" /> 起始日期
                                </span>
                                <input
                                    type="date"
                                    value={startDate}
                                    max={endDate || undefined}
                                    onChange={(event) => {
                                        setStartDate(event.target.value)
                                        resetPage()
                                    }}
                                    className="h-10 rounded-lg border border-slate-700 bg-slate-800 px-3 text-sm text-slate-200 outline-none transition-colors focus:border-indigo-500"
                                />
                            </label>

                            <label className="grid gap-1.5 text-xs text-slate-400">
                                <span className="flex items-center gap-1.5">
                                    <CalendarDays className="h-3.5 w-3.5" /> 结束日期
                                </span>
                                <input
                                    type="date"
                                    value={endDate}
                                    min={startDate || undefined}
                                    onChange={(event) => {
                                        setEndDate(event.target.value)
                                        resetPage()
                                    }}
                                    className="h-10 rounded-lg border border-slate-700 bg-slate-800 px-3 text-sm text-slate-200 outline-none transition-colors focus:border-indigo-500"
                                />
                            </label>
                        </div>

                        <TagCheckboxGroup
                            tags={tags}
                            selectedTagIds={selectedTagIds}
                            isLoading={isTagsLoading}
                            error={tagsError}
                            onToggle={(tagId) => {
                                setSelectedTagIds((current) =>
                                    current.includes(tagId)
                                        ? current.filter((id) => id !== tagId)
                                        : [...current, tagId]
                                )
                                resetPage()
                            }}
                            onRetry={() => setTagsRefreshKey((current) => current + 1)}
                        />
                    </div>
                </div>

                <div className='border-surface-700 border-t'></div>

                <div className='max-h-[55vh] overflow-auto relative'>
                    <div className="">
                        {isLoading ? (
                            <div className="flex min-h-64 flex-col items-center justify-center gap-3 text-sm text-slate-500">
                                <LoaderCircle className="h-6 w-6 animate-spin text-indigo-400" />
                                正在搜索
                            </div>
                        ) : error ? (
                            <div className="flex min-h-64 items-center justify-center px-4 text-center text-sm text-rose-400">
                                {error}
                            </div>
                        ) : result.list.length === 0 ? (
                            <div className="flex min-h-64 items-center justify-center px-4 text-center text-sm text-slate-500">
                                没有找到符合条件的节点
                            </div>
                        ) : (
                            <ul className="divide-surface-700 divide-y">
                                {result.list.map((note) => {
                                    const isCurrentNote = note.id === excludeNoteId

                                    return (
                                    <li key={note.id}>
                                        <div className="flex w-full items-center gap-3 px-5 py-3.5 text-left text-slate-200">
                                            {note.nodeType === 'DETAIL' ? (
                                                <FileText className="h-4 w-4 shrink-0 text-emerald-400" />
                                            ) : (
                                                <Folder className="h-4 w-4 shrink-0 text-blue-400" />
                                            )}
                                            <span className="min-w-0 flex-1">
                                                <span className="block truncate text-sm">{note.label}</span>
                                                <span className="mt-0.5 block text-xs text-slate-500">
                                                    {new Date(note.createdAt).toLocaleDateString('zh-CN')}
                                                </span>
                                                {note.tags && note.tags.length > 0 && (
                                                    <span className="mt-2 flex flex-wrap gap-1.5">
                                                        {note.tags.map((tag) => (
                                                            <span
                                                                key={tag.id}
                                                                title={tag.name}
                                                                className="inline-flex max-w-36 items-center gap-1 rounded-full border border-indigo-400/20 bg-indigo-500/10 px-2 py-0.5 text-xs text-indigo-200/80"
                                                            >
                                                                <TagIcon className="h-3 w-3 shrink-0" aria-hidden="true" />
                                                                <span className="truncate">{tag.name}</span>
                                                            </span>
                                                        ))}
                                                    </span>
                                                )}
                                            </span>
                                            <span
                                                className={`rounded-full px-2 py-0.5 text-xs ${
                                                    note.nodeType === 'DETAIL'
                                                        ? 'bg-emerald-500/10 text-emerald-400'
                                                        : 'bg-blue-500/10 text-blue-400'
                                                }`}
                                            >
                                                {note.nodeType === 'DETAIL' ? '详情' : '目录'}
                                            </span>
                                            {note.shared && (
                                                <span
                                                    className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-2 py-0.5 text-xs text-blue-300"
                                                    title="这篇笔记已分享"
                                                >
                                                    <Share2 className="h-3 w-3" aria-hidden="true" />
                                                    已分享
                                                </span>
                                            )}
                                            {note.nodeType === 'DETAIL' && (
                                                <button
                                                    type="button"
                                                    disabled={isCurrentNote}
                                                    onClick={() => handleSelectNote(note)}
                                                    title={isCurrentNote ? '当前正在查看的笔记' : undefined}
                                                    className="cursor-pointer rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
                                                >
                                                    {isCurrentNote
                                                        ? '当前笔记'
                                                        : mode === 'select'
                                                          ? '选择'
                                                          : '进入'}
                                                </button>
                                            )}
                                        </div>
                                    </li>
                                    )
                                })}
                            </ul>
                        )}
                    </div>

                    <div className="sticky left-0 right-0 bottom-0 border-surface-700 flex flex-col gap-3 border-t bg-black px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-xs text-slate-400">
                            共 <span className="font-medium text-slate-200">{result.total}</span> 条，
                            第 <span className="font-medium text-slate-200">{page}</span> / {totalPages} 页
                        </p>

                        <nav className="flex items-center gap-1" aria-label="搜索结果分页">
                            <button
                                type="button"
                                disabled={page <= 1 || isLoading}
                                onClick={() => setPage((current) => Math.max(1, current - 1))}
                                className="flex h-8 cursor-pointer items-center gap-1 rounded-md border border-slate-700 px-2 text-xs text-slate-300 transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                                <ChevronLeft className="h-3.5 w-3.5" /> 上一页
                            </button>

                            {pageItems.map((item) =>
                                typeof item === 'number' ? (
                                    <button
                                        key={item}
                                        type="button"
                                        disabled={isLoading}
                                        onClick={() => setPage(item)}
                                        aria-current={item === page ? 'page' : undefined}
                                        className={`h-8 min-w-8 cursor-pointer rounded-md px-2 text-xs transition-colors disabled:cursor-not-allowed ${
                                            item === page
                                                ? 'bg-indigo-600 text-white'
                                                : 'border border-slate-700 text-slate-300 hover:bg-slate-700'
                                        }`}
                                    >
                                        {item}
                                    </button>
                                ) : (
                                    <span key={item} className="px-1 text-xs text-slate-500">
                                        …
                                    </span>
                                )
                            )}

                            <button
                                type="button"
                                disabled={page >= totalPages || isLoading}
                                onClick={() =>
                                    setPage((current) => Math.min(totalPages, current + 1))
                                }
                                className="flex h-8 cursor-pointer items-center gap-1 rounded-md border border-slate-700 px-2 text-xs text-slate-300 transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                                下一页 <ChevronRight className="h-3.5 w-3.5" />
                            </button>
                        </nav>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    )
}

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
    SlidersHorizontal,
    Trash2,
    Undo2,
    X,
} from 'lucide-react'
import {
    permanentlyDeleteTrashBinNodes,
    restoreTrashBinNodes,
    searchTrashBinNodes,
    type PageResponse,
    type TrashBinDirectoryNode,
} from '../api'
import type { NodeType } from '../types'
import { Toast } from './Toast'

interface TrashBinModalProps {
    isOpen: boolean
    onClose: () => void
    onRestored: () => void
}

const PAGE_SIZE = 10

const EMPTY_PAGE: PageResponse<TrashBinDirectoryNode> = {
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

const formatDeletedAt = (value: string) => {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return value

    return date.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    })
}

const getExclusiveEndTime = (dateValue: string) => {
    const date = new Date(`${dateValue}T00:00:00`)
    date.setDate(date.getDate() + 1)

    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}T00:00:00`
}

export default function TrashBinModal({
    isOpen,
    onClose,
    onRestored,
}: TrashBinModalProps) {
    const [query, setQuery] = useState('')
    const [debouncedQuery, setDebouncedQuery] = useState('')
    const [nodeType, setNodeType] = useState<NodeType | ''>('')
    const [startDate, setStartDate] = useState('')
    const [endDate, setEndDate] = useState('')
    const [page, setPage] = useState(1)
    const [result, setResult] = useState<PageResponse<TrashBinDirectoryNode>>(EMPTY_PAGE)
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [selectedIds, setSelectedIds] = useState<Set<number>>(() => new Set())
    const [isRestoring, setIsRestoring] = useState(false)
    const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false)
    const [isDeleting, setIsDeleting] = useState(false)
    const [refreshKey, setRefreshKey] = useState(0)
    const inputRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        if (!isOpen) return
        const timer = window.setTimeout(() => setDebouncedQuery(query), 250)
        return () => window.clearTimeout(timer)
    }, [isOpen, query])

    useEffect(() => {
        if (!isOpen) return

        const controller = new AbortController()
        const timer = window.setTimeout(() => {
            setIsLoading(true)
            setError(null)

            void searchTrashBinNodes(
                {
                    keyword: debouncedQuery,
                    nodeType: nodeType || undefined,
                    startTime: startDate ? `${startDate}T00:00:00` : undefined,
                    endTime: endDate ? getExclusiveEndTime(endDate) : undefined,
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
                    setError(
                        requestError instanceof Error
                            ? requestError.message
                            : '回收站加载失败'
                    )
                })
                .finally(() => {
                    if (!controller.signal.aborted) setIsLoading(false)
                })
        }, 0)

        return () => {
            window.clearTimeout(timer)
            controller.abort()
        }
    }, [debouncedQuery, endDate, isOpen, nodeType, page, refreshKey, startDate])

    useEffect(() => {
        if (!isOpen) return
        window.setTimeout(() => inputRef.current?.focus(), 0)
    }, [isOpen])

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key !== 'Escape' || !isOpen || isRestoring || isDeleting) return
            if (isDeleteConfirmOpen) setIsDeleteConfirmOpen(false)
            else onClose()
        }
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [isDeleteConfirmOpen, isDeleting, isOpen, isRestoring, onClose])

    const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize))
    const pageItems = getPageItems(page, totalPages)
    const activeFilterCount = (nodeType ? 1 : 0) + (startDate ? 1 : 0) + (endDate ? 1 : 0)
    const currentPageIds = result.list.map((node) => node.id)
    const isCurrentPageSelected =
        currentPageIds.length > 0 && currentPageIds.every((id) => selectedIds.has(id))
    const isMutating = isRestoring || isDeleting

    const resetPage = () => setPage(1)

    const clearSelection = () => setSelectedIds(new Set())

    const resetFilters = () => {
        setNodeType('')
        setStartDate('')
        setEndDate('')
        clearSelection()
        resetPage()
    }

    const handleClose = () => {
        if (isMutating || isDeleteConfirmOpen) return
        setQuery('')
        setDebouncedQuery('')
        setNodeType('')
        setStartDate('')
        setEndDate('')
        setPage(1)
        setResult(EMPTY_PAGE)
        setError(null)
        setIsDeleteConfirmOpen(false)
        clearSelection()
        onClose()
    }

    const toggleSelectedId = (id: number) => {
        setSelectedIds((current) => {
            const next = new Set(current)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })
    }

    const toggleCurrentPage = () => {
        setSelectedIds((current) => {
            const next = new Set(current)
            if (isCurrentPageSelected) currentPageIds.forEach((id) => next.delete(id))
            else currentPageIds.forEach((id) => next.add(id))
            return next
        })
    }

    const handleRestore = async () => {
        if (selectedIds.size === 0) return

        setIsRestoring(true)
        try {
            await restoreTrashBinNodes(Array.from(selectedIds))
            Toast.success(`已恢复 ${selectedIds.size} 个目录节点`)
            clearSelection()
            setPage(1)
            setRefreshKey((current) => current + 1)
            onRestored()
        } catch (restoreError) {
            Toast.error(
                restoreError instanceof Error ? restoreError.message : '目录节点恢复失败'
            )
        } finally {
            setIsRestoring(false)
        }
    }

    const handlePermanentDelete = async () => {
        if (selectedIds.size === 0) return

        const deleteCount = selectedIds.size
        setIsDeleting(true)
        try {
            await permanentlyDeleteTrashBinNodes(Array.from(selectedIds))
            Toast.success(`已彻底删除 ${deleteCount} 个目录节点`)
            setIsDeleteConfirmOpen(false)
            clearSelection()
            setPage(1)
            setRefreshKey((current) => current + 1)
        } catch (deleteError) {
            Toast.error(
                deleteError instanceof Error
                    ? deleteError.message
                    : '目录节点彻底删除失败'
            )
        } finally {
            setIsDeleting(false)
        }
    }

    if (!isOpen) return null

    return createPortal(
        <div
            className="fixed inset-0 z-50 flex items-start justify-center bg-black/65 p-4 pt-10 sm:pt-16"
            onPointerDown={handleClose}
        >
            <div
                className="bg-surface-900 border-surface-700 flex max-h-[86vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border shadow-2xl"
                onPointerDown={(event) => event.stopPropagation()}
            >
                <div className="border-surface-700 border-b bg-gradient-to-b from-slate-800/55 to-slate-900/20 px-5 pt-5 pb-4">
                    <div className="mb-3 flex items-start justify-between gap-4">
                        <div className="flex items-start gap-3">
                            <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-rose-500/10 text-rose-400">
                                <Trash2 className="h-4.5 w-4.5" />
                            </span>
                            <div>
                                <h2 className="text-lg font-semibold tracking-tight text-slate-100">
                                    回收站
                                </h2>
                                <p className="mt-1 text-xs text-slate-500">
                                    查看目录画布中已删除的节点，不包含详情画布内容
                                </p>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={handleClose}
                            disabled={isMutating}
                            className="cursor-pointer rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-700/70 hover:text-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                            aria-label="关闭回收站"
                        >
                            <X className="h-5 w-5" />
                        </button>
                    </div>

                    <div className="mb-4 flex items-center gap-2 rounded-lg border border-amber-500/15 bg-amber-500/5 px-3 py-2 text-xs text-amber-200/80">
                        <Clock3 className="h-3.5 w-3.5 shrink-0 text-amber-400" />
                        已删除内容保留 30 天，逾期将自动彻底删除
                    </div>

                    <div className="flex h-12 items-center gap-3 rounded-xl border border-slate-600/80 bg-slate-950/55 px-4 shadow-inner transition-colors focus-within:border-rose-500 focus-within:ring-2 focus-within:ring-rose-500/15">
                        <Search className="h-5 w-5 shrink-0 text-rose-400" />
                        <input
                            ref={inputRef}
                            type="search"
                            value={query}
                            onChange={(event) => {
                                setQuery(event.target.value)
                                clearSelection()
                                resetPage()
                            }}
                            placeholder="搜索已删除节点的名称…"
                            className="min-w-0 flex-1 bg-transparent text-sm text-slate-100 outline-none! placeholder:text-slate-500"
                        />
                        {query && (
                            <button
                                type="button"
                                onClick={() => {
                                    setQuery('')
                                    clearSelection()
                                    resetPage()
                                    inputRef.current?.focus()
                                }}
                                className="cursor-pointer rounded-full bg-slate-700/70 p-1 text-slate-400 transition-colors hover:bg-slate-600 hover:text-white"
                                aria-label="清空搜索内容"
                            >
                                <X className="h-3.5 w-3.5" />
                            </button>
                        )}
                    </div>
                </div>

                <div className="border-surface-700 border-b bg-slate-900/45 px-5 py-4">
                    <div className="mb-3 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 text-xs font-medium text-slate-300">
                            <SlidersHorizontal className="h-4 w-4 text-slate-500" />
                            筛选条件
                            {activeFilterCount > 0 && (
                                <span className="grid h-5 min-w-5 place-items-center rounded-full bg-rose-500/15 px-1.5 text-[11px] text-rose-300">
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
                                value={nodeType}
                                onChange={(event) => {
                                    setNodeType(event.target.value as NodeType | '')
                                    clearSelection()
                                    resetPage()
                                }}
                                className="h-10 rounded-lg border border-slate-700 bg-slate-800 px-3 text-sm text-slate-200 outline-none transition-colors focus:border-rose-500"
                            >
                                <option value="">全部类型</option>
                                <option value="DIRECTORY">目录</option>
                                <option value="DETAIL">详情入口</option>
                            </select>
                        </label>

                        <label className="grid gap-1.5 text-xs text-slate-400">
                            <span className="flex items-center gap-1.5">
                                <CalendarDays className="h-3.5 w-3.5" /> 删除日期从
                            </span>
                            <input
                                type="date"
                                value={startDate}
                                max={endDate || undefined}
                                onChange={(event) => {
                                    setStartDate(event.target.value)
                                    clearSelection()
                                    resetPage()
                                }}
                                className="h-10 rounded-lg border border-slate-700 bg-slate-800 px-3 text-sm text-slate-200 outline-none transition-colors focus:border-rose-500"
                            />
                        </label>

                        <label className="grid gap-1.5 text-xs text-slate-400">
                            <span className="flex items-center gap-1.5">
                                <CalendarDays className="h-3.5 w-3.5" /> 删除日期至
                            </span>
                            <input
                                type="date"
                                value={endDate}
                                min={startDate || undefined}
                                onChange={(event) => {
                                    setEndDate(event.target.value)
                                    clearSelection()
                                    resetPage()
                                }}
                                className="h-10 rounded-lg border border-slate-700 bg-slate-800 px-3 text-sm text-slate-200 outline-none transition-colors focus:border-rose-500"
                            />
                        </label>
                    </div>
                </div>

                <div className="border-surface-700 flex min-h-12 items-center justify-between gap-3 border-b bg-slate-900/65 px-5 py-2.5">
                    <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-300">
                        <input
                            type="checkbox"
                            checked={isCurrentPageSelected}
                            disabled={result.list.length === 0 || isLoading || isMutating}
                            onChange={toggleCurrentPage}
                            className="h-4 w-4 accent-rose-500"
                        />
                        全选当前页
                    </label>
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-500">
                            已选择 <span className="font-medium text-slate-200">{selectedIds.size}</span> 项
                        </span>
                        <button
                            type="button"
                            disabled={selectedIds.size === 0 || isMutating}
                            onClick={() => void handleRestore()}
                            className="flex h-8 cursor-pointer items-center gap-1.5 rounded-md bg-emerald-600 px-3 text-xs font-medium text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-500"
                        >
                            {isRestoring ? (
                                <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                                <Undo2 className="h-3.5 w-3.5" />
                            )}
                            {isRestoring ? '正在恢复' : '恢复所选'}
                        </button>
                        <button
                            type="button"
                            disabled={selectedIds.size === 0 || isMutating}
                            onClick={() => setIsDeleteConfirmOpen(true)}
                            className="flex h-8 cursor-pointer items-center gap-1.5 rounded-md bg-rose-600 px-3 text-xs font-medium text-white transition-colors hover:bg-rose-500 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-500"
                        >
                            <Trash2 className="h-3.5 w-3.5" />
                            彻底删除
                        </button>
                    </div>
                </div>

                <div className="min-h-64 flex-1 overflow-y-auto">
                    {isLoading ? (
                        <div className="flex min-h-64 flex-col items-center justify-center gap-3 text-sm text-slate-500">
                            <LoaderCircle className="h-6 w-6 animate-spin text-rose-400" />
                            正在加载回收站
                        </div>
                    ) : error ? (
                        <div className="flex min-h-64 items-center justify-center px-4 text-center text-sm text-rose-400">
                            {error}
                        </div>
                    ) : result.list.length === 0 ? (
                        <div className="flex min-h-64 flex-col items-center justify-center gap-3 px-4 text-center text-sm text-slate-500">
                            <Trash2 className="h-8 w-8 text-slate-700" />
                            没有找到符合条件的删除记录
                        </div>
                    ) : (
                        <ul className="divide-surface-700 divide-y">
                            {result.list.map((node) => (
                                <li
                                    key={node.id}
                                    className={`flex items-center gap-3 px-5 py-3.5 transition-colors ${
                                        selectedIds.has(node.id) ? 'bg-rose-500/5' : ''
                                    }`}
                                >
                                    <input
                                        type="checkbox"
                                        checked={selectedIds.has(node.id)}
                                        disabled={isMutating}
                                        onChange={() => toggleSelectedId(node.id)}
                                        aria-label={`选择 ${node.label}`}
                                        className="h-4 w-4 shrink-0 cursor-pointer accent-rose-500 disabled:cursor-not-allowed"
                                    />
                                    {node.nodeType === 'DETAIL' ? (
                                        <FileText className="h-4 w-4 shrink-0 text-emerald-400" />
                                    ) : (
                                        <Folder className="h-4 w-4 shrink-0 text-blue-400" />
                                    )}
                                    <span className="min-w-0 flex-1">
                                        <span className="block truncate text-sm text-slate-200">
                                            {node.label}
                                        </span>
                                        <span className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
                                            <Trash2 className="h-3 w-3" />
                                            删除于 {formatDeletedAt(node.deletedAt)}
                                        </span>
                                    </span>
                                    <span
                                        className={`rounded-full px-2 py-0.5 text-xs ${
                                            node.nodeType === 'DETAIL'
                                                ? 'bg-emerald-500/10 text-emerald-400'
                                                : 'bg-blue-500/10 text-blue-400'
                                        }`}
                                    >
                                        {node.nodeType === 'DETAIL' ? '详情入口' : '目录'}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                <div className="border-surface-700 flex flex-col gap-3 border-t bg-slate-900/55 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-xs text-slate-400">
                        共 <span className="font-medium text-slate-200">{result.total}</span> 条，
                        第 <span className="font-medium text-slate-200">{page}</span> / {totalPages} 页
                    </p>

                    <nav className="flex items-center gap-1" aria-label="回收站分页">
                        <button
                            type="button"
                            disabled={page <= 1 || isLoading || isMutating}
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
                                    disabled={isLoading || isMutating}
                                    onClick={() => setPage(item)}
                                    aria-current={item === page ? 'page' : undefined}
                                    className={`h-8 min-w-8 cursor-pointer rounded-md px-2 text-xs transition-colors disabled:cursor-not-allowed ${
                                        item === page
                                            ? 'bg-rose-600 text-white'
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
                            disabled={page >= totalPages || isLoading || isMutating}
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

            {isDeleteConfirmOpen && (
                <div
                    className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4"
                    onPointerDown={(event) => event.stopPropagation()}
                >
                    <div
                        role="alertdialog"
                        aria-modal="true"
                        aria-labelledby="trash-delete-confirm-title"
                        className="border-surface-700 bg-surface-900 w-full max-w-md rounded-xl border shadow-2xl"
                    >
                        <div className="border-surface-700 flex items-center gap-3 border-b px-6 py-4">
                            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-rose-500/10 text-rose-400">
                                <Trash2 className="h-4.5 w-4.5" />
                            </span>
                            <h3
                                id="trash-delete-confirm-title"
                                className="text-lg font-semibold text-slate-100"
                            >
                                确认彻底删除？
                            </h3>
                        </div>
                        <div className="space-y-3 px-6 py-5 text-sm leading-6 text-slate-300">
                            <p>
                                将永久删除所选的{' '}
                                <span className="font-semibold text-rose-300">
                                    {selectedIds.size}
                                </span>{' '}
                                个目录节点及其所有后代。
                            </p>
                            <p className="text-xs text-slate-500">
                                关联的详情内容和图片文件也会一并删除，此操作无法撤销。
                            </p>
                        </div>
                        <div className="border-surface-700 flex justify-end gap-3 border-t bg-slate-900/55 px-6 py-4">
                            <button
                                type="button"
                                disabled={isDeleting}
                                onClick={() => setIsDeleteConfirmOpen(false)}
                                className="h-9 cursor-pointer rounded-lg bg-slate-800 px-4 text-sm font-medium text-slate-200 transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                取消
                            </button>
                            <button
                                type="button"
                                disabled={isDeleting}
                                onClick={() => void handlePermanentDelete()}
                                className="flex h-9 cursor-pointer items-center gap-2 rounded-lg bg-rose-600 px-4 text-sm font-medium text-white transition-colors hover:bg-rose-500 disabled:cursor-wait disabled:opacity-65"
                            >
                                {isDeleting ? (
                                    <LoaderCircle className="h-4 w-4 animate-spin" />
                                ) : (
                                    <Trash2 className="h-4 w-4" />
                                )}
                                {isDeleting ? '正在删除' : '确认彻底删除'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>,
        document.body
    )
}

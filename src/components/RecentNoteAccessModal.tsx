import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Clock3, FileText, History, LoaderCircle, RotateCcw, X } from 'lucide-react'

import { getRecentNoteAccesses, type RecentNoteAccess } from '../api'

interface RecentNoteAccessModalProps {
    isOpen: boolean
    currentDirectoryNodeId?: number
    onClose: () => void
    onView: (directoryNodeId: number) => void
}

const formatAccessTime = (value: string) => {
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

export default function RecentNoteAccessModal({
    isOpen,
    currentDirectoryNodeId,
    onClose,
    onView,
}: RecentNoteAccessModalProps) {
    const [records, setRecords] = useState<RecentNoteAccess[]>([])
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [refreshKey, setRefreshKey] = useState(0)

    useEffect(() => {
        if (!isOpen) return

        const controller = new AbortController()
        const timer = window.setTimeout(() => {
            setIsLoading(true)
            setError(null)

            void getRecentNoteAccesses(controller.signal)
                .then(setRecords)
                .catch((requestError: unknown) => {
                    if (
                        requestError instanceof DOMException &&
                        requestError.name === 'AbortError'
                    ) {
                        return
                    }

                    setRecords([])
                    setError(
                        requestError instanceof Error
                            ? requestError.message
                            : '最近访问记录加载失败'
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
    }, [isOpen, refreshKey])

    useEffect(() => {
        if (!isOpen) return

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onClose()
        }
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [isOpen, onClose])

    if (!isOpen) return null

    return createPortal(
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
            onPointerDown={onClose}
        >
            <section
                role="dialog"
                aria-modal="true"
                aria-labelledby="recent-note-access-title"
                className="flex max-h-[min(80vh,720px)] w-full max-w-xl flex-col overflow-hidden rounded-xl border border-slate-700/70 bg-slate-950/30 shadow-2xl backdrop-blur-md"
                onPointerDown={(event) => event.stopPropagation()}
            >
                <header className="flex items-center justify-between border-b border-slate-700/60 px-6 py-4">
                    <div className="flex items-center gap-3">
                        <History className="h-6 w-6 text-violet-300" aria-hidden="true" />
                        <div>
                            <h3
                                id="recent-note-access-title"
                                className="text-lg font-semibold text-slate-100"
                            >
                                最近访问
                            </h3>
                            <p className="text-xs text-slate-500">快速回到最近查看过的笔记</p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="grid h-9 w-9 cursor-pointer place-items-center rounded-lg text-slate-400 transition-colors hover:bg-white/5 hover:text-slate-100"
                        aria-label="关闭最近访问记录"
                        title="关闭"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </header>

                <div className="min-h-60 overflow-y-auto p-3">
                    {isLoading ? (
                        <div className="flex min-h-56 flex-col items-center justify-center gap-3 text-sm text-slate-400">
                            <LoaderCircle className="h-7 w-7 animate-spin text-violet-300" />
                            正在加载最近访问记录
                        </div>
                    ) : error ? (
                        <div className="flex min-h-56 flex-col items-center justify-center gap-4 text-center">
                            <p className="text-sm text-slate-400">{error}</p>
                            <button
                                type="button"
                                onClick={() => setRefreshKey((current) => current + 1)}
                                className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-700/70 bg-black/20 px-4 py-2 text-sm text-slate-200 transition-colors hover:border-violet-500/50 hover:text-violet-200"
                            >
                                <RotateCcw className="h-4 w-4" />
                                重新加载
                            </button>
                        </div>
                    ) : records.length === 0 ? (
                        <div className="flex min-h-56 flex-col items-center justify-center gap-3 text-center text-slate-500">
                            <History className="h-10 w-10" strokeWidth={1} />
                            <p className="text-sm">暂无最近访问记录</p>
                        </div>
                    ) : (
                        <ul className="grid gap-1">
                            {records.map((record) => {
                                const isCurrent = record.directoryNodeId === currentDirectoryNodeId

                                return (
                                    <li
                                        key={record.id}
                                        className="flex items-center gap-3 rounded-lg px-3 py-3 transition-colors hover:bg-white/5"
                                    >
                                        <FileText className="h-5 w-5 shrink-0 text-emerald-400" />
                                        <span className="min-w-0 flex-1">
                                            <span className="block truncate text-sm font-medium text-slate-200">
                                                {record.directoryNodeLabel}
                                            </span>
                                            <time
                                                dateTime={record.accessedAt}
                                                className="mt-1 flex items-center gap-1.5 text-xs text-slate-500"
                                            >
                                                <Clock3 className="h-3.5 w-3.5" />
                                                {formatAccessTime(record.accessedAt)}
                                            </time>
                                        </span>
                                        <button
                                            type="button"
                                            disabled={isCurrent}
                                            onClick={() => onView(record.directoryNodeId)}
                                            className="shrink-0 cursor-pointer rounded-lg border border-violet-500/30 px-3 py-1.5 text-sm text-violet-300 transition-colors hover:bg-violet-500/10 disabled:cursor-default disabled:border-slate-700/60 disabled:text-slate-500"
                                        >
                                            {isCurrent ? '当前笔记' : '查看'}
                                        </button>
                                    </li>
                                )
                            })}
                        </ul>
                    )}
                </div>
            </section>
        </div>,
        document.body
    )
}

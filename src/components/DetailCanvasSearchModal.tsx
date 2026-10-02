import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { FileImage, FileText, Link2, Newspaper, Search, X } from 'lucide-react'

import type { NodeData } from '../types'

interface DetailCanvasSearchModalProps {
    open: boolean
    nodes: NodeData[]
    onClose: () => void
    onView: (node: NodeData) => void
}

const getNodeLabel = (node: NodeData) => {
    const label = node.label?.trim()
    if (label) return label
    if (node.contentType === 'IMAGE') return '图片节点'
    return '未命名节点'
}

const getCreatedAtTimestamp = (node: NodeData) => {
    if (!node.createdAt) return Number.POSITIVE_INFINITY
    const timestamp = new Date(node.createdAt).getTime()
    return Number.isNaN(timestamp) ? 0 : timestamp
}

const getNodeTypeMeta = (node: NodeData) => {
    if (node.contentType?.startsWith('REF_')) {
        return {
            label: '引用节点',
            className: 'border-amber-500/25 bg-amber-500/5 text-amber-300',
            Icon: Link2,
        }
    }
    if (node.article) {
        return {
            label: '文章节点',
            className: 'border-cyan-500/25 bg-cyan-500/5 text-cyan-300',
            Icon: Newspaper,
        }
    }
    if (node.contentType === 'IMAGE') {
        return {
            label: '图片节点',
            className: 'border-fuchsia-500/25 bg-fuchsia-500/5 text-fuchsia-300',
            Icon: FileImage,
        }
    }
    return {
        label: '文本节点',
        className: 'border-emerald-500/25 bg-emerald-500/5 text-emerald-300',
        Icon: FileText,
    }
}

export default function DetailCanvasSearchModal({
    open,
    nodes,
    onClose,
    onView,
}: DetailCanvasSearchModalProps) {
    const [query, setQuery] = useState('')
    const inputRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        if (!open) return
        requestAnimationFrame(() => inputRef.current?.focus())
    }, [open])

    useEffect(() => {
        if (!open) return

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onClose()
        }
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [onClose, open])

    const results = useMemo(() => {
        const normalizedQuery = query.trim().toLocaleLowerCase()

        return nodes
            .filter((node) => node.opStatus !== 'deleted')
            .filter((node) =>
                normalizedQuery
                    ? (node.label ?? '').toLocaleLowerCase().includes(normalizedQuery)
                    : true
            )
            .sort((left, right) => {
                const leftCreatedAt = getCreatedAtTimestamp(left)
                const rightCreatedAt = getCreatedAtTimestamp(right)
                if (leftCreatedAt !== rightCreatedAt) return rightCreatedAt - leftCreatedAt
                return String(right.id).localeCompare(String(left.id))
            })
    }, [nodes, query])

    if (!open) return null

    return createPortal(
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
            onPointerDown={onClose}
        >
            <section
                className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-slate-700/70 bg-slate-950/30 shadow-2xl backdrop-blur-md"
                aria-labelledby="detail-canvas-search-title"
                role="dialog"
                aria-modal="true"
                onPointerDown={(event) => event.stopPropagation()}
            >
                <header className="flex items-center justify-between gap-4 border-b border-slate-700/60 px-5 py-4">
                    <div>
                        <h3 id="detail-canvas-search-title" className="text-lg font-semibold text-slate-100">
                            搜索画布节点
                        </h3>
                        <p className="mt-1 text-xs text-slate-500">根据节点 label 在当前画布中查找</p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="grid h-9 w-9 cursor-pointer place-items-center rounded-lg text-slate-400 transition-colors hover:bg-white/5 hover:text-slate-100"
                        aria-label="关闭节点搜索"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </header>

                <div className="border-b border-slate-700/60 px-5 py-4">
                    <label className="flex h-11 items-center gap-3 rounded-lg border border-slate-700/70 bg-black/25 px-3 transition-colors focus-within:border-indigo-500/60 focus-within:ring-2 focus-within:ring-indigo-500/15">
                        <Search className="h-5 w-5 shrink-0 text-slate-500" aria-hidden="true" />
                        <input
                            ref={inputRef}
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            className="min-w-0 flex-1 bg-transparent text-sm text-slate-100 outline-none! placeholder:text-slate-600"
                            placeholder="输入节点 label..."
                        />
                    </label>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto p-2">
                    {results.length === 0 ? (
                        <div className="flex min-h-40 items-center justify-center px-4 text-center text-sm text-slate-500">
                            没有找到匹配的节点
                        </div>
                    ) : (
                        <ul className="divide-y divide-slate-800/80">
                            {results.map((node) => {
                                const typeMeta = getNodeTypeMeta(node)
                                const TypeIcon = typeMeta.Icon

                                return (
                                    <li key={node.id} className="flex items-center gap-3 px-3 py-3">
                                        <span className="min-w-0 flex-1">
                                            <span className="block truncate text-sm text-slate-200" title={getNodeLabel(node)}>
                                                {getNodeLabel(node)}
                                            </span>
                                            <span className="mt-2 flex flex-wrap gap-1.5">
                                                {node.parentId == null && (
                                                    <span className="rounded-md border border-indigo-500/25 bg-indigo-500/5 px-2 py-0.5 text-xs text-indigo-300">
                                                        根节点
                                                    </span>
                                                )}
                                                <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs ${typeMeta.className}`}>
                                                    <TypeIcon className="h-3 w-3" aria-hidden="true" />
                                                    {typeMeta.label}
                                                </span>
                                            </span>
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => onView(node)}
                                            className="shrink-0 cursor-pointer rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-3 py-1.5 text-xs font-medium text-indigo-200 transition-colors hover:bg-indigo-500/20"
                                        >
                                            查看
                                        </button>
                                    </li>
                                )
                            })}
                        </ul>
                    )}
                </div>

                <footer className="border-t border-slate-700/60 bg-black/20 px-5 py-3 text-xs text-slate-500">
                    共 {results.length} 个匹配节点
                </footer>
            </section>
        </div>,
        document.body
    )
}

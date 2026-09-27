import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { FileText, LoaderCircle } from 'lucide-react'

import { getDetailNodesByDirectoryNodeId, type Note } from '../api'
import type { NodeData } from '../types'
import Button from './Button'
import GraphViewer from './GraphViewer'
import NoteNodeView from './NoteNodeView'

type DetailNodePickerTargetType = 'DETAIL' | 'ARTICLE'

interface DetailNodePickerModalProps {
    isOpen: boolean
    directory: Note | null
    targetType: DetailNodePickerTargetType
    onClose: () => void
    onConfirm: (node: NodeData) => void
}

const isSelectableNode = (node: NodeData, targetType: DetailNodePickerTargetType) => {
    if (targetType === 'ARTICLE') return node.article === true
    const contentType = node.contentType ?? 'TEXT'
    return node.article !== true && (contentType === 'TEXT' || contentType === 'IMAGE')
}

const getNodeDisplayLabel = (node: NodeData) => {
    if (node.contentType === 'IMAGE') return '图片节点'
    const normalizedLabel = node.label?.trim().replaceAll(/\s+/g, ' ') ?? ''
    if (!normalizedLabel) return '未命名节点'
    return normalizedLabel.length > 18
        ? `${normalizedLabel.slice(0, 18)}…`
        : normalizedLabel
}

export default function DetailNodePickerModal({
    isOpen,
    directory,
    targetType,
    onClose,
    onConfirm,
}: DetailNodePickerModalProps) {
    const [nodes, setNodes] = useState<NodeData[]>([])
    const [selectedNode, setSelectedNode] = useState<NodeData | null>(null)
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        if (!isOpen || !directory) return

        const controller = new AbortController()
        const timer = window.setTimeout(() => {
            setNodes([])
            setSelectedNode(null)
            setError(null)
            setIsLoading(true)

            void getDetailNodesByDirectoryNodeId(directory.id, controller.signal)
                .then(setNodes)
                .catch((requestError: unknown) => {
                    if (
                        requestError instanceof DOMException &&
                        requestError.name === 'AbortError'
                    ) {
                        return
                    }
                    setError(
                        requestError instanceof Error
                            ? requestError.message
                            : '详情画布加载失败'
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
    }, [directory, isOpen])

    useEffect(() => {
        if (!isOpen) return

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onClose()
        }
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [isOpen, onClose])

    const renderSelectableNode = useCallback(
        (node: NodeData) => {
            const selectable = isSelectableNode(node, targetType)
            const selected = selectedNode?.id === node.id

            const selectNode = () => {
                if (selectable) setSelectedNode(node)
            }

            return (
                <g
                    transform={`translate(${node.x}, ${node.y})`}
                    className={selectable ? 'cursor-pointer' : 'cursor-not-allowed'}
                    onPointerUp={(event) => {
                        if (event.pointerType === 'mouse' && event.button !== 0) return
                        if (event.pointerType !== 'mouse' && event.pointerType !== 'touch') return
                        selectNode()
                    }}
                >
                    <NoteNodeView
                        node={node}
                        graphType="detail"
                        browseMode
                        selected={selected}
                    />
                </g>
            )
        },
        [selectedNode, targetType]
    )

    if (!isOpen || !directory) return null

    const targetLabel = targetType === 'ARTICLE' ? '文章节点' : '普通详情节点'

    return createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
            <div className="flex max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-slate-700/60 bg-black shadow-2xl">
                <header className="gap-4 border-b border-slate-700/60 px-6 py-4">
                    <div>
                        <h2 className="text-lg font-semibold text-slate-100">
                            选择{targetLabel}
                        </h2>
                        <p className="mt-1 text-sm text-slate-400">
                            {directory.label} · 点击画布中的{targetLabel}后确认
                        </p>
                    </div>
                </header>

                <div className="relative h-[min(68vh,680px)] min-h-96 bg-black">
                    {selectedNode && (
                        <div className="pointer-events-none absolute top-4 left-4 z-10 inline-flex max-w-64 items-center gap-2 rounded-full bg-indigo-500/15 px-3 py-1 text-sm text-indigo-200 backdrop-blur-sm">
                            <FileText className="h-4 w-4 shrink-0" />
                            <span className="truncate">{getNodeDisplayLabel(selectedNode)}</span>
                        </div>
                    )}
                    {isLoading ? (
                        <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-slate-400">
                            <LoaderCircle className="h-7 w-7 animate-spin text-indigo-400" />
                            正在加载详情画布
                        </div>
                    ) : error ? (
                        <div className="flex h-full items-center justify-center px-6 text-center text-sm text-rose-400">
                            {error}
                        </div>
                    ) : nodes.length === 0 ? (
                        <div className="flex h-full items-center justify-center text-sm text-slate-500">
                            该笔记还没有详情节点
                        </div>
                    ) : (
                        <GraphViewer
                            nodes={nodes}
                            renderNode={renderSelectableNode}
                        />
                    )}
                </div>

                <footer className="flex justify-end gap-2 border-t border-slate-700/60 bg-black px-6 py-4">
                    <Button onClick={onClose}>取消</Button>
                    <Button
                        type="primary"
                        disabled={!selectedNode}
                        onClick={() => {
                            if (selectedNode) onConfirm(selectedNode)
                        }}
                    >
                        确认
                    </Button>
                </footer>
            </div>
        </div>,
        document.body
    )
}

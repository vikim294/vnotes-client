import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
    CalendarDays,
    LoaderCircle,
    Pencil,
    Plus,
    RotateCcw,
    Save,
    Tag as TagIcon,
    Trash2,
    X,
} from 'lucide-react'
import {
    createTag,
    deleteTag,
    getTags,
    renameTag,
    type Tag,
} from '../api'
import { Toast } from './Toast'

interface TagManagementModalProps {
    isOpen: boolean
    onClose: () => void
}

const formatCreatedAt = (value?: string) => {
    if (!value) return '—'

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

export default function TagManagementModal({ isOpen, onClose }: TagManagementModalProps) {
    const [tags, setTags] = useState<Tag[]>([])
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [newTagName, setNewTagName] = useState('')
    const [isCreating, setIsCreating] = useState(false)
    const [editingId, setEditingId] = useState<number | null>(null)
    const [editingName, setEditingName] = useState('')
    const [mutatingId, setMutatingId] = useState<number | null>(null)
    const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null)
    const createInputRef = useRef<HTMLInputElement>(null)

    const loadTags = useCallback((signal?: AbortSignal) => {
        setIsLoading(true)
        setError(null)

        void getTags(signal)
            .then(setTags)
            .catch((requestError: unknown) => {
                if (
                    requestError instanceof DOMException &&
                    requestError.name === 'AbortError'
                ) {
                    return
                }

                setTags([])
                setError(
                    requestError instanceof Error ? requestError.message : '标签列表加载失败'
                )
            })
            .finally(() => {
                if (!signal?.aborted) setIsLoading(false)
            })
    }, [])

    useEffect(() => {
        if (!isOpen) return

        const controller = new AbortController()
        const timer = window.setTimeout(() => {
            loadTags(controller.signal)
            createInputRef.current?.focus()
        }, 0)

        return () => {
            window.clearTimeout(timer)
            controller.abort()
        }
    }, [isOpen, loadTags])

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key !== 'Escape' || !isOpen || isCreating || mutatingId !== null) return

            if (editingId !== null) {
                setEditingId(null)
                setEditingName('')
                return
            }

            if (pendingDeleteId !== null) {
                setPendingDeleteId(null)
                return
            }

            onClose()
        }

        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [editingId, isCreating, isOpen, mutatingId, onClose, pendingDeleteId])

    const handleCreate = async (event: React.FormEvent) => {
        event.preventDefault()
        const name = newTagName.trim()
        if (!name || isCreating) return

        setIsCreating(true)
        try {
            await createTag(name)
            setNewTagName('')
            Toast.success('标签已创建')
            loadTags()
        } catch (createError) {
            Toast.error(createError instanceof Error ? createError.message : '标签创建失败')
        } finally {
            setIsCreating(false)
        }
    }

    const startEditing = (tag: Tag) => {
        setPendingDeleteId(null)
        setEditingId(tag.id)
        setEditingName(tag.name)
    }

    const cancelEditing = () => {
        setEditingId(null)
        setEditingName('')
    }

    const handleRename = async (id: number) => {
        const name = editingName.trim()
        if (!name || mutatingId !== null) return

        setMutatingId(id)
        try {
            await renameTag(id, name)
            setTags((current) =>
                current.map((tag) => (tag.id === id ? { ...tag, name } : tag))
            )
            cancelEditing()
            Toast.success('标签已重命名')
        } catch (renameError) {
            Toast.error(renameError instanceof Error ? renameError.message : '标签重命名失败')
        } finally {
            setMutatingId(null)
        }
    }

    const handleDelete = async (id: number) => {
        if (mutatingId !== null) return

        setMutatingId(id)
        try {
            await deleteTag(id)
            setTags((current) => current.filter((tag) => tag.id !== id))
            setPendingDeleteId(null)
            if (editingId === id) cancelEditing()
            Toast.success('标签已删除')
        } catch (deleteError) {
            Toast.error(deleteError instanceof Error ? deleteError.message : '标签删除失败')
        } finally {
            setMutatingId(null)
        }
    }

    const handleClose = () => {
        if (isCreating || mutatingId !== null) return
        setNewTagName('')
        setPendingDeleteId(null)
        cancelEditing()
        onClose()
    }

    if (!isOpen) return null

    return createPortal(
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
            onPointerDown={handleClose}
        >
            <section
                role="dialog"
                aria-modal="true"
                aria-labelledby="tag-management-title"
                className="flex max-h-[min(84vh,760px)] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-slate-700/70 bg-slate-950/30 shadow-2xl backdrop-blur-md"
                onPointerDown={(event) => event.stopPropagation()}
            >
                <header className="flex items-center justify-between border-b border-slate-700/60 px-6 py-4">
                    <div className="flex items-center gap-3">
                        <span className="grid h-9 w-9 place-items-center rounded-lg bg-indigo-500/10 text-indigo-300">
                            <TagIcon className="h-5 w-5" aria-hidden="true" />
                        </span>
                        <h3 id="tag-management-title" className="text-lg font-semibold text-slate-100">
                            标签管理
                        </h3>
                    </div>
                    <button
                        type="button"
                        onClick={handleClose}
                        disabled={isCreating || mutatingId !== null}
                        className="grid h-9 w-9 cursor-pointer place-items-center rounded-lg text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                        aria-label="关闭标签管理"
                        title="关闭"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </header>

                <div className="border-b border-slate-700/60 px-6 py-4">
                    <form className="flex gap-3" onSubmit={(event) => void handleCreate(event)}>
                        <input
                            ref={createInputRef}
                            value={newTagName}
                            onChange={(event) => setNewTagName(event.target.value)}
                            maxLength={100}
                            disabled={isCreating}
                            placeholder="输入新标签名称"
                            aria-label="新标签名称"
                            className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none transition-colors placeholder:text-slate-600 focus:border-indigo-500 disabled:opacity-60"
                        />
                        <button
                            type="submit"
                            disabled={!newTagName.trim() || isCreating}
                            className="flex cursor-pointer items-center gap-2 rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {isCreating ? (
                                <LoaderCircle className="h-4 w-4 animate-spin" />
                            ) : (
                                <Plus className="h-4 w-4" />
                            )}
                            新增标签
                        </button>
                    </form>
                </div>

                <div className="min-h-64 overflow-auto px-6 py-5">
                    {isLoading ? (
                        <div className="flex min-h-56 flex-col items-center justify-center gap-3 text-sm text-slate-400">
                            <LoaderCircle className="h-7 w-7 animate-spin text-indigo-400" />
                            正在加载标签
                        </div>
                    ) : error ? (
                        <div className="flex min-h-56 flex-col items-center justify-center gap-4 text-center">
                            <p className="text-sm text-slate-400">{error}</p>
                            <button
                                type="button"
                                onClick={() => loadTags()}
                                className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-sm text-slate-200 transition-colors hover:border-indigo-500/70 hover:text-indigo-200"
                            >
                                <RotateCcw className="h-4 w-4" />
                                重新加载
                            </button>
                        </div>
                    ) : tags.length === 0 ? (
                        <div className="flex min-h-56 flex-col items-center justify-center gap-3 text-center">
                            <span className="grid h-14 w-14 place-items-center rounded-full bg-slate-800 text-slate-500">
                                <TagIcon className="h-7 w-7" />
                            </span>
                            <div>
                                <p className="text-sm font-medium text-slate-300">还没有标签</p>
                                <p className="mt-1 text-xs text-slate-500">在上方输入名称创建第一个标签</p>
                            </div>
                        </div>
                    ) : (
                        <table className="w-full table-fixed border-separate border-spacing-0 text-left">
                            <thead>
                                <tr className="text-xs text-slate-500">
                                    <th className="w-[42%] border-b border-slate-700 px-3 py-3 font-medium">标签</th>
                                    <th className="w-[28%] border-b border-slate-700 px-3 py-3 font-medium">创建时间</th>
                                    <th className="w-[30%] border-b border-slate-700 px-3 py-3 text-right font-medium">操作</th>
                                </tr>
                            </thead>
                            <tbody>
                                {tags.map((tag) => {
                                    const isEditing = editingId === tag.id
                                    const isMutating = mutatingId === tag.id
                                    const isConfirmingDelete = pendingDeleteId === tag.id

                                    return (
                                        <tr key={tag.id} className="text-sm text-slate-300">
                                            <td className="border-b border-slate-800 px-3 py-3.5 align-middle">
                                                {isEditing ? (
                                                    <input
                                                        value={editingName}
                                                        onChange={(event) => setEditingName(event.target.value)}
                                                        onKeyDown={(event) => {
                                                            if (event.key === 'Enter') void handleRename(tag.id)
                                                            if (event.key === 'Escape') cancelEditing()
                                                        }}
                                                        maxLength={100}
                                                        autoFocus
                                                        aria-label={`重命名标签 ${tag.name}`}
                                                        className="w-full rounded-md border border-indigo-500 bg-slate-950 px-2.5 py-1.5 text-sm text-slate-100 outline-none"
                                                    />
                                                ) : (
                                                    <span className="inline-flex max-w-full items-center gap-2 rounded-md border border-slate-700/60 bg-black/20 px-3 py-1.5 text-slate-300">
                                                        <TagIcon className="h-3.5 w-3.5 shrink-0" />
                                                        <span className="truncate" title={tag.name}>{tag.name}</span>
                                                    </span>
                                                )}
                                            </td>
                                            <td className="border-b border-slate-800 px-3 py-3.5 align-middle text-xs text-slate-500">
                                                <span className="flex items-center gap-1.5">
                                                    <CalendarDays className="h-3.5 w-3.5 shrink-0" />
                                                    {formatCreatedAt(tag.createdAt)}
                                                </span>
                                            </td>
                                            <td className="border-b border-slate-800 px-3 py-3.5 align-middle">
                                                <div className="flex flex-wrap justify-end gap-2">
                                                    {isEditing ? (
                                                        <>
                                                            <button
                                                                type="button"
                                                                onClick={() => void handleRename(tag.id)}
                                                                disabled={!editingName.trim() || isMutating}
                                                                className="flex cursor-pointer items-center gap-1 rounded-md px-2 py-1.5 text-xs text-indigo-300 transition-colors hover:bg-indigo-500/10 disabled:cursor-not-allowed disabled:opacity-50"
                                                            >
                                                                {isMutating ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                                                                保存
                                                            </button>
                                                            <button type="button" onClick={cancelEditing} disabled={isMutating} className="cursor-pointer rounded-md px-2 py-1.5 text-xs text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-200 disabled:opacity-50">
                                                                取消
                                                            </button>
                                                        </>
                                                    ) : isConfirmingDelete ? (
                                                        <>
                                                            <button
                                                                type="button"
                                                                onClick={() => void handleDelete(tag.id)}
                                                                disabled={isMutating}
                                                                className="flex cursor-pointer items-center gap-1 rounded-md bg-rose-500/10 px-2 py-1.5 text-xs text-rose-300 transition-colors hover:bg-rose-500/20 disabled:cursor-wait disabled:opacity-50"
                                                            >
                                                                {isMutating && <LoaderCircle className="h-3.5 w-3.5 animate-spin" />}
                                                                确认删除
                                                            </button>
                                                            <button type="button" onClick={() => setPendingDeleteId(null)} disabled={isMutating} className="cursor-pointer rounded-md px-2 py-1.5 text-xs text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-200 disabled:opacity-50">
                                                                取消
                                                            </button>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <button type="button" onClick={() => startEditing(tag)} disabled={mutatingId !== null} className="flex cursor-pointer items-center gap-1 rounded-md px-2 py-1.5 text-xs text-slate-400 transition-colors hover:bg-slate-800 hover:text-indigo-300 disabled:opacity-50">
                                                                <Pencil className="h-3.5 w-3.5" />
                                                                重命名
                                                            </button>
                                                            <button type="button" onClick={() => { cancelEditing(); setPendingDeleteId(tag.id) }} disabled={mutatingId !== null} className="flex cursor-pointer items-center gap-1 rounded-md px-2 py-1.5 text-xs text-slate-400 transition-colors hover:bg-rose-500/10 hover:text-rose-300 disabled:opacity-50">
                                                                <Trash2 className="h-3.5 w-3.5" />
                                                                删除
                                                            </button>
                                                        </>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    )}
                </div>
            </section>
        </div>,
        document.body
    )
}

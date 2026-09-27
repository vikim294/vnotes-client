import { LoaderCircle, RotateCcw, Tag as TagIcon } from 'lucide-react'
import type { Tag } from '../api'

interface TagCheckboxGroupProps {
    tags: Tag[]
    selectedTagIds: number[]
    isLoading: boolean
    error: string | null
    onToggle: (tagId: number) => void
    onRetry: () => void
}

export default function TagCheckboxGroup({
    tags,
    selectedTagIds,
    isLoading,
    error,
    onToggle,
    onRetry,
}: TagCheckboxGroupProps) {
    return (
        <fieldset className="mt-5 border-t border-slate-700/60 pt-4">
            <legend className="px-2 text-sm font-medium text-slate-300">选择标签</legend>

            {isLoading ? (
                <div className="flex min-h-24 items-center justify-center gap-2 text-sm text-slate-400">
                    <LoaderCircle className="h-4 w-4 animate-spin text-indigo-400" />
                    正在加载标签
                </div>
            ) : error ? (
                <div className="flex min-h-24 flex-col items-center justify-center gap-3 text-center">
                    <p className="text-sm text-slate-400">{error}</p>
                    <button
                        type="button"
                        onClick={onRetry}
                        className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-700/60 bg-black/20 px-3 py-1.5 text-sm text-slate-300 transition-colors hover:bg-white/5 hover:text-slate-100"
                    >
                        <RotateCcw className="h-3.5 w-3.5" />
                        重新加载
                    </button>
                </div>
            ) : tags.length === 0 ? (
                <p className="py-6 text-center text-sm text-slate-500">
                    暂无可选标签，可先在标签管理中创建
                </p>
            ) : (
                <div className="mt-3 flex max-h-44 flex-wrap content-start gap-2 overflow-y-auto pr-1">
                    {tags.map((tag) => {
                        const checked = selectedTagIds.includes(tag.id)

                        return (
                            <label
                                key={tag.id}
                                className={`flex max-w-full cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                                    checked
                                        ? 'border-indigo-400/35 bg-indigo-500/10 text-indigo-100'
                                        : 'border-slate-700/60 bg-black/20 text-slate-400 hover:bg-white/5 hover:text-slate-200'
                                }`}
                            >
                                <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => onToggle(tag.id)}
                                    className="h-4 w-4 cursor-pointer accent-indigo-500"
                                />
                                <TagIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                                <span className="truncate" title={tag.name}>{tag.name}</span>
                            </label>
                        )
                    })}
                </div>
            )}
        </fieldset>
    )
}

import { useEffect, useState } from 'react'
import { LoaderCircle, RotateCcw, Tag as TagIcon } from 'lucide-react'
import { getDirectoryTags, type Tag } from '../api'

interface DirectoryTagsProps {
    directoryNodeId: number
}

interface NoteTagListProps {
    tags: Tag[]
}

export function NoteTagList({ tags }: NoteTagListProps) {
    if (tags.length === 0) return null

    return (
        <div className="flex max-w-[min(56vw,720px)] flex-wrap items-center gap-1.5" aria-label="笔记标签">
            {tags.map((tag) => (
                <span
                    key={tag.id}
                    title={tag.name}
                    className="inline-flex max-w-40 items-center gap-1 rounded-full border border-indigo-400/20 bg-indigo-500/10 px-2 py-0.5 text-xs text-indigo-200/80"
                >
                    <TagIcon className="h-3 w-3 shrink-0" aria-hidden="true" />
                    <span className="truncate">{tag.name}</span>
                </span>
            ))}
        </div>
    )
}

export default function DirectoryTags({ directoryNodeId }: DirectoryTagsProps) {
    const [tags, setTags] = useState<Tag[]>([])
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState(false)
    const [refreshKey, setRefreshKey] = useState(0)

    useEffect(() => {
        const controller = new AbortController()
        const timer = window.setTimeout(() => {
            setIsLoading(true)
            setError(false)

            void getDirectoryTags(directoryNodeId, controller.signal)
                .then(setTags)
                .catch((requestError: unknown) => {
                    if (
                        requestError instanceof DOMException &&
                        requestError.name === 'AbortError'
                    ) {
                        return
                    }

                    setTags([])
                    setError(true)
                })
                .finally(() => {
                    if (!controller.signal.aborted) setIsLoading(false)
                })
        }, 0)

        return () => {
            window.clearTimeout(timer)
            controller.abort()
        }
    }, [directoryNodeId, refreshKey])

    if (isLoading) {
        return <LoaderCircle className="h-3.5 w-3.5 animate-spin text-slate-500" aria-label="正在加载标签" />
    }

    if (error) {
        return (
            <button
                type="button"
                onClick={() => setRefreshKey((current) => current + 1)}
                className="flex cursor-pointer items-center gap-1 text-xs text-rose-400/80 transition-colors hover:text-rose-300"
                title="重新加载标签"
            >
                <RotateCcw className="h-3 w-3" />
                标签加载失败
            </button>
        )
    }

    return <NoteTagList tags={tags} />
}

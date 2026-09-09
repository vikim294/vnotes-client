import { useEffect, useState } from 'react'
import { LoaderCircle } from 'lucide-react'
import { useParams } from 'react-router'
import { getSharedNote, type SharedNoteData } from '../../api'
import NoteGraph from '../../components/NoteGraph'
import type { NodeData } from '../../types'

const noop = () => undefined

export default function SharedNote() {
    const { shareToken } = useParams()
    const [sharedNote, setSharedNote] = useState<SharedNoteData | null>(null)
    const [flatTree, setFlatTree] = useState<NodeData[]>([])
    const [error, setError] = useState<string | null>(null)
    const [loadedShareToken, setLoadedShareToken] = useState<string | null>(null)

    useEffect(() => {
        const controller = new AbortController()

        if (!shareToken) {
            return () => controller.abort()
        }

        void getSharedNote(shareToken, controller.signal)
            .then((data) => {
                setError(null)
                setSharedNote(data)
                setFlatTree(
                    data.detailNodes.map((node) => ({
                        ...node,
                        label: node.label ?? '',
                    }))
                )
                setLoadedShareToken(shareToken)
            })
            .catch((requestError: unknown) => {
                if (requestError instanceof DOMException && requestError.name === 'AbortError') {
                    return
                }
                setSharedNote(null)
                setError(
                    requestError instanceof Error ? requestError.message : '分享笔记加载失败'
                )
                setLoadedShareToken(shareToken)
            })

        return () => controller.abort()
    }, [shareToken])

    const isLoading = Boolean(shareToken) && loadedShareToken !== shareToken

    if (!shareToken) {
        return (
            <main className="grid h-full place-items-center bg-black px-6 text-center">
                <div>
                    <h1 className="text-lg font-semibold text-slate-200">无法查看这篇笔记</h1>
                    <p className="mt-2 text-sm text-slate-500">分享链接无效</p>
                </div>
            </main>
        )
    }

    if (isLoading) {
        return (
            <main className="grid h-full place-items-center bg-black text-slate-400">
                <div className="flex items-center gap-3" role="status">
                    <LoaderCircle className="h-5 w-5 animate-spin text-indigo-400" />
                    正在加载分享笔记
                </div>
            </main>
        )
    }

    if (error || !sharedNote) {
        return (
            <main className="grid h-full place-items-center bg-black px-6 text-center">
                <div>
                    <h1 className="text-lg font-semibold text-slate-200">无法查看这篇笔记</h1>
                    <p className="mt-2 text-sm text-slate-500">
                        {error ?? '分享链接无效或已被取消'}
                    </p>
                </div>
            </main>
        )
    }

    return (
        <NoteGraph
            graphType="detail"
            viewMode="shared"
            noteTitle={sharedNote.title}
            noteTags={sharedNote.tags}
            flatTree={flatTree}
            setFlatTree={setFlatTree}
            onExitEdit={noop}
        />
    )
}

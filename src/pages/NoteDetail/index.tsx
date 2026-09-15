import { useCallback, useEffect, useRef, useState } from 'react'

import { type NodeData, type NoteDetailData } from '../../types'
import { useParams } from 'react-router'
import { getDetailNodesByDirectoryNodeId, getDirectoryNodeById } from '../../api'
import NoteGraph from '../../components/NoteGraph'

function NoteDetail() {
    const [flatTree, setFlatTree] = useState<NodeData[]>([])
    const [noteTitle, setNoteTitle] = useState('')
    const [loadedDirectoryNodeId, setLoadedDirectoryNodeId] = useState<number | null>(null)
    const [loadError, setLoadError] = useState<string | null>(null)
    const requestIdRef = useRef(0)

    // data related
    const { id } = useParams()
    const directoryNodeId = Number(id)
    const noteDetail: NoteDetailData = {
        directoryNodeId
    }

    const loadNoteDetail = useCallback(async (showLoading: boolean) => {
        if (!Number.isSafeInteger(directoryNodeId) || directoryNodeId <= 0) {
            setLoadError('无效的笔记 ID')
            setLoadedDirectoryNodeId(null)
            return
        }

        const requestId = ++requestIdRef.current
        if (showLoading) {
            setLoadedDirectoryNodeId(null)
            setLoadError(null)
        }

        try {
            const [directoryNode, detailNodes] = await Promise.all([
                getDirectoryNodeById(directoryNodeId),
                getDetailNodesByDirectoryNodeId(directoryNodeId),
            ])

            if (requestId !== requestIdRef.current) return

            setNoteTitle(directoryNode.label)
            setFlatTree(
                detailNodes.map((node) => ({
                    ...node,
                    // 图片节点的后端 label 为 null，画布内部统一使用空字符串。
                    label: node.label ?? '',
                }))
            )
            setLoadedDirectoryNodeId(directoryNodeId)
            setLoadError(null)
        } catch (error) {
            if (requestId !== requestIdRef.current) return

            setLoadError(error instanceof Error ? error.message : '笔记加载失败')
            if (showLoading) setLoadedDirectoryNodeId(null)
        }
    }, [directoryNodeId])

    useEffect(() => {
        void loadNoteDetail(true)

        return () => {
            requestIdRef.current += 1
        }
    }, [loadNoteDetail])

    if (loadError && loadedDirectoryNodeId !== directoryNodeId) {
        return (
            <div className="grid h-full place-items-center bg-black px-6 text-center text-rose-300">
                {loadError}
            </div>
        )
    }

    if (loadedDirectoryNodeId !== directoryNodeId) {
        return (
            <div className="grid h-full place-items-center bg-black text-slate-400">
                正在加载笔记…
            </div>
        )
    }

    return (
        <NoteGraph
            key={directoryNodeId}
            graphType="detail"
            noteTitle={noteTitle}
            noteDetail={noteDetail}
            flatTree={flatTree}
            setFlatTree={setFlatTree}
            allowOperate
            onExitEdit={() => void loadNoteDetail(false)}
        />
    )
}

export default NoteDetail

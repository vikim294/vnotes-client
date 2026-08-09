import { useEffect, useState } from 'react'

import { type NodeData, type NoteDetailData } from '../../types'
import { useParams, useSearchParams, useNavigate } from 'react-router'
import { API_BASE_URL, authFetch } from '../../api'
import NoteGraph from '../../components/NoteGraph'

function NoteDetail() {
    const [flatTree, setFlatTree] = useState<NodeData[]>([])
    const [allowOperate, setAllowOperate] = useState(true)

    // data related
    const { id: directoryNodeId } = useParams()
    const [searchParams] = useSearchParams()
    const navigate = useNavigate()
    const noteTitle = searchParams.get('label') || 'Untitled Note'
    const [noteDetail, setNoteDetail] = useState<NoteDetailData | null>({
        directoryNodeId: Number(directoryNodeId)
    })

    const getNoteDetail = async () => {
        const response = await authFetch(`${API_BASE_URL}/note/directory/${directoryNodeId}/detail-nodes`)
        const res = await response.json()
        if (res.code === 0) {
            // const isShared = res.data.isShared

            // if (!isShared) {
            //     navigate('/unauthorized')
            //     return
            // }

            setAllowOperate(true)

            console.log(res.data)


            setFlatTree(
                res.data.map((node: NodeData) => ({
                    ...node,
                    x: node.x,
                    y: node.y,
                    // imageWidth: Number(node.imageWidth),
                    // imageHeight: Number(node.imageHeight),
                }))
            )
        }
    }

    useEffect(() => {
        if (directoryNodeId) {
            // fetch note detail
            getNoteDetail()
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [directoryNodeId])

    return (
        <NoteGraph
            graphType="detail"
            noteTitle={noteTitle}
            noteDetail={noteDetail}
            flatTree={flatTree}
            setFlatTree={setFlatTree}
            allowOperate={allowOperate}
            onExitEdit={getNoteDetail}
        />
    )
}

export default NoteDetail

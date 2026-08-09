import { useEffect, useState } from 'react'
import NoteGraph from '../../components/NoteGraph'
import { API_BASE_URL, authFetch } from '../../api'
import type { NodeData } from '../../types'

export default function NoteList() {
    const [flatTree, setFlatTree] = useState<NodeData[]>([])

    const getNotes = async () => {
        const response = await authFetch(`${API_BASE_URL}/note/directory`)
        const res = await response.json()
        if (res.code === 0) {
            setFlatTree(
                res.data.map((node: NodeData) => ({
                    ...node,
                    x: node.x,
                    y: node.y,
                }))
            )
        }
    }

    useEffect(() => {
        getNotes()
    }, [])

    return (
        <NoteGraph
            graphType="directory"
            flatTree={flatTree}
            setFlatTree={setFlatTree}
            onExitEdit={getNotes}
        />
    )
}

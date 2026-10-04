import { useEffect, useState } from 'react'
import NoteGraph from '../../components/NoteGraph'
import GraphLoadingScreen from '../../components/GraphLoadingScreen'
import { API_BASE_URL, authFetch } from '../../api'
import type { NodeData } from '../../types'

export default function NoteList() {
    const [flatTree, setFlatTree] = useState<NodeData[]>([])
    const [isDataLoaded, setIsDataLoaded] = useState(false)

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
            setIsDataLoaded(true)
        }
    }

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        void getNotes()
    }, [])

    if (!isDataLoaded) {
        return (
            <GraphLoadingScreen
                title="正在加载目录"
                description="正在准备你的笔记画布"
            />
        )
    }

    return (
        <NoteGraph
            graphType="directory"
            flatTree={flatTree}
            setFlatTree={setFlatTree}
            onExitEdit={getNotes}
        />
    )
}

import { createPortal } from 'react-dom'
import { Trash2, Pencil, Plus, Link, Unlink, Bookmark, Share2, ArrowRightLeft } from 'lucide-react'
import Button from './Button'
import {
    use,
    useImperativeHandle,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
    type Dispatch,
    type SetStateAction,
} from 'react'
import PaperContext from '../context/paperContext'

/**
 * NodeMenuExpose - 暴露给父组件的接口
 * 用于从外部控制菜单位置
 */
export interface NodeMenuExpose {
    setPosition: Dispatch<SetStateAction<{ x: number; y: number }>>
}

/**
 * NodeMenuProps - 节点菜单组件属性
 * @property ref - 用于暴露 setPosition 方法给父组件
 * @property visible - 控制菜单显示/隐藏
 * @property onEdit - 编辑节点内容回调
 * @property onAddChild - 添加子节点回调
 * @property onSetParent - 设置父节点回调
 * @property onDisconnectFromParent - 断开与父节点连接回调
 * @property onOpenMark - 打开标记设置弹窗（仅 detail 图可用）
 * @property onToggleShare - 切换分享状态回调（仅 directory 图可用）
 * @property onDelete - 删除节点回调
 * @property onClose - 关闭菜单回调
 */
interface NodeMenuProps {
    ref: React.RefObject<NodeMenuExpose | null>
    visible: boolean
    onEdit: () => void
    onAddChild: () => void
    onSetParent: () => void
    onDisconnectFromParent: () => void
    onOpenMark: () => void
    onToggleShare: () => void
    onMoveTo?: () => void
    onDelete: () => void
    onClose: () => void
}

/**
 * NodeMenu - 节点右键菜单组件
 *
 * 功能说明：
 * - 显示在点击位置附近的浮动菜单
 * - 提供节点编辑、添加子节点、设置父节点等操作
 * - 使用 Portal 渲染到 document.body，避免被父容器裁剪
 * - 点击菜单外部区域自动关闭
 *
 * 使用场景：
 * - 在树形图的节点上右键点击时弹出
 * - directory 图和 detail 图都支持，但分享功能仅在 directory 图可用
 */
export default function NodeMenu({
    ref,
    visible,
    onEdit,
    onAddChild,
    onSetParent,
    onDisconnectFromParent,
    onOpenMark,
    onToggleShare,
    onMoveTo,
    onDelete,
    onClose,
}: NodeMenuProps) {
    // 从 PaperContext 获取当前画布状态和选中的节点信息
    const paperContext = use(PaperContext)
    const graphType = paperContext?.graphType
    const flatTree = paperContext?.flatTree
    const selectedNodeId = paperContext?.selectedNodeId
    const nodemenuElRef = useRef<HTMLDivElement | null>(null)

    /**
     * 根据 selectedNodeId 从 flatTree 中查找当前选中的节点
     * 用于判断节点类型（是否为 detail 节点）和标记状态
     */
    const selectedNode = useMemo(() => {
        return flatTree?.find((node) => node.id === selectedNodeId)
    }, [flatTree, selectedNodeId])

    // 菜单位置状态，由父组件通过 ref 控制
    const [position, setPosition] = useState<{ x: number; y: number }>({
        x: 0,
        y: 0,
    })

    /**
     * 暴露 setPosition 方法给父组件
     * 父组件可以通过 ref.current?.setPosition({x, y}) 来移动菜单位置
     */
    useImperativeHandle(
        ref,
        () => ({
            setPosition,
        }),
        []
    )

    useLayoutEffect(() => {
        if (nodemenuElRef.current) {
            const menuRect = nodemenuElRef.current.getBoundingClientRect()
            const viewportWidth = window.innerWidth
            const viewportHeight = window.innerHeight
            const padding = 8 // 视口边缘留白

            let adjustedX = position.x
            let adjustedY = position.y

            // 检测右边界溢出
            if (position.x + menuRect.width > viewportWidth - padding) {
                adjustedX = viewportWidth - menuRect.width - padding
            }

            // 检测下边界溢出
            if (position.y + menuRect.height > viewportHeight - padding) {
                adjustedY = viewportHeight - menuRect.height - padding
            }

            // 确保不会超出左上角
            adjustedX = Math.max(padding, adjustedX)
            adjustedY = Math.max(padding, adjustedY)

            // 直接更新 DOM，避免 setState 导致的级联渲染
            nodemenuElRef.current.style.left = `${adjustedX}px`
            nodemenuElRef.current.style.top = `${adjustedY}px`
        }
    }, [position])

    // 菜单不可见时不渲染任何内容
    if (!visible) return null

    return createPortal(
        // 全屏透明遮罩层，点击时关闭菜单
        <div className="fixed top-0 right-0 bottom-0 left-0" onPointerDown={onClose}>
            {/* 菜单容器，定位在点击位置 */}
            <div
                className={`bg-plain fixed`}
                style={{ top: position.y, left: position.x }}
                onPointerDown={(e) => e.stopPropagation()} // 阻止事件冒泡，防止点击菜单时关闭
                ref={nodemenuElRef}
            >
                {/* 图片节点暂不支持替换图片，只能在画布上调整位置和大小。 */}
                {selectedNode?.contentType !== 'IMAGE' && (
                    <Button className="block w-full" onClick={onEdit}>
                        <div className="flex items-center gap-2">
                            <Pencil className="h-4 w-4" />
                            edit text
                        </div>
                    </Button>
                )}
                {selectedNode?.nodeType !== 'DETAIL' && (
                    // 非 detail 节点才能新增子结点
                    // detail 节点是叶子节点，不允许有子节点
                    <Button className="block w-full" onClick={onAddChild}>
                        <div className="flex items-center gap-2">
                            <Plus className="h-4 w-4" />
                            add child node
                        </div>
                    </Button>
                )}
                {/* 设置父节点 - 用于重新组织树的结构 */}
                <Button className="block w-full" onClick={onSetParent}>
                    <div className="flex items-center gap-2">
                        <Link className="h-4 w-4" />
                        set parent node
                    </div>
                </Button>
                {/* 断开与父节点的连接 - 将节点变为根节点 */}
                <Button className="block w-full" onClick={onDisconnectFromParent}>
                    <div className="flex items-center gap-2">
                        <Unlink className="h-4 w-4" />
                        disconnect from parent
                    </div>
                </Button>
                {/* Move to — only in detail graph */}
                {graphType === 'detail' && (
                    <Button className="block w-full" onClick={onMoveTo}>
                        <div className="flex items-center gap-2">
                            <ArrowRightLeft className="h-4 w-4" />
                            move to
                        </div>
                    </Button>
                )}
                {/* 标记功能 - 仅在 detail 视图中可用，且图片节点不支持标记 */}
                {graphType === 'detail' && selectedNode?.contentType !== 'IMAGE' && (
                    <Button className="block w-full" onClick={onOpenMark}>
                        <div className="flex items-center gap-2">
                            <Bookmark
                                className="h-4 w-4"
                                fill={selectedNode?.markType ? 'currentColor' : 'none'}
                            />
                            mark
                        </div>
                    </Button>
                )}
                {/* 分享功能 - 仅在 directory 视图中的 detail 节点上显示 */}
                {graphType === 'directory' && selectedNode?.nodeType === 'DETAIL' && (
                    <Button className="block w-full" onClick={onToggleShare}>
                        <div className="flex items-center gap-2">
                            <Share2 className="h-4 w-4" />
                            {selectedNode?.isShared ? 'unshare' : 'share'}
                        </div>
                    </Button>
                )}
                {/* 删除节点 - 危险操作，使用 danger 样式 */}
                <Button type="danger" className="block w-full" onClick={onDelete}>
                    <div className="flex items-center gap-2">
                        <Trash2 className="h-4 w-4" />
                        delete
                    </div>
                </Button>
            </div>
        </div>,
        document.body // 使用 Portal 渲染到 body，避免被父容器裁剪
    )
}

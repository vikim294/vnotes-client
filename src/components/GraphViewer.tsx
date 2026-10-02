import {
    forwardRef,
    useCallback,
    useEffect,
    useImperativeHandle,
    useLayoutEffect,
    useRef,
    useState,
    type ReactNode,
} from 'react'
import { RotateCcw } from 'lucide-react'

import { getDistanceBetweenTwoPoints } from '../lib'
import type { NodeData } from '../types'
import NoteTree from './NoteTree'

export interface StoredGraphViewport {
    x: number
    y: number
    zoom: number
}

export interface GraphViewport extends StoredGraphViewport {
    width: number
    height: number
}

interface ViewportTransitionOptions {
    animated?: boolean
    duration?: number
}

interface CenterOnOptions extends ViewportTransitionOptions {
    zoom?: number
}

export interface GraphViewerHandle {
    resetView: (options?: ViewportTransitionOptions) => void
    centerOn: (x: number, y: number, options?: CenterOnOptions) => void
    getViewport: () => GraphViewport
}

interface GraphViewerProps {
    nodes: NodeData[]
    panFromNodes?: boolean
    initialViewport?: StoredGraphViewport | null
    initialCenter?: { x: number; y: number } | null
    resetOnMount?: boolean
    showResetView?: boolean
    renderNode?: (node: NodeData) => ReactNode
    onViewportChange?: (viewport: GraphViewport) => void
    onViewportCommit?: (viewport: StoredGraphViewport) => void
    onResetView?: () => void
}

interface GestureInfo {
    type: 'none' | 'panning' | 'pinchAndZoom'
    startX1: number
    startY1: number
    startX2: number
    startY2: number
    startD: number
    centerPointX: number
    centerPointY: number
    viewportStartX: number
    viewportStartY: number
    viewportStartZoom: number
}

const toStoredViewport = (viewport: GraphViewport): StoredGraphViewport => ({
    x: viewport.x,
    y: viewport.y,
    zoom: viewport.zoom,
})

const DEFAULT_VIEWPORT_ANIMATION_DURATION = 360

const easeOutCubic = (progress: number) => 1 - Math.pow(1 - progress, 3)

const lerp = (start: number, end: number, progress: number) =>
    start + (end - start) * progress

const GraphViewer = forwardRef<GraphViewerHandle, GraphViewerProps>(function GraphViewer(
    {
        nodes,
        panFromNodes = false,
        initialViewport = null,
        initialCenter = null,
        resetOnMount = false,
        showResetView = true,
        renderNode,
        onViewportChange,
        onViewportCommit,
        onResetView,
    },
    ref
) {
    const [paperSize, setPaperSize] = useState({ width: 0, height: 0 })
    const [viewport, setViewport] = useState<GraphViewport>({
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        zoom: 1,
    })
    const viewportRef = useRef(viewport)
    const containerRef = useRef<HTMLDivElement>(null)
    const paperRef = useRef<SVGSVGElement>(null)
    const hasInitializedRef = useRef(false)
    const hasAppliedInitialViewportRef = useRef(false)
    const wheelCommitTimerRef = useRef<number | null>(null)
    const viewportAnimationFrameRef = useRef<number | null>(null)
    const onViewportCommitRef = useRef(onViewportCommit)
    const gestureInfo = useRef<GestureInfo>({
        type: 'none',
        startX1: 0,
        startY1: 0,
        startX2: 0,
        startY2: 0,
        startD: 0,
        centerPointX: 0,
        centerPointY: 0,
        viewportStartX: 0,
        viewportStartY: 0,
        viewportStartZoom: 1,
    })

    useLayoutEffect(() => {
        viewportRef.current = viewport
        onViewportChange?.(viewport)
    }, [onViewportChange, viewport])

    useLayoutEffect(() => {
        onViewportCommitRef.current = onViewportCommit
    }, [onViewportCommit])

    const commitViewport = useCallback((nextViewport: StoredGraphViewport) => {
        onViewportCommitRef.current?.(nextViewport)
    }, [])

    const cancelViewportAnimation = useCallback(() => {
        if (viewportAnimationFrameRef.current === null) return
        window.cancelAnimationFrame(viewportAnimationFrameRef.current)
        viewportAnimationFrameRef.current = null
    }, [])

    const moveViewportTo = useCallback(
        (targetViewport: GraphViewport, options: ViewportTransitionOptions = {}) => {
            cancelViewportAnimation()
            if (wheelCommitTimerRef.current !== null) {
                window.clearTimeout(wheelCommitTimerRef.current)
                wheelCommitTimerRef.current = null
            }

            // 系统启用“减少动态效果”时自动退化为立即定位
            const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
            const duration = options.duration ?? DEFAULT_VIEWPORT_ANIMATION_DURATION
            if (!options.animated || reduceMotion || duration <= 0) {
                viewportRef.current = targetViewport
                setViewport(targetViewport)
                commitViewport(toStoredViewport(targetViewport))
                return
            }

            const startViewport = viewportRef.current
            const startedAt = performance.now()

            const animate = (now: number) => {
                const progress = Math.min((now - startedAt) / duration, 1)
                const easedProgress = easeOutCubic(progress)
                const zoom = lerp(startViewport.zoom, targetViewport.zoom, easedProgress)
                const nextViewport: GraphViewport = {
                    x: lerp(startViewport.x, targetViewport.x, easedProgress),
                    y: lerp(startViewport.y, targetViewport.y, easedProgress),
                    width: paperSize.width * zoom,
                    height: paperSize.height * zoom,
                    zoom,
                }

                viewportRef.current = nextViewport
                setViewport(nextViewport)

                if (progress < 1) {
                    viewportAnimationFrameRef.current = window.requestAnimationFrame(animate)
                    return
                }

                viewportAnimationFrameRef.current = null
                viewportRef.current = targetViewport
                setViewport(targetViewport)
                commitViewport(toStoredViewport(targetViewport))
            }

            viewportAnimationFrameRef.current = window.requestAnimationFrame(animate)
        },
        [cancelViewportAnimation, commitViewport, paperSize]
    )

    const resetView = useCallback((options: ViewportTransitionOptions = {}) => {
        const firstRootNode = nodes.find((node) => node.parentId === null)
        const nextViewport: GraphViewport = firstRootNode
            ? {
                  width: paperSize.width,
                  height: paperSize.height,
                  zoom: 1,
                  x: firstRootNode.x - paperSize.width / 2,
                  y: firstRootNode.y - paperSize.height / 2,
              }
            : {
                  width: paperSize.width,
                  height: paperSize.height,
                  zoom: 1,
                  x: 0,
                  y: 0,
              }

        moveViewportTo(nextViewport, options)
    }, [moveViewportTo, nodes, paperSize])

    const centerOn = useCallback(
        (x: number, y: number, options: CenterOnOptions = {}) => {
            if (paperSize.width <= 0 || paperSize.height <= 0) return
            const zoom = (options.zoom ?? viewportRef.current.zoom) || 1

            const nextViewport: GraphViewport = {
                x: x - (paperSize.width * zoom) / 2,
                y: y - (paperSize.height * zoom) / 2,
                width: paperSize.width * zoom,
                height: paperSize.height * zoom,
                zoom,
            }
            moveViewportTo(nextViewport, options)
        },
        [moveViewportTo, paperSize]
    )

    useImperativeHandle(
        ref,
        () => ({
            resetView,
            centerOn,
            getViewport: () => viewportRef.current,
        }),
        [centerOn, resetView]
    )

    // Debounced save for zoom operations (pinch/zoom and wheel)
    const scheduleViewportCommit = useCallback(
        (nextViewport: StoredGraphViewport) => {
            if (wheelCommitTimerRef.current !== null) {
                window.clearTimeout(wheelCommitTimerRef.current)
            }
            wheelCommitTimerRef.current = window.setTimeout(() => {
                wheelCommitTimerRef.current = null
                commitViewport(nextViewport)
            }, 300)
        },
        [commitViewport]
    )

    useLayoutEffect(() => {
        const updateSize = () => {
            const container = containerRef.current
            if (!container) return

            const { width, height } = container.getBoundingClientRect()
            if (width <= 0 || height <= 0) return

            cancelViewportAnimation()
            setPaperSize({ width, height })
            setViewport((previous) => ({
                ...previous,
                width,
                height,
            }))
        }

        updateSize()
        const resizeObserver = new ResizeObserver(updateSize)
        if (containerRef.current) resizeObserver.observe(containerRef.current)

        return () => resizeObserver.disconnect()
    }, [cancelViewportAnimation])

    // init viewport
    useEffect(() => {
        if (hasInitializedRef.current || paperSize.width <= 0 || paperSize.height <= 0) return
        if (nodes.length === 0) return

        hasInitializedRef.current = true
        let didApplyViewport = false
        const timer = window.setTimeout(() => {
            didApplyViewport = true
            hasAppliedInitialViewportRef.current = true
            if (initialCenter) {
                centerOn(initialCenter.x, initialCenter.y, { zoom: 1 })
                return
            }
            if (!resetOnMount && initialViewport) {
                setViewport({
                    x: initialViewport.x,
                    y: initialViewport.y,
                    zoom: initialViewport.zoom,
                    width: paperSize.width * initialViewport.zoom,
                    height: paperSize.height * initialViewport.zoom,
                })
                return
            }

            resetView()
        }, 0)

        return () => {
            window.clearTimeout(timer)
            if (!didApplyViewport) hasInitializedRef.current = false
        }
    }, [centerOn, initialCenter, initialViewport, nodes.length, paperSize, resetOnMount, resetView])

    // panning and pinch & zoom
    useEffect(() => {
        const paperElement = paperRef.current
        const gesture = gestureInfo.current

        const onPointerDown = (event: PointerEvent) => {
            cancelViewportAnimation()
            if (!panFromNodes && event.target !== paperElement) return

            // return if it's not left click
            if (event.pointerType === 'mouse' && event.button !== 0) return

            if (panFromNodes) paperElement?.setPointerCapture(event.pointerId)

            if (event.isPrimary) {
                gesture.type = 'panning'
                gesture.startX1 = event.clientX
                gesture.startY1 = event.clientY
                return
            }

            gesture.type = 'pinchAndZoom'
            gesture.startX2 = event.clientX
            gesture.startY2 = event.clientY

            const currentViewport = viewportRef.current
            const firstPointer = { x: gesture.startX1, y: gesture.startY1 }
            const secondPointer = { x: gesture.startX2, y: gesture.startY2 }
            gesture.startD = getDistanceBetweenTwoPoints(firstPointer, secondPointer)
            const paperRect = paperElement?.getBoundingClientRect()
            gesture.centerPointX =
                (firstPointer.x + secondPointer.x) / 2 - (paperRect?.left ?? 0)
            gesture.centerPointY =
                (firstPointer.y + secondPointer.y) / 2 - (paperRect?.top ?? 0)
            gesture.viewportStartX = currentViewport.x
            gesture.viewportStartY = currentViewport.y
            gesture.viewportStartZoom = currentViewport.zoom
        }

        const onPointerMove = (event: PointerEvent) => {
            if (gesture.type === 'panning') {
                const deltaX = event.clientX - gesture.startX1
                const deltaY = event.clientY - gesture.startY1
                gesture.startX1 = event.clientX
                gesture.startY1 = event.clientY

                setViewport((previous) => ({
                    ...previous,
                    x: previous.x - deltaX * previous.zoom,
                    y: previous.y - deltaY * previous.zoom,
                }))
                return
            }

            if (gesture.type !== 'pinchAndZoom') return

            let firstPointer = { x: event.clientX, y: event.clientY }
            let secondPointer = { x: event.clientX, y: event.clientY }
            if (event.isPrimary) {
                secondPointer = { x: gesture.startX2, y: gesture.startY2 }
                // 更新 gestureData
                gesture.startX1 = event.clientX
                gesture.startY1 = event.clientY
            } else {
                firstPointer = { x: gesture.startX1, y: gesture.startY1 }
                // 更新 gestureData
                gesture.startX2 = event.clientX
                gesture.startY2 = event.clientY
            }

            const distance = getDistanceBetweenTwoPoints(firstPointer, secondPointer)

            // startD: newD = startZoom: newZoom
            const ratio = distance / gesture.startD
            // zoom in or zoom out
            const nextZoom = ratio === 1 ? gesture.viewportStartZoom : gesture.viewportStartZoom / ratio
            if (!Number.isFinite(nextZoom) || nextZoom === 0) return

            // the position ratio of pointer in the paper
            const ratioX = gesture.centerPointX / paperSize.width
            const ratioY = gesture.centerPointY / paperSize.height
            const deltaX = paperSize.width * -(nextZoom - gesture.viewportStartZoom) * ratioX
            const deltaY = paperSize.height * -(nextZoom - gesture.viewportStartZoom) * ratioY

            setViewport({
                x: gesture.viewportStartX + deltaX,
                y: gesture.viewportStartY + deltaY,
                width: paperSize.width * nextZoom,
                height: paperSize.height * nextZoom,
                zoom: nextZoom,
            })
        }

        const onPointerUp = () => {
            if (gesture.type === 'panning' || gesture.type === 'pinchAndZoom') {
                commitViewport(toStoredViewport(viewportRef.current))
            }
            gesture.type = 'none'
        }

        const preventTouchScroll = (event: TouchEvent) => {
            // Allow link clicks - don't prevent default if touching a link
            const target = event.target as HTMLElement
            if (target.tagName === 'a' || target.closest('a')) return
            event.preventDefault()
        }

        // https://javascript.info/default-browser-action#the-passive-handler-option
        // The optional passive: true option of addEventListener signals the browser that the handler is not going to call preventDefault().
        // For some browsers (Firefox, Chrome), passive is true by default for touchstart and touchmove events.
        // passive: false 使得 e.preventDefault() 能够生效
        paperElement?.addEventListener('touchstart', preventTouchScroll, { passive: false })
        paperElement?.addEventListener('touchmove', preventTouchScroll, { passive: false })
        paperElement?.addEventListener('pointerdown', onPointerDown)
        paperElement?.addEventListener('pointermove', onPointerMove)
        paperElement?.addEventListener('pointerup', onPointerUp)

        return () => {
            paperElement?.removeEventListener('touchstart', preventTouchScroll)
            paperElement?.removeEventListener('touchmove', preventTouchScroll)
            paperElement?.removeEventListener('pointerdown', onPointerDown)
            paperElement?.removeEventListener('pointermove', onPointerMove)
            paperElement?.removeEventListener('pointerup', onPointerUp)
        }
    }, [cancelViewportAnimation, commitViewport, panFromNodes, paperSize])

    // zooming
    useEffect(() => {
        const paperElement = paperRef.current

        const onWheel = (event: WheelEvent) => {
            // console.log(e);
            cancelViewportAnimation()
            setViewport((previous) => {
                let nextZoom = previous.zoom
                if (event.deltaY < 0) {
                    // up -> zoom in
                    nextZoom /= 1.1
                } else if (event.deltaY > 0) {
                    // down -> zoom out
                    nextZoom *= 1.1
                }

                // console.log(newZoom)

                // the position ratio of pointer in the paper
                const paperRect = paperElement?.getBoundingClientRect()
                const ratioX = (event.clientX - (paperRect?.left ?? 0)) / paperSize.width
                const ratioY = (event.clientY - (paperRect?.top ?? 0)) / paperSize.height
                const deltaX = paperSize.width * -(nextZoom - previous.zoom) * ratioX
                const deltaY = paperSize.height * -(nextZoom - previous.zoom) * ratioY
                const nextViewport = {
                    x: previous.x + deltaX,
                    y: previous.y + deltaY,
                    width: paperSize.width * nextZoom,
                    height: paperSize.height * nextZoom,
                    zoom: nextZoom,
                }

                scheduleViewportCommit(toStoredViewport(nextViewport))
                return nextViewport
            })
        }

        paperElement?.addEventListener('wheel', onWheel)
        return () => paperElement?.removeEventListener('wheel', onWheel)
    }, [cancelViewportAnimation, paperSize, scheduleViewportCommit])

    useEffect(() => {
        return () => {
            cancelViewportAnimation()
            if (wheelCommitTimerRef.current !== null) {
                window.clearTimeout(wheelCommitTimerRef.current)
            }
            if (!hasAppliedInitialViewportRef.current) return
            commitViewport(toStoredViewport(viewportRef.current))
        }
    }, [cancelViewportAnimation, commitViewport])

    return (
        <div ref={containerRef} className="relative h-full w-full overflow-hidden">
            <svg
                ref={paperRef}
                data-testid="note-graph"
                width={paperSize.width}
                height={paperSize.height}
                // ⭐ viewBox 会先应用 x 和 y，然后才应用 width 和 height
                // viewBox 的效果：以 (x, y) 为左上角，显示 width × height 区域，并投影到 svg 画布上
                viewBox={`${viewport.x} ${viewport.y} ${viewport.width} ${viewport.height}`}
                onContextMenu={(event) => event.preventDefault()}
            >
                <NoteTree flatTree={nodes} renderNode={renderNode} />
            </svg>
            {showResetView && (
                <div className="absolute top-4 right-4 select-none">
                    <button
                        type="button"
                        onClick={() => {
                            onResetView?.()
                            resetView({ animated: true })
                        }}
                        className="grid h-10 w-10 cursor-pointer place-items-center rounded-full bg-slate-900/60 text-slate-400 shadow-lg backdrop-blur-sm transition-colors hover:bg-slate-800/75 hover:text-indigo-300"
                        title="重置视图"
                        aria-label="重置视图"
                    >
                        <RotateCcw className="h-6 w-6" strokeWidth={1} />
                    </button>
                </div>
            )}
        </div>
    )
})

export default GraphViewer

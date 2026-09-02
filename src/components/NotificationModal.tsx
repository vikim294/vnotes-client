import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Bell, Clock3, Inbox, LoaderCircle, RotateCcw, X } from 'lucide-react'
import { getNotifications, type Notification } from '../api'

interface NotificationModalProps {
    isOpen: boolean
    onClose: () => void
}

const formatNotificationTime = (value: string) => {
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

export default function NotificationModal({ isOpen, onClose }: NotificationModalProps) {
    const [notifications, setNotifications] = useState<Notification[]>([])
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [refreshKey, setRefreshKey] = useState(0)

    useEffect(() => {
        if (!isOpen) return

        const controller = new AbortController()
        const timer = window.setTimeout(() => {
            setIsLoading(true)
            setError(null)

            void getNotifications(controller.signal)
                .then(setNotifications)
                .catch((requestError: unknown) => {
                    if (
                        requestError instanceof DOMException &&
                        requestError.name === 'AbortError'
                    ) {
                        return
                    }

                    setNotifications([])
                    setError(
                        requestError instanceof Error
                            ? requestError.message
                            : '消息通知加载失败'
                    )
                })
                .finally(() => {
                    if (!controller.signal.aborted) setIsLoading(false)
                })
        }, 0)

        return () => {
            window.clearTimeout(timer)
            controller.abort()
        }
    }, [isOpen, refreshKey])

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape' && isOpen) onClose()
        }

        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [isOpen, onClose])

    if (!isOpen) return null

    return createPortal(
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
            onPointerDown={onClose}
        >
            <section
                role="dialog"
                aria-modal="true"
                aria-labelledby="notification-modal-title"
                className="border-surface-700 bg-surface-900 flex max-h-[min(80vh,720px)] w-full max-w-xl flex-col overflow-hidden rounded-xl border shadow-2xl"
                onPointerDown={(event) => event.stopPropagation()}
            >
                <header className="border-surface-700 flex items-center justify-between border-b px-6 py-4">
                    <div className="flex items-center gap-3">
                        <span className="grid h-9 w-9 place-items-center rounded-lg bg-indigo-500/10 text-indigo-300">
                            <Bell className="h-5 w-5" aria-hidden="true" />
                        </span>
                        <div>
                            <h3
                                id="notification-modal-title"
                                className="text-lg font-semibold text-slate-100"
                            >
                                消息通知
                            </h3>
                            <p className="text-xs text-slate-500">查看来自 VNotes 的站内消息</p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="grid h-9 w-9 cursor-pointer place-items-center rounded-lg text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-100"
                        aria-label="关闭消息通知"
                        title="关闭"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </header>

                <div className="min-h-60 overflow-y-auto px-6 py-5">
                    {isLoading ? (
                        <div className="flex min-h-56 flex-col items-center justify-center gap-3 text-sm text-slate-400">
                            <LoaderCircle className="h-7 w-7 animate-spin text-indigo-400" />
                            正在加载消息通知
                        </div>
                    ) : error ? (
                        <div className="flex min-h-56 flex-col items-center justify-center gap-4 text-center">
                            <p className="text-sm text-slate-400">{error}</p>
                            <button
                                type="button"
                                onClick={() => setRefreshKey((current) => current + 1)}
                                className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-sm text-slate-200 transition-colors hover:border-indigo-500/70 hover:text-indigo-200"
                            >
                                <RotateCcw className="h-4 w-4" />
                                重新加载
                            </button>
                        </div>
                    ) : notifications.length === 0 ? (
                        <div className="flex min-h-56 flex-col items-center justify-center gap-3 text-center">
                            <span className="grid h-14 w-14 place-items-center rounded-full bg-slate-800 text-slate-500">
                                <Inbox className="h-7 w-7" />
                            </span>
                            <div>
                                <p className="text-sm font-medium text-slate-300">暂无消息通知</p>
                                <p className="mt-1 text-xs text-slate-500">新的站内消息会显示在这里</p>
                            </div>
                        </div>
                    ) : (
                        <div className="grid gap-3">
                            {notifications.map((notification) => (
                                <article
                                    key={notification.id}
                                    className="rounded-xl border border-slate-700 bg-slate-800/50 px-4 py-4"
                                >
                                    <h4 className="break-words text-sm font-semibold text-slate-100">
                                        {notification.title}
                                    </h4>
                                    <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-300">
                                        {notification.content}
                                    </p>
                                    <time
                                        dateTime={notification.createdAt}
                                        className="mt-3 flex items-center gap-1.5 text-xs text-slate-500"
                                    >
                                        <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
                                        {formatNotificationTime(notification.createdAt)}
                                    </time>
                                </article>
                            ))}
                        </div>
                    )}
                </div>
            </section>
        </div>,
        document.body
    )
}

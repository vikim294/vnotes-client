import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router'
import Button from './Button'

interface MoveSuccessModalProps {
    isOpen: boolean
    onClose: () => void
    targetNoteId: number
    targetNoteLabel: string
}

export default function MoveSuccessModal({ isOpen, onClose, targetNoteId, targetNoteLabel }: MoveSuccessModalProps) {
    const navigate = useNavigate()

    if (!isOpen) return null

    const handleGoToCheck = () => {
        navigate(`/noteDetails/${targetNoteId}?label=${encodeURIComponent(targetNoteLabel)}`)
        onClose()
    }

    return createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <div
                className="bg-surface-900 border-surface-700 w-full max-w-sm rounded-xl border shadow-2xl"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="border-surface-700 border-b px-6 py-4">
                    <h3 className="text-lg font-semibold text-slate-100">节点移动成功</h3>
                </div>
                <div className="bg-surface-800/50 flex justify-end gap-2 rounded-b-xl px-6 py-4">
                    <Button onClick={onClose}>关闭</Button>
                    <Button type="primary" onClick={handleGoToCheck}>前往查看</Button>
                </div>
            </div>
        </div>,
        document.body
    )
}

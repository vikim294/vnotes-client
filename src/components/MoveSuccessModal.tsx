import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router'
import Button from './Button'

interface MoveSuccessModalProps {
    isOpen: boolean
    onClose: () => void
    targetNoteId: number
}

export default function MoveSuccessModal({ isOpen, onClose, targetNoteId }: MoveSuccessModalProps) {
    const navigate = useNavigate()

    if (!isOpen) return null

    const handleGoToCheck = () => {
        navigate(`/noteDetails/${targetNoteId}`, { state: { resetView: true } })
        onClose()
    }

    return createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <div
                className="w-full max-w-sm rounded-xl border border-slate-700/70 bg-slate-950/30 shadow-2xl backdrop-blur-md"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="border-b border-slate-700/60 px-6 py-4">
                    <h3 className="text-lg font-semibold text-slate-100">节点移动成功</h3>
                </div>
                <div className="flex justify-end gap-2 rounded-b-xl border-t border-slate-700/70 bg-black/20 px-6 py-4">
                    <Button onClick={onClose}>关闭</Button>
                    <Button type="primary" onClick={handleGoToCheck}>前往查看</Button>
                </div>
            </div>
        </div>,
        document.body
    )
}

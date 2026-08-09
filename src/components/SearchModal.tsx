import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Search, FileText, Folder } from 'lucide-react'
import { debounce } from '../lib'
import { searchNotes, type Note } from '../api'

interface SearchModalProps {
    isOpen: boolean
    onClose: () => void
    onSelectNote: (note: Note) => void
    mode?: 'navigate' | 'select'
    excludeNoteId?: number
}

export default function SearchModal({ isOpen, onClose, onSelectNote, mode = 'navigate', excludeNoteId }: SearchModalProps) {
    const [query, setQuery] = useState('')
    const [results, setResults] = useState<Note[]>([])
    const [isLoading, setIsLoading] = useState(false)
    const inputRef = useRef<HTMLInputElement>(null)

    // Auto-focus input when modal opens
    useEffect(() => {
        if (isOpen) {
            setTimeout(() => {
                inputRef.current?.focus()
            }, 0)
        }
    }, [isOpen])

    // Handle Escape key to close modal
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isOpen) {
                onClose()
            }
        }

        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [isOpen, onClose])

    // Debounced search function
    const debouncedSearch = useMemo(
        () =>
            debounce(async (searchQuery: string) => {
                if (!searchQuery.trim()) {
                    setResults([])
                    setIsLoading(false)
                    return
                }

                setIsLoading(true)
                const notes = await searchNotes(searchQuery)
                setResults(notes)
                setIsLoading(false)
            }, 200),
        []
    )

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value
        setQuery(value)
        debouncedSearch(value)
    }

    // Filter results based on mode
    const filteredResults = useMemo(() => {
        if (mode !== 'select') return results
        return results.filter(
            (note) => note.nodeType === 'DETAIL' && (excludeNoteId === undefined || note.id !== excludeNoteId)
        )
    }, [results, mode, excludeNoteId])

    const handleSelectNote = (note: Note) => {
        onSelectNote(note)
        setQuery('')
        setResults([])
        if (mode !== 'select') {
            onClose()
        }
    }

    const handleClose = () => {
        setQuery('')
        setResults([])
        onClose()
    }

    if (!isOpen) return null

    const hasQuery = query.trim().length > 0
    const showNoResults = hasQuery && !isLoading && filteredResults.length === 0
    const showResults = hasQuery && filteredResults.length > 0

    return createPortal(
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 pt-20">
            <div
                className="bg-surface-900 border-surface-700 flex max-h-[70vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border shadow-2xl"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header with search input */}
                <div className="border-surface-700 flex items-center gap-3 border-b px-4 py-3">
                    <Search className="h-5 w-5 text-slate-400" />
                    <input
                        ref={inputRef}
                        type='TEXT'
                        value={query}
                        onChange={handleInputChange}
                        placeholder={mode === 'select' ? 'Search for a note to move to...' : 'Search notes...'}
                        className="bg-surface-900 flex-1 text-base text-slate-100 outline-none placeholder:text-slate-500"
                    />
                    <button
                        onClick={handleClose}
                        className="cursor-pointer rounded p-1 text-slate-400 transition-colors hover:bg-slate-700 hover:text-slate-200"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {/* Results area */}
                <div className="overflow-y-auto">
                    {!hasQuery && (
                        <div className="px-4 py-8 text-center text-sm text-slate-500">
                            Start typing to search for notes
                        </div>
                    )}

                    {isLoading && (
                        <div className="px-4 py-8 text-center text-sm text-slate-500">
                            Searching...
                        </div>
                    )}

                    {showNoResults && (
                        <div className="px-4 py-8 text-center text-sm text-slate-500">
                            No notes found
                        </div>
                    )}

                    {showResults && (
                        <ul className="py-2">
                            {filteredResults.map((note, index) => (
                                <li
                                    key={note.id}
                                    className={
                                        index !== filteredResults.length - 1
                                            ? 'border-surface-700 border-b'
                                            : ''
                                    }
                                >
                                    <button
                                        onClick={() => handleSelectNote(note)}
                                        className="hover:bg-surface-800 flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left text-slate-200 transition-colors"
                                    >
                                        {note.nodeType === 'DETAIL' ? (
                                            <FileText className="h-4 w-4 shrink-0 text-emerald-400" />
                                        ) : (
                                            <Folder className="h-4 w-4 shrink-0 text-blue-400" />
                                        )}
                                        <span className="flex-1 truncate">{note.label}</span>
                                        {note.nodeType === 'DETAIL' && (
                                            <span className="text-xs text-emerald-400">detail</span>
                                        )}
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </div>
        </div>,
        document.body
    )
}

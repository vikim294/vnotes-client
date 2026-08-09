import type { NodeType } from "./types"

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:2940/api'
export const IMAGE_BASE_URL = import.meta.env.VITE_IMAGE_BASE_URL || 'http://localhost:2940'

export function authFetch(url: string, init?: RequestInit): Promise<Response> {
    const token = localStorage.getItem('vnotes-token')
    return fetch(url, {
        ...init,
        headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...init?.headers,
        },
    }).then((response) => {
        if (response.status === 401) {
            localStorage.removeItem('vnotes-token')
            window.location.href = '/login'
        }
        return response
    })
}

export interface Note {
    id: number
    label: string
    x: number
    y: number
    parentId: number | null
    parentUuid: string | null
    uuid: string
    userId: number
    nodeType: NodeType
    isShared?: boolean
    createdAt: string
    updatedAt: string
}

export async function verifyToken(token: string): Promise<boolean> {
    try {
        const response = await fetch(`${API_BASE_URL}/auth/verify`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ token }),
        })
        return response.ok
    } catch {
        return false
    }
}

export async function searchNotes(keyword: string): Promise<Note[]> {
    const response = await authFetch(
        `${API_BASE_URL}/notes/search?keyword=${encodeURIComponent(keyword)}`
    )
    const res = await response.json()
    if (res.code === 0) {
        return res.data as Note[]
    }
    return []
}

export async function toggleNoteShare(noteId: number): Promise<{ isShared: boolean } | null> {
    try {
        const response = await authFetch(`${API_BASE_URL}/notes/share`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ noteId }),
        })
        const res = await response.json()
        if (res.code === 0) {
            return res.data as { isShared: boolean }
        }
        return null
    } catch {
        return null
    }
}

export async function moveNode(
    nodeId: number,
    targetNoteId: number
): Promise<{ movedCount: number } | null> {
    const response = await authFetch(`${API_BASE_URL}/noteNodes/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nodeId, targetNoteId }),
    })
    const res = await response.json()
    if (res.code === 0) {
        return res.data as { movedCount: number }
    }
    return null
}

import type { NodeType } from "./types"

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL
export const IMAGE_BASE_URL = import.meta.env.VITE_IMAGE_BASE_URL

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

export interface UserProfile {
    id: number
    username: string
    email: string
    avatarUrl: string | null
    createdAt: string
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

export async function uploadUserAvatar(file: File): Promise<string> {
    const formData = new FormData()
    formData.append('file', file)

    const response = await authFetch(`${API_BASE_URL}/user/avatar`, {
        method: 'POST',
        body: formData,
    })
    const res = await response.json()

    if (!response.ok || res.code !== 0 || typeof res.data?.url !== 'string') {
        throw new Error(res.message || '头像上传失败')
    }

    return res.data.url
}

export async function getUserProfile(): Promise<UserProfile> {
    const response = await authFetch(`${API_BASE_URL}/user/profile`)
    const res = await response.json()

    if (!response.ok || res.code !== 0 || !res.data) {
        throw new Error(res.message || '个人资料加载失败')
    }

    return res.data as UserProfile
}

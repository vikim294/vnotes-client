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
    nodeType: NodeType
    createdAt: string
    updatedAt: string
}

export interface DirectorySearchParams {
    keyword?: string
    nodeType?: NodeType
    startTime?: string
    endTime?: string
    page: number
    pageSize: number
}

export interface PageResponse<T> {
    list: T[]
    page: number
    pageSize: number
    total: number
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

export async function searchDirectoryNodes(
    params: DirectorySearchParams,
    signal?: AbortSignal
): Promise<PageResponse<Note>> {
    const searchParams = new URLSearchParams({
        page: String(params.page),
        pageSize: String(params.pageSize),
    })

    if (params.keyword?.trim()) searchParams.set('keyword', params.keyword.trim())
    if (params.nodeType) searchParams.set('nodeType', params.nodeType)
    if (params.startTime) searchParams.set('startTime', params.startTime)
    if (params.endTime) searchParams.set('endTime', params.endTime)

    const response = await authFetch(`${API_BASE_URL}/note/directory/search?${searchParams}`, {
        signal,
    })
    const res = await response.json()

    if (!response.ok || res.code !== 0 || !res.data) {
        throw new Error(res.message || '搜索失败')
    }

    return res.data as PageResponse<Note>
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

export async function exportNotesAsJson(): Promise<{ blob: Blob; filename: string }> {
    const response = await authFetch(`${API_BASE_URL}/note/export/json`)

    if (!response.ok) {
        throw new Error('笔记导出失败')
    }

    const contentDisposition = response.headers.get('Content-Disposition')
    const filenameMatch = contentDisposition?.match(/filename="?([^";]+)"?/i)

    return {
        blob: await response.blob(),
        filename: filenameMatch?.[1] ?? 'notes.json',
    }
}

export type ImportStrategy = 'APPEND' | 'CLEAR'

export async function importNotesFromJson(
    file: File,
    strategy: ImportStrategy = 'APPEND'
): Promise<void> {
    const formData = new FormData()
    formData.append('file', file)

    const searchParams = new URLSearchParams({ strategy })
    const response = await authFetch(
        `${API_BASE_URL}/note/import/json?${searchParams.toString()}`,
        {
            method: 'POST',
            body: formData,
        }
    )
    const res = await response.json()

    if (!response.ok || res.code !== 0) {
        throw new Error(res.message || '笔记导入失败')
    }
}

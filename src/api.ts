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

export interface TrashBinDirectoryNode {
    id: number
    label: string
    x: number
    y: number
    nodeType: NodeType
    createdAt: string
    updatedAt: string
    deletedAt: string
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

export interface Notification {
    id: number
    type: string
    title: string
    content: string
    hasRead: boolean
    createdAt: string
}

export interface LoginResult {
    accessToken: string
    tokenType: string
    expiresIn: number
}

export interface OAuthTokenResult {
    accessToken: string
}

interface ApiResponse<T> {
    code: number
    message: string
    data: T
}

async function postAuth<T>(path: string, body: unknown): Promise<ApiResponse<T>> {
    const response = await fetch(`${API_BASE_URL}${path}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    })
    const res = (await response.json()) as ApiResponse<T>

    if (!response.ok || res.code !== 0) {
        throw new Error(res.message || '请求失败')
    }

    return res
}

export async function loginByEmailAndPassword(
    email: string,
    password: string
): Promise<ApiResponse<LoginResult>> {
    return postAuth<LoginResult>('/auth/login/email-password', { email, password })
}

export async function sendLoginVerificationCode(email: string): Promise<ApiResponse<void>> {
    return postAuth<void>('/auth/send-verification-code', { email })
}

export async function loginByEmailAndVerificationCode(
    email: string,
    verificationCode: string
): Promise<ApiResponse<LoginResult>> {
    return postAuth<LoginResult>('/auth/login/email-verification-code', {
        email,
        verificationCode,
    })
}

export async function exchangeOAuthLoginCode(
    code: string
): Promise<ApiResponse<OAuthTokenResult>> {
    return postAuth<OAuthTokenResult>('/oauth/token', { code })
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

export async function searchTrashBinNodes(
    params: DirectorySearchParams,
    signal?: AbortSignal
): Promise<PageResponse<TrashBinDirectoryNode>> {
    const searchParams = new URLSearchParams({
        page: String(params.page),
        pageSize: String(params.pageSize),
    })

    if (params.keyword?.trim()) searchParams.set('keyword', params.keyword.trim())
    if (params.nodeType) searchParams.set('nodeType', params.nodeType)
    if (params.startTime) searchParams.set('startTime', params.startTime)
    if (params.endTime) searchParams.set('endTime', params.endTime)

    const response = await authFetch(
        `${API_BASE_URL}/note/directory/trash-bin/search?${searchParams}`,
        { signal }
    )
    const res = await response.json()

    if (!response.ok || res.code !== 0 || !res.data) {
        throw new Error(res.message || '回收站加载失败')
    }

    return res.data as PageResponse<TrashBinDirectoryNode>
}

export async function restoreTrashBinNodes(ids: number[]): Promise<void> {
    const response = await authFetch(
        `${API_BASE_URL}/note/directory/trash-bin/batch-restore`,
        {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ ids }),
        }
    )
    const res = await response.json()

    if (!response.ok || res.code !== 0) {
        throw new Error(res.message || '目录节点恢复失败')
    }
}

export async function permanentlyDeleteTrashBinNodes(ids: number[]): Promise<void> {
    const response = await authFetch(`${API_BASE_URL}/note/directory/trash-bin/batch-delete`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ids }),
    })
    const res = await response.json()

    if (!response.ok || res.code !== 0) {
        throw new Error(res.message || '目录节点彻底删除失败')
    }
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

export async function moveDetailNode(
    oldDirectoryNodeId: number,
    detailNodeId: number,
    destDirectoryNodeId: number
): Promise<void> {
    const response = await authFetch(
        `${API_BASE_URL}/note/directory/${oldDirectoryNodeId}/detail-nodes/move`,
        {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ detailNodeId, destDirectoryNodeId }),
        }
    )
    const res = await response.json()

    if (!response.ok || res.code !== 0) {
        throw new Error(res.message || '详情节点移动失败')
    }
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

export async function getNotifications(signal?: AbortSignal): Promise<Notification[]> {
    const response = await authFetch(`${API_BASE_URL}/notification`, { signal })
    const res = await response.json()

    if (!response.ok || res.code !== 0 || !Array.isArray(res.data)) {
        throw new Error(res.message || '消息通知加载失败')
    }

    return res.data as Notification[]
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

import type { NodeData, NodeType } from "./types"
import { clearAuthSession, getAuthSessionStatus } from './authSession'

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL
export const IMAGE_BASE_URL = import.meta.env.VITE_IMAGE_BASE_URL

export function authFetch(url: string, init?: RequestInit): Promise<Response> {
    const { accessToken, isExpired } = getAuthSessionStatus()

    if (isExpired) {
        window.location.href = '/login'
        return Promise.reject(new Error('登录已过期'))
    }

    return fetch(url, {
        ...init,
        headers: {
            ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
            ...init?.headers,
        },
    }).then((response) => {
        if (response.status === 401) {
            clearAuthSession()
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
    shared: boolean
    tags?: Tag[]
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
    tagIds?: number[]
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

export interface Tag {
    id: number
    name: string
    createdAt?: string
}

export interface SharedNoteData {
    title: string
    tags: Tag[]
    detailNodes: NodeData[]
}

export interface NoteShareDetail {
    id: number
    directoryNodeId: number
    shareToken: string
    status: 'ACTIVE' | 'REVOKED'
    createdAt: string
    updatedAt: string
}

export interface NoteShareAccessLog {
    id: number
    target: 'NOTE' | 'ARTICLE'
    targetLabel: string | null
    visitorId: string | null
    createdAt: string
}

export interface Article {
    id: number
    content: string | null
    createdAt: string
    updatedAt: string
}

export interface LoginResult {
    accessToken: string
    tokenType: string
    expiresIn: number
}

export type OAuthTokenResult = LoginResult

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
    params.tagIds?.forEach((tagId) => searchParams.append('tagIds', String(tagId)))
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

export async function shareNote(directoryNodeId: number): Promise<string> {
    const searchParams = new URLSearchParams({ directoryNodeId: String(directoryNodeId) })
    const response = await authFetch(`${API_BASE_URL}/note/share?${searchParams}`, {
        method: 'POST',
    })
    const res = await response.json()

    if (!response.ok || res.code !== 0 || typeof res.data !== 'string') {
        throw new Error(res.message || '分享笔记失败')
    }

    return res.data
}

export async function unshareNote(directoryNodeId: number): Promise<void> {
    const searchParams = new URLSearchParams({ directoryNodeId: String(directoryNodeId) })
    const response = await authFetch(`${API_BASE_URL}/note/share?${searchParams}`, {
        method: 'PATCH',
    })
    const res = await response.json()

    if (!response.ok || res.code !== 0) {
        throw new Error(res.message || '取消分享失败')
    }
}

export async function getNoteShareDetail(directoryNodeId: number): Promise<NoteShareDetail> {
    const searchParams = new URLSearchParams({ directoryNodeId: String(directoryNodeId) })
    const response = await authFetch(`${API_BASE_URL}/note/share?${searchParams}`)
    const res = (await response.json()) as ApiResponse<NoteShareDetail>

    if (!response.ok || res.code !== 0 || !res.data) {
        throw new Error(res.message || '分享详情加载失败')
    }

    return res.data
}

export async function getNoteShareAccessLogs(
    noteShareId: number
): Promise<NoteShareAccessLog[]> {
    const response = await authFetch(`${API_BASE_URL}/note/share/access-logs/${noteShareId}`)
    const res = (await response.json()) as ApiResponse<NoteShareAccessLog[]>

    if (!response.ok || res.code !== 0 || !Array.isArray(res.data)) {
        throw new Error(res.message || '访问记录加载失败')
    }

    return res.data
}

export async function getSharedNote(
    shareToken: string,
    signal?: AbortSignal
): Promise<SharedNoteData> {
    const { accessToken } = getAuthSessionStatus()
    const request = (token?: string) =>
        fetch(`${API_BASE_URL}/note/shared/note/${encodeURIComponent(shareToken)}`, {
            signal,
            credentials: 'include',
            headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        })

    let response = await request(accessToken ?? undefined)

    // 公开分享允许匿名访问；本地 token 被服务端拒绝时，清理后按匿名请求重试。
    if (response.status === 401 && accessToken && !signal?.aborted) {
        clearAuthSession()
        response = await request()
    }

    const res = (await response.json()) as ApiResponse<SharedNoteData>
    if (!response.ok || res.code !== 0 || !res.data) {
        throw new Error(res.message || '分享笔记加载失败')
    }

    return res.data
}

export async function getSharedArticle(
    detailNodeId: number,
    shareToken: string,
    signal?: AbortSignal
): Promise<Article> {
    const { accessToken } = getAuthSessionStatus()
    const url = `${API_BASE_URL}/note/shared/article/${detailNodeId}/${encodeURIComponent(shareToken)}`
    const request = (token?: string) =>
        fetch(url, {
            signal,
            credentials: 'include',
            headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        })

    let response = await request(accessToken ?? undefined)

    if (response.status === 401 && accessToken && !signal?.aborted) {
        clearAuthSession()
        response = await request()
    }

    const res = (await response.json()) as ApiResponse<Article>
    if (!response.ok || res.code !== 0 || !res.data) {
        throw new Error(res.message || '分享文章加载失败')
    }

    return res.data
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

export async function getArticle(detailNodeId: number): Promise<Article> {
    const response = await authFetch(`${API_BASE_URL}/note/article/${detailNodeId}`)
    const res = (await response.json()) as ApiResponse<Article>

    if (!response.ok || res.code !== 0 || !res.data) {
        throw new Error(res.message || '文章加载失败')
    }

    return res.data
}

export async function updateArticle(detailNodeId: number, content: string): Promise<void> {
    const response = await authFetch(`${API_BASE_URL}/note/article/${detailNodeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
    })
    const res = (await response.json()) as ApiResponse<void>

    if (!response.ok || res.code !== 0) {
        throw new Error(res.message || '文章更新失败')
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

export async function getTags(signal?: AbortSignal): Promise<Tag[]> {
    const response = await authFetch(`${API_BASE_URL}/tag`, { signal })
    const res = await response.json()

    if (!response.ok || res.code !== 0 || !Array.isArray(res.data)) {
        throw new Error(res.message || '标签列表加载失败')
    }

    return res.data as Tag[]
}

export async function createTag(name: string): Promise<void> {
    const response = await authFetch(`${API_BASE_URL}/tag`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
    })
    const res = await response.json()

    if (!response.ok || res.code !== 0) {
        throw new Error(res.message || '标签创建失败')
    }
}

export async function renameTag(id: number, name: string): Promise<void> {
    const response = await authFetch(`${API_BASE_URL}/tag`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, name }),
    })
    const res = await response.json()

    if (!response.ok || res.code !== 0) {
        throw new Error(res.message || '标签重命名失败')
    }
}

export async function deleteTag(id: number): Promise<void> {
    const response = await authFetch(`${API_BASE_URL}/tag/${id}`, {
        method: 'DELETE',
    })
    const res = await response.json()

    if (!response.ok || res.code !== 0) {
        throw new Error(res.message || '标签删除失败')
    }
}

export async function getDirectoryTags(
    directoryNodeId: number,
    signal?: AbortSignal
): Promise<Tag[]> {
    const response = await authFetch(
        `${API_BASE_URL}/note/directory/${directoryNodeId}/tag`,
        { signal }
    )
    const res = await response.json()

    if (!response.ok || res.code !== 0 || !Array.isArray(res.data)) {
        throw new Error(res.message || '笔记标签加载失败')
    }

    return res.data as Tag[]
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

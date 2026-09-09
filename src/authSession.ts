const ACCESS_TOKEN_STORAGE_KEY = 'vnotes-token'
const ACCESS_TOKEN_EXPIRES_AT_STORAGE_KEY = 'vnotes-token-expires-at'
const TOKEN_EXPIRY_BUFFER_MS = 10_000

export interface AuthSessionStatus {
    accessToken: string | null
    isExpired: boolean
}

export function saveAuthSession(accessToken: string, expiresIn: number) {
    if (!accessToken || !Number.isFinite(expiresIn) || expiresIn <= 0) {
        throw new Error('登录凭证或有效期无效')
    }

    const expiresAt = Date.now() + expiresIn * 1000

    localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, accessToken)
    localStorage.setItem(ACCESS_TOKEN_EXPIRES_AT_STORAGE_KEY, String(expiresAt))
}

export function clearAuthSession() {
    localStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY)
    localStorage.removeItem(ACCESS_TOKEN_EXPIRES_AT_STORAGE_KEY)
}

export function getAuthSessionStatus(): AuthSessionStatus {
    const accessToken = localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY)
    const expiresAtValue = localStorage.getItem(ACCESS_TOKEN_EXPIRES_AT_STORAGE_KEY)

    if (!accessToken) {
        if (expiresAtValue) clearAuthSession()
        return { accessToken: null, isExpired: false }
    }

    const expiresAt = expiresAtValue ? Number(expiresAtValue) : Number.NaN
    const isExpired =
        !Number.isFinite(expiresAt) || Date.now() >= expiresAt - TOKEN_EXPIRY_BUFFER_MS

    if (isExpired) {
        clearAuthSession()
        return { accessToken: null, isExpired: true }
    }

    return { accessToken, isExpired: false }
}

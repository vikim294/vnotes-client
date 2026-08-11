import { CalendarDays, Camera, LoaderCircle, Mail, UserRound } from 'lucide-react'
import type { UserProfile } from '../api'

interface ProfilePanelProps {
    profile: UserProfile
    avatarUrl: string | null
    isUploading: boolean
    onAvatarSelect: (event: React.ChangeEvent<HTMLInputElement>) => void
}

export default function ProfilePanel({
    profile,
    avatarUrl,
    isUploading,
    onAvatarSelect,
}: ProfilePanelProps) {
    const createdAt = new Date(profile.createdAt)
    const formattedCreatedAt = Number.isNaN(createdAt.getTime())
        ? profile.createdAt
        : createdAt.toLocaleString('zh-CN', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
          })

    return (
        <div className="py-2">
            <div className="flex flex-col items-center">
                <label
                    className={`group relative grid h-28 w-28 overflow-hidden rounded-full border border-slate-600 bg-slate-800 shadow-lg transition-colors ${
                        isUploading
                            ? 'cursor-wait'
                            : 'cursor-pointer hover:border-indigo-400'
                    }`}
                    aria-label={avatarUrl ? '更换头像' : '点击上传头像'}
                >
                    <input
                        type="file"
                        accept="image/*"
                        className="sr-only"
                        disabled={isUploading}
                        onChange={onAvatarSelect}
                    />

                    {avatarUrl ? (
                        <img
                            src={avatarUrl}
                            alt={`${profile.username} 的头像`}
                            className="h-full w-full object-cover"
                        />
                    ) : (
                        <span className="flex h-full w-full flex-col items-center justify-center gap-2 text-slate-400">
                            <UserRound className="h-9 w-9" strokeWidth={1.5} />
                            <span className="text-xs">点击上传</span>
                        </span>
                    )}

                    {isUploading ? (
                        <span className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-950/75 text-xs text-white">
                            <LoaderCircle className="h-6 w-6 animate-spin" />
                            上传中
                        </span>
                    ) : (
                        avatarUrl && (
                            <span className="absolute inset-0 flex items-center justify-center gap-1.5 bg-slate-950/65 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100">
                                <Camera className="h-4 w-4" />
                                更换头像
                            </span>
                        )
                    )}
                </label>

                <h4 className="mt-4 text-lg font-semibold text-slate-100">
                    {profile.username}
                </h4>
                <p className="mt-1 text-xs text-slate-500">个人账号</p>
            </div>

            <dl className="mt-6 grid gap-3">
                <div className="flex items-center gap-3 rounded-lg border border-slate-700 bg-slate-800/50 px-4 py-3">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-indigo-500/10 text-indigo-300">
                        <UserRound className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                        <dt className="text-xs text-slate-500">用户名</dt>
                        <dd className="truncate text-sm text-slate-200">{profile.username}</dd>
                    </div>
                </div>

                <div className="flex items-center gap-3 rounded-lg border border-slate-700 bg-slate-800/50 px-4 py-3">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-indigo-500/10 text-indigo-300">
                        <Mail className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                        <dt className="text-xs text-slate-500">邮箱</dt>
                        <dd className="truncate text-sm text-slate-200">{profile.email}</dd>
                    </div>
                </div>

                <div className="flex items-center gap-3 rounded-lg border border-slate-700 bg-slate-800/50 px-4 py-3">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-indigo-500/10 text-indigo-300">
                        <CalendarDays className="h-4 w-4" />
                    </span>
                    <div>
                        <dt className="text-xs text-slate-500">注册时间</dt>
                        <dd className="text-sm text-slate-200">{formattedCreatedAt}</dd>
                    </div>
                </div>
            </dl>
        </div>
    )
}

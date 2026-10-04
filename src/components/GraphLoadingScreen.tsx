import { LoaderCircle } from 'lucide-react'

interface GraphLoadingScreenProps {
    title: string
    description: string
}

export default function GraphLoadingScreen({
    title,
    description,
}: GraphLoadingScreenProps) {
    return (
        <div className="relative grid h-full place-items-center overflow-hidden bg-black px-6">
            <div
                className="pointer-events-none absolute h-64 w-64 rounded-full bg-indigo-500/5 blur-3xl"
                aria-hidden="true"
            />
            <div className="relative flex flex-col items-center gap-4 text-center" role="status">
                <span className="text-indigo-300">
                    <LoaderCircle
                        className="h-10 w-10 animate-spin"
                        strokeWidth={1.25}
                        aria-hidden="true"
                    />
                </span>
                <span>
                    <span className="block text-sm font-medium text-slate-200">{title}</span>
                    <span className="mt-1.5 block text-xs text-slate-500">{description}</span>
                </span>
            </div>
        </div>
    )
}

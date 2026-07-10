import { Skeleton } from "@/components/ui/skeleton"

export function ManuscriptSkeleton() {
  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg p-4 border border-slate-200">
        <Skeleton className="h-5 w-48 mb-3" />
        <div className="flex gap-4">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-32" />
        </div>
      </div>
      <div className="grid grid-cols-5 gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="bg-white rounded-lg p-4 border border-slate-200 space-y-2">
            <Skeleton className="h-5 w-20" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        ))}
      </div>
    </div>
  )
}

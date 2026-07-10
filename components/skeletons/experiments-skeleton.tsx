import { Skeleton } from "@/components/ui/skeleton"

export function ExperimentsSkeleton() {
  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg p-4 border border-slate-200">
        <Skeleton className="h-5 w-48 mb-3" />
        <div className="flex gap-4">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-32" />
        </div>
      </div>
      <div className="bg-white rounded-lg p-6 border border-slate-200 space-y-4">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-32 w-full rounded-md" />
        <div className="flex gap-2">
          <Skeleton className="h-10 w-32 rounded-md" />
        </div>
      </div>
    </div>
  )
}

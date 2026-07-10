import { Skeleton } from "@/components/ui/skeleton"

export function DataSkeleton() {
  return (
    <div className="space-y-6">
      <div className="border-2 border-dashed border-slate-200 rounded-lg p-12 flex flex-col items-center gap-3">
        <Skeleton className="h-12 w-12 rounded-full" />
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-4 w-32" />
      </div>
    </div>
  )
}

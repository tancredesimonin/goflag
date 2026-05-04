import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Loading state for /inspect — mirrors the real layout so the LCP shift on
 * route transition is small.
 */
export function InspectSkeleton() {
  return (
    <div className="flex flex-col gap-6" data-testid="inspect-skeleton">
      <Card className="border-border/60">
        <CardContent className="flex flex-col gap-4 p-6">
          <div className="flex flex-wrap gap-2">
            <Skeleton className="h-5 w-16" />
            <Skeleton className="h-5 w-20" />
            <Skeleton className="h-5 w-64" />
          </div>
          <Skeleton className="h-7 w-2/3" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        </CardContent>
      </Card>
      <Skeleton className="h-9 w-full" />
      <Card className="border-border/60">
        <CardContent className="flex flex-col gap-2 p-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-6 w-full" />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

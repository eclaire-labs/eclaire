export default function Loading() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Header skeleton */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="h-10 w-10 bg-muted rounded"></div>
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 bg-muted rounded"></div>
            <div>
              <div className="h-8 w-48 bg-muted rounded mb-2"></div>
              <div className="h-4 w-32 bg-muted rounded"></div>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-10 w-24 bg-muted rounded"></div>
          <div className="h-10 w-20 bg-muted rounded"></div>
          <div className="h-10 w-16 bg-muted rounded"></div>
        </div>
      </div>

      {/* Content skeleton */}
      <div className="space-y-4 border rounded-lg p-6">
        <div className="space-y-4">
          <div className="space-y-2">
            <div className="h-4 w-12 bg-muted rounded"></div>
            <div className="h-6 w-64 bg-muted rounded"></div>
          </div>
          <div className="space-y-2">
            <div className="h-4 w-20 bg-muted rounded"></div>
            <div className="h-20 w-full bg-muted rounded"></div>
          </div>
          <div className="space-y-2">
            <div className="h-4 w-12 bg-muted rounded"></div>
            <div className="flex gap-2">
              <div className="h-6 w-16 bg-muted rounded"></div>
              <div className="h-6 w-20 bg-muted rounded"></div>
            </div>
          </div>
        </div>

        {/* File info skeleton */}
        <div className="bg-muted/30 rounded-lg p-4 space-y-3">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 bg-muted rounded"></div>
            <div className="flex-1">
              <div className="h-4 w-32 bg-muted rounded mb-2"></div>
              <div className="h-3 w-24 bg-muted rounded"></div>
            </div>
            <div className="h-8 w-20 bg-muted rounded"></div>
          </div>
        </div>
      </div>

      {/* Metadata skeleton */}
      <div className="space-y-4 border rounded-lg p-6">
        <div className="h-6 w-32 bg-muted rounded"></div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <div className="h-4 w-16 bg-muted rounded mb-2"></div>
            <div className="h-4 w-32 bg-muted rounded"></div>
          </div>
          <div>
            <div className="h-4 w-20 bg-muted rounded mb-2"></div>
            <div className="h-4 w-32 bg-muted rounded"></div>
          </div>
          <div>
            <div className="h-4 w-16 bg-muted rounded mb-2"></div>
            <div className="h-4 w-28 bg-muted rounded"></div>
          </div>
          <div>
            <div className="h-4 w-16 bg-muted rounded mb-2"></div>
            <div className="h-4 w-20 bg-muted rounded"></div>
          </div>
          <div>
            <div className="h-4 w-24 bg-muted rounded mb-2"></div>
            <div className="h-4 w-36 bg-muted rounded"></div>
          </div>
          <div>
            <div className="h-4 w-20 bg-muted rounded mb-2"></div>
            <div className="h-4 w-40 bg-muted rounded"></div>
          </div>
        </div>
      </div>
    </div>
  );
}

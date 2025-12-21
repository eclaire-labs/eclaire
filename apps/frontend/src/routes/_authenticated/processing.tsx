import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";

const ProcessingPage = lazy(() => import("@/components/pages/ProcessingPage"));

const validAssetTypes = ["photos", "documents", "bookmarks", "notes"] as const;
type AssetType = (typeof validAssetTypes)[number];

interface ProcessingSearchParams {
  assetType?: AssetType;
  assetId?: string;
}

function PageLoading() {
  return (
    <div className="flex items-center justify-center p-8">
      <Skeleton className="h-8 w-32" />
    </div>
  );
}

export const Route = createFileRoute("/_authenticated/processing")({
  validateSearch: (search: Record<string, unknown>): ProcessingSearchParams => {
    const assetType = search.assetType as string | undefined;
    const assetId = search.assetId as string | undefined;

    const result: ProcessingSearchParams = {};

    if (assetType && validAssetTypes.includes(assetType as AssetType)) {
      result.assetType = assetType as AssetType;
    }
    if (assetId && typeof assetId === "string") {
      result.assetId = assetId;
    }

    return result;
  },
  component: () => (
    <Suspense fallback={<PageLoading />}>
      <ProcessingPage />
    </Suspense>
  ),
});

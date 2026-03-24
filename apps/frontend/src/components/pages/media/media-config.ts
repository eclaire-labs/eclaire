import type { ListPageConfig } from "@/hooks/use-list-page-state";
import type { Media } from "@/types/media";

export const mediaConfig: ListPageConfig<Media> = {
  pageType: "media",
  contentType: "media",
  entityName: "media",
  entityNamePlural: "Media",
  sortOptions: [
    { value: "createdAt", label: "Date Added" },
    { value: "title", label: "Title" },
    { value: "duration", label: "Duration" },
  ],
  groupableSortKeys: [],
  getGroupDate: () => null,
};

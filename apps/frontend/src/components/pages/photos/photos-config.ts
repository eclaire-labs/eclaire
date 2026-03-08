import type { ListPageConfig } from "@/hooks/use-list-page-state";
import type { Photo } from "@/types/photo";

export const photosConfig: ListPageConfig<Photo> = {
  pageType: "photos",
  contentType: "photos",
  entityName: "photo",
  entityNamePlural: "Photos",

  sortOptions: [
    { value: "dateTaken", label: "Date Taken" },
    { value: "createdAt", label: "Date Added" },
    { value: "title", label: "Title" },
  ],

  groupableSortKeys: ["dateTaken"],

  getGroupDate: (item, sortBy) => {
    if (sortBy === "dateTaken") return item.dateTaken ?? item.createdAt;
    return null;
  },
};

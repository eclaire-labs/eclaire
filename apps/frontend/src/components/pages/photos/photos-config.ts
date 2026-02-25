import type { ListPageConfig } from "@/hooks/use-list-page-state";
import { getTimestamp } from "@/lib/list-page-utils";
import type { Photo } from "@/types/photo";

export const photosConfig: ListPageConfig<Photo> = {
  pageType: "photos",
  contentType: "photos",
  entityName: "photo",
  entityNamePlural: "Photos",

  getSearchableText: (item) => [
    item.title,
    item.description ?? "",
    item.originalFilename,
    item.cameraMake ?? "",
    item.cameraModel ?? "",
    item.locationCity ?? "",
    item.locationCountryName ?? "",
    ...item.tags,
  ],

  sortOptions: [
    {
      value: "dateTaken",
      label: "Date Taken",
      compareFn: (a, b, dir) => {
        const timeA = getTimestamp(a.dateTaken) || getTimestamp(a.createdAt);
        const timeB = getTimestamp(b.dateTaken) || getTimestamp(b.createdAt);
        let diff = timeA - timeB;
        // If primary dates are equal, use createdAt as secondary sort
        if (diff === 0) {
          diff = getTimestamp(a.createdAt) - getTimestamp(b.createdAt);
        }
        return dir === "asc" ? diff : -diff;
      },
    },
    {
      value: "createdAt",
      label: "Date Added",
      compareFn: (a, b, dir) => {
        const diff = getTimestamp(a.createdAt) - getTimestamp(b.createdAt);
        return dir === "asc" ? diff : -diff;
      },
    },
    {
      value: "title",
      label: "Title",
      compareFn: (a, b, dir) => {
        const cmp = a.title.toLowerCase().localeCompare(b.title.toLowerCase());
        return dir === "asc" ? cmp : -cmp;
      },
    },
    {
      value: "location",
      label: "Location",
      compareFn: (a, b, dir) => {
        const locA =
          `${a.locationCity ?? ""}${a.locationCountryName ?? ""}`.toLowerCase();
        const locB =
          `${b.locationCity ?? ""}${b.locationCountryName ?? ""}`.toLowerCase();
        let cmp = locA.localeCompare(locB);
        if (cmp === 0) {
          // Fallback to title if locations are same/empty
          cmp = a.title.toLowerCase().localeCompare(b.title.toLowerCase());
        }
        return dir === "asc" ? cmp : -cmp;
      },
    },
  ],

  groupableSortKeys: ["dateTaken"],

  getGroupDate: (item, sortBy) => {
    if (sortBy === "dateTaken") return item.dateTaken ?? item.createdAt;
    return null;
  },
};

import type { ListPageConfig } from "@/hooks/use-list-page-state";
import type { Bookmark } from "@/types/bookmark";

export const getDomainFromUrl = (url: string): string => {
  try {
    return new URL(url).hostname.replace("www.", "");
  } catch (_e) {
    return url;
  }
};

export const bookmarksConfig: ListPageConfig<Bookmark> = {
  pageType: "bookmarks",
  contentType: "bookmarks",
  entityName: "bookmark",
  entityNamePlural: "Bookmarks",

  sortOptions: [
    { value: "createdAt", label: "Date Added" },
    { value: "title", label: "Title" },
  ],

  groupableSortKeys: ["createdAt"],

  getGroupDate: (item, sortBy) => {
    if (sortBy === "createdAt") return item.createdAt;
    return null;
  },
};

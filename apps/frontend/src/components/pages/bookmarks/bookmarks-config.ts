import type { ListPageConfig } from "@/hooks/use-list-page-state";
import { getTimestamp } from "@/lib/list-page-utils";
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

  getSearchableText: (item) => [
    item.title ?? "",
    item.url,
    item.description ?? "",
    item.extractedText ?? "",
    ...item.tags,
  ],

  sortOptions: [
    {
      value: "createdAt",
      label: "Date Added",
      compareFn: (a, b, dir) => {
        const diff = getTimestamp(a.createdAt) - getTimestamp(b.createdAt);
        const result =
          diff ||
          (a.title ?? "")
            .toLowerCase()
            .localeCompare((b.title ?? "").toLowerCase());
        return dir === "asc" ? result : -result;
      },
    },
    {
      value: "title",
      label: "Title",
      compareFn: (a, b, dir) => {
        const cmp = (a.title ?? "")
          .toLowerCase()
          .localeCompare((b.title ?? "").toLowerCase());
        return dir === "asc" ? cmp : -cmp;
      },
    },
    {
      value: "url",
      label: "Domain",
      compareFn: (a, b, dir) => {
        const cmp = getDomainFromUrl(a.url)
          .toLowerCase()
          .localeCompare(getDomainFromUrl(b.url).toLowerCase());
        return dir === "asc" ? cmp : -cmp;
      },
    },
  ],

  groupableSortKeys: ["createdAt"],

  getGroupDate: (item, sortBy) => {
    if (sortBy === "createdAt") return item.createdAt;
    return null;
  },
};

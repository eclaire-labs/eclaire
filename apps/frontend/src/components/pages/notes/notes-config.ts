import type { ListPageConfig } from "@/hooks/use-list-page-state";
import { getTimestamp } from "@/lib/list-page-utils";
import type { Note } from "@/types/note";

export const notesConfig: ListPageConfig<Note> = {
  pageType: "notes",
  contentType: "notes",
  entityName: "note",
  entityNamePlural: "Notes",

  getSearchableText: (item) => [
    item.title,
    item.content ?? "",
    ...item.tags,
  ],

  sortOptions: [
    {
      value: "date",
      label: "Date",
      compareFn: (a, b, dir) => {
        const diff = getTimestamp(a.createdAt) - getTimestamp(b.createdAt);
        const result = diff || a.title.toLowerCase().localeCompare(b.title.toLowerCase());
        return dir === "asc" ? result : -result;
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
      value: "content",
      label: "Content Length",
      compareFn: (a, b, dir) => {
        const diff = (a.content ?? "").length - (b.content ?? "").length;
        const result = diff || a.title.toLowerCase().localeCompare(b.title.toLowerCase());
        return dir === "asc" ? result : -result;
      },
    },
  ],

  groupableSortKeys: ["date"],

  getGroupDate: (item, sortBy) => {
    if (sortBy === "date") return item.createdAt;
    return null;
  },
};

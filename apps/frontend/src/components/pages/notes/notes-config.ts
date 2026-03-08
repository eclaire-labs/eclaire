import type { ListPageConfig } from "@/hooks/use-list-page-state";
import type { Note } from "@/types/note";

export const notesConfig: ListPageConfig<Note> = {
  pageType: "notes",
  contentType: "notes",
  entityName: "note",
  entityNamePlural: "Notes",

  sortOptions: [
    { value: "createdAt", label: "Date" },
    { value: "title", label: "Title" },
  ],

  groupableSortKeys: ["createdAt"],

  getGroupDate: (item, sortBy) => {
    if (sortBy === "createdAt") return item.createdAt;
    return null;
  },
};

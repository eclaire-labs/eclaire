import type { ListPageConfig } from "@/hooks/use-list-page-state";
import { getTimestamp } from "@/lib/list-page-utils";
import type { Task, TaskStatus } from "@/types/task";

const STATUS_ORDER: Record<TaskStatus, number> = {
  "not-started": 1,
  "in-progress": 2,
  completed: 3,
};

export const tasksConfig: ListPageConfig<Task> = {
  pageType: "tasks",
  contentType: "tasks",
  entityName: "task",
  entityNamePlural: "Tasks",

  getSearchableText: (item) => [
    item.title,
    item.description ?? "",
    ...item.tags,
  ],

  extraFilters: [
    {
      key: "status",
      label: "Status",
      initialValue: "all",
      matchFn: (item, value) => value === "all" || item.status === value,
    },
    {
      key: "assignee",
      label: "Assignee",
      initialValue: "all",
      matchFn: (item, value) => value === "all" || item.assignedToId === value,
    },
  ],

  sortOptions: [
    {
      value: "dueDate",
      label: "Due Date",
      compareFn: (a, b, dir) => {
        const timeA = getTimestamp(a.dueDate);
        const timeB = getTimestamp(b.dueDate);
        const validA = timeA !== 0;
        const validB = timeB !== 0;

        // Place null/invalid dates after valid dates regardless of direction
        if (validA && !validB) return -1;
        if (!validA && validB) return 1;
        if (!validA && !validB) {
          return a.title.toLowerCase().localeCompare(b.title.toLowerCase());
        }

        const diff = timeA - timeB;
        return dir === "asc" ? diff : -diff;
      },
    },
    {
      value: "status",
      label: "Status",
      compareFn: (a, b, dir) => {
        const orderA = STATUS_ORDER[a.status as TaskStatus] ?? 99;
        const orderB = STATUS_ORDER[b.status as TaskStatus] ?? 99;
        const diff = orderA - orderB;
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
      value: "assignedToId",
      label: "Assignee",
      compareFn: (a, b, dir) => {
        const aVal = (a.assignedToId ?? "").toLowerCase();
        const bVal = (b.assignedToId ?? "").toLowerCase();
        const cmp = aVal.localeCompare(bVal);
        return dir === "asc" ? cmp : -cmp;
      },
    },
  ],

  groupableSortKeys: ["dueDate"],

  getGroupDate: (item, sortBy) => {
    if (sortBy === "dueDate") return item.dueDate;
    return null;
  },
};

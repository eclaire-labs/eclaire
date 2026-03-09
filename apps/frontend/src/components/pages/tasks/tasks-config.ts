import type { ListPageConfig } from "@/hooks/use-list-page-state";
import type { Task } from "@/types/task";

export const tasksConfig: ListPageConfig<Task> = {
  pageType: "tasks",
  contentType: "tasks",
  entityName: "task",
  entityNamePlural: "Tasks",

  extraFilters: [
    {
      key: "status",
      label: "Status",
      initialValue: "all",
    },
    {
      key: "priority",
      label: "Priority",
      initialValue: "all",
    },
    {
      key: "assignee",
      label: "Assignee",
      initialValue: "all",
    },
  ],

  sortOptions: [
    { value: "dueDate", label: "Due Date" },
    { value: "status", label: "Status" },
    { value: "priority", label: "Priority" },
    { value: "title", label: "Title" },
  ],

  groupableSortKeys: ["dueDate"],

  getGroupDate: (item, sortBy) => {
    if (sortBy === "dueDate") return item.dueDate;
    return null;
  },
};

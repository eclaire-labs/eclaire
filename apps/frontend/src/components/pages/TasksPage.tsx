import { getRouteApi, useNavigate } from "@tanstack/react-router";
import { CheckSquare, Loader2, Plus } from "lucide-react";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { GroupedItemList, ListPageLayout } from "@/components/list-page";
import { ActorPicker } from "@/components/shared/ActorPicker";
import { DueDatePicker } from "@/components/shared/due-date-picker";
import { TagEditor } from "@/components/shared/TagEditor";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import type { ListParams } from "@/hooks/create-crud-hooks";
import { useAuth } from "@/hooks/use-auth";
import { useInfiniteScroll } from "@/hooks/use-infinite-scroll";
import { useListKeyboardNavigation } from "@/hooks/use-list-keyboard-navigation";
import { useListPageState } from "@/hooks/use-list-page-state";
import { useActors } from "@/hooks/use-actors";
import { useTags } from "@/hooks/use-tags";
import { useTasks } from "@/hooks/use-tasks";
import type { Task, TaskStatus } from "@/types/task";
import { CreateTaskDialog } from "./tasks/CreateTaskDialog";
import { TaskListItem } from "./tasks/TaskListItem";
import { TaskTileItem } from "./tasks/TaskTileItem";
import {
  PRIORITY_OPTIONS,
  STATUS_OPTIONS,
  getNextStatus,
} from "./tasks/task-utils";
import { tasksConfig } from "./tasks/tasks-config";

const routeApi = getRouteApi("/_authenticated/tasks/");

// ---------------------------------------------------------------------------
// Page Component
// ---------------------------------------------------------------------------

export default function TasksPage() {
  const navigate = useNavigate();
  const { openDialog } = routeApi.useSearch();
  const { data: auth } = useAuth();

  // Saved views — quick filter presets
  const savedViews = useMemo(
    () => [
      { key: "all", label: "All", params: {} },
      {
        key: "my-tasks",
        label: "Assigned to Me",
        params: { delegateMode: "manual" },
      },
      {
        key: "agent-tasks",
        label: "Agent Tasks",
        params: { delegateMode: "assist,handle" },
      },
      {
        key: "needs-review",
        label: "Needs Review",
        params: { attentionStatus: "needs_review" },
      },
      {
        key: "recurring",
        label: "Recurring",
        params: { scheduleType: "recurring" },
      },
      {
        key: "done",
        label: "Done",
        params: { taskStatus: "completed" },
      },
    ],
    [],
  );
  const [activeView, setActiveView] = useState("all");

  const [params, setParams] = useState<ListParams>({ topLevelOnly: "true" });

  // Data
  const {
    tasks,
    isLoading,
    error,
    updateTask,
    updateTaskStatus,
    deleteTask,
    createTask,
    refresh,
    isUpdating,
    isDeleting,
    totalCount,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = useTasks(params);

  const { data: allTags = [] } = useTags("tasks");
  const { actors } = useActors(["human", "agent"]);

  // Current user ID
  const currentUserId = auth?.user?.id || "";

  // Build assignee list from actors with task-driven fallback for stale assignments.
  const allAssignees: Array<{ id: string; name: string; userType: string }> =
    useMemo(() => {
      const assigneeSet = new Set<string>();
      const assigneeList: Array<{
        id: string;
        name: string;
        userType: string;
      }> = [];

      actors.forEach((actor) => {
        if (!assigneeSet.has(actor.id)) {
          assigneeSet.add(actor.id);
          assigneeList.push({
            id: actor.id,
            name: actor.label,
            userType: actor.legacyUserType,
          });
        }
      });

      tasks.forEach((task) => {
        const assigneeId = task.delegateActorId;
        if (assigneeId && !assigneeSet.has(assigneeId)) {
          assigneeSet.add(assigneeId);
          assigneeList.push({
            id: assigneeId,
            name: assigneeId,
            userType: "user",
          });
        }
      });

      return assigneeList.sort((a, b) => {
        if (a.userType !== b.userType) {
          return a.userType === "assistant" ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      });
    }, [actors, tasks]);

  // Shared list page state
  const state = useListPageState(tasks, allTags, tasksConfig, {
    refresh,
    deleteItem: deleteTask,
  });

  useEffect(() => {
    setParams(state.serverParams);
  }, [state.serverParams]);

  const { sentinelRef } = useInfiniteScroll({
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  });

  // Page-specific state
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [isTaskDialogOpen, setIsTaskDialogOpen] = useState(false);
  const [isNewTaskDialogOpen, setIsNewTaskDialogOpen] = useState(false);
  const [newTaskDefaultAssignee, setNewTaskDefaultAssignee] = useState<
    string | undefined
  >(undefined);
  const containerRef = useRef<HTMLElement | null>(null);

  // Error toast
  useEffect(() => {
    if (error) {
      toast.error("Error Loading Tasks", {
        description:
          error instanceof Error ? error.message : "Failed to load tasks",
      });
    }
  }, [error]);

  // Handle URL parameter to open dialog with AI Assistant
  useEffect(() => {
    if (openDialog === "ai" && allAssignees.length > 0) {
      const aiAssistant = allAssignees.find(
        (user) => user.userType === "assistant",
      );
      if (aiAssistant) {
        setNewTaskDefaultAssignee(aiAssistant.id);
      }
      setIsNewTaskDialogOpen(true);
      navigate({ to: "/tasks", replace: true });
    }
  }, [openDialog, allAssignees, navigate]);

  // Keyboard navigation
  const { handleKeyDown } = useListKeyboardNavigation(
    state.focusedIndex,
    state.setFocusedIndex,
    containerRef,
    {
      itemCount: state.sortedItems.length,
      viewMode: state.viewMode,
      onSelect: (idx) => {
        const item = state.sortedItems[idx];
        if (item) handleTaskClick(item);
      },
      onEdit: (idx) => {
        const item = state.sortedItems[idx];
        if (item) openEditDialog(item);
      },
      onDelete: (idx) => {
        const item = state.sortedItems[idx];
        if (item) state.openDeleteDialog(item.id, item.title);
      },
    },
  );

  // Navigation
  const handleTaskClick = useCallback(
    (task: Task) => {
      navigate({ to: `/tasks/${task.id}` });
    },
    [navigate],
  );

  const openEditDialog = useCallback((task: Task) => {
    setEditingTask(task);
    setIsTaskDialogOpen(true);
  }, []);

  // Edit dialog handlers
  const handleEditInputChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >,
  ) => {
    const { name, value } = e.target;
    setEditingTask((prev) => (prev ? { ...prev, [name]: value } : null));
  };

  const handleEditSelectChange = (name: keyof Task, value: string) => {
    setEditingTask((prev) => (prev ? { ...prev, [name]: value } : null));
  };

  // Status cycling
  const handleStatusChange = useCallback(
    async (taskId: string, currentStatus: TaskStatus) => {
      const nextStatus = getNextStatus(currentStatus);
      try {
        await updateTaskStatus(taskId, nextStatus);
      } catch (err) {
        console.error("Error updating task status:", err);
      }
    },
    [updateTaskStatus],
  );

  // Create task
  const handleCreateTask = async (taskData: Omit<Task, "id">) => {
    if (!taskData.title) {
      toast.error("Error", {
        description: "Task title is required.",
      });
      return;
    }

    try {
      const taskToSend = {
        ...taskData,
        ...(taskData.dueAt && {
          dueAt: new Date(taskData.dueAt).toISOString(),
        }),
        taskStatus: taskData.taskStatus || "open",
        ...(taskData.delegateActorId?.trim() && {
          delegateActorId: taskData.delegateActorId,
        }),
        ...(taskData.description && { description: taskData.description }),
      };

      // Remove null/undefined fields
      for (const key of Object.keys(taskToSend)) {
        if (
          taskToSend[key as keyof typeof taskToSend] === null ||
          taskToSend[key as keyof typeof taskToSend] === undefined ||
          taskToSend[key as keyof typeof taskToSend] === ""
        ) {
          delete taskToSend[key as keyof typeof taskToSend];
        }
      }

      await createTask(taskToSend);
      setIsNewTaskDialogOpen(false);
      toast.success("Task Created", {
        description: `"${taskToSend.title}" added.`,
      });
    } catch (err) {
      console.error("Error creating task:", err);
    }
  };

  // Update task
  const handleUpdateTask = async () => {
    if (!editingTask) return;

    if (!editingTask.title) {
      toast.error("Error", {
        description: "Task title cannot be empty.",
      });
      return;
    }

    try {
      const taskToSend = {
        ...editingTask,
        ...(editingTask.dueAt && {
          dueDate: new Date(editingTask.dueAt).toISOString(),
        }),
        taskStatus: editingTask.taskStatus || "open",
        ...(editingTask.delegateActorId && {
          assigneeActorId: editingTask.delegateActorId,
        }),
        ...(editingTask.description && {
          description: editingTask.description,
        }),
      };

      // Remove null/undefined fields
      for (const key of Object.keys(taskToSend)) {
        if (
          taskToSend[key as keyof typeof taskToSend] === null ||
          taskToSend[key as keyof typeof taskToSend] === undefined ||
          taskToSend[key as keyof typeof taskToSend] === ""
        ) {
          delete taskToSend[key as keyof typeof taskToSend];
        }
      }

      const { id, ...updateData } = taskToSend;

      await updateTask(editingTask.id, updateData);

      setIsTaskDialogOpen(false);
      setEditingTask(null);

      toast.success("Task Updated", {
        description: `"${editingTask.title}" saved.`,
      });
    } catch (err) {
      console.error("Error updating task:", err);
    }
  };

  // Current user for avatars
  const currentUser = useMemo(() => {
    if (!auth?.user) {
      return undefined;
    }

    const displayName =
      "displayName" in auth.user && typeof auth.user.displayName === "string"
        ? auth.user.displayName
        : auth.user.name;
    const fullName =
      "fullName" in auth.user && typeof auth.user.fullName === "string"
        ? auth.user.fullName
        : auth.user.name;
    const avatarUrl =
      "avatarUrl" in auth.user && typeof auth.user.avatarUrl === "string"
        ? auth.user.avatarUrl
        : auth.user.image;

    return {
      id: auth.user.id,
      displayName: displayName || null,
      userType: "user" as const,
      email: auth.user.email || "",
      fullName: fullName || null,
      avatarUrl: avatarUrl || null,
    };
  }, [auth?.user]);

  // Build dynamic extra-filter options for the layout
  const assigneeOptions = useMemo(() => {
    const opts: Array<{ value: string; label: string }> = [
      { value: "all", label: "All Assignees" },
    ];
    for (const a of allAssignees) {
      opts.push({ value: a.id, label: a.name });
    }
    return opts;
  }, [allAssignees]);

  const extraFiltersForLayout = useMemo(
    () => [
      {
        key: "taskStatus",
        label: "Status",
        value: state.extraFilters.taskStatus ?? "all",
        onChange: (v: string) => state.setExtraFilter("taskStatus", v),
        options: [{ value: "all", label: "All Statuses" }, ...STATUS_OPTIONS],
      },
      {
        key: "priority",
        label: "Priority",
        value: state.extraFilters.priority ?? "all",
        onChange: (v: string) => state.setExtraFilter("priority", v),
        options: [
          { value: "all", label: "All Priorities" },
          ...PRIORITY_OPTIONS,
        ],
      },
      {
        key: "assignee",
        label: "Assignee",
        value: state.extraFilters.assignee ?? "all",
        onChange: (v: string) => state.setExtraFilter("assignee", v),
        options: assigneeOptions,
      },
    ],
    [state, assigneeOptions],
  );

  // Render callbacks for GroupedItemList
  const renderTileItem = useCallback(
    (task: Task, index: number) => (
      <TaskTileItem
        key={task.id}
        task={task}
        index={index}
        isFocused={index === state.focusedIndex}
        onClick={() => handleTaskClick(task)}
        onEditClick={openEditDialog}
        onStatusChange={handleStatusChange}
        onDeleteClick={(t) => state.openDeleteDialog(t.id, t.title)}
        onPinToggle={state.handlePinToggle}
        onFlagColorChange={state.handleFlagColorChange}
        onChatClick={state.handleChatClick}
        allAssignees={allAssignees}
        currentUser={currentUser}
      />
    ),
    [
      state,
      handleTaskClick,
      openEditDialog,
      handleStatusChange,
      allAssignees,
      currentUser,
    ],
  );

  const handleViewChange = useCallback(
    (viewKey: string) => {
      setActiveView(viewKey);
      const view = savedViews.find((v) => v.key === viewKey);
      if (view) {
        setParams({ topLevelOnly: "true", ...view.params });
      }
    },
    [savedViews],
  );

  return (
    <ListPageLayout
      state={state}
      title="Tasks"
      titleExtra={
        <div className="flex gap-1 flex-wrap">
          {savedViews.map((view) => (
            <Button
              key={view.key}
              variant={activeView === view.key ? "default" : "outline"}
              size="sm"
              className="text-xs h-7"
              onClick={() => handleViewChange(view.key)}
            >
              {view.label}
            </Button>
          ))}
        </div>
      }
      emptyIcon={CheckSquare}
      emptyMessage="Your task collection is empty. Create your first task to get started organizing your work."
      emptyFilterMessage="No tasks found matching your criteria."
      searchPlaceholder="Search tasks..."
      totalCount={totalCount ?? tasks.length}
      filteredCount={state.sortedItems.length}
      isLoading={isLoading}
      error={
        error instanceof Error ? error : error ? new Error(String(error)) : null
      }
      onRetry={refresh}
      sortOptions={tasksConfig.sortOptions.map((o) => ({
        value: o.value,
        label: o.label,
      }))}
      extraFilters={extraFiltersForLayout}
      headerAction={
        <Button
          onClick={() => {
            setNewTaskDefaultAssignee(currentUserId);
            setIsNewTaskDialogOpen(true);
          }}
        >
          <Plus className="mr-2 h-4 w-4" /> New Task
        </Button>
      }
      loadMoreSentinel={
        hasNextPage ? (
          <div ref={sentinelRef} className="flex justify-center py-4">
            {isFetchingNextPage && (
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            )}
          </div>
        ) : undefined
      }
      deleteEntityName="task"
      isDeleting={isDeleting}
      dialogs={
        <>
          {/* Edit Task Dialog */}
          <Dialog
            open={isTaskDialogOpen}
            onOpenChange={(open) => {
              setIsTaskDialogOpen(open);
              if (!open) {
                setEditingTask(null);
              }
            }}
          >
            <DialogContent className="sm:max-w-[625px]">
              <DialogHeader>
                <DialogTitle>Task Details</DialogTitle>
                <DialogDescription>
                  View or edit task details below.
                </DialogDescription>
              </DialogHeader>
              {editingTask && (
                <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto px-2">
                  {/* Title */}
                  <div className="space-y-2">
                    <Label htmlFor="edit-title">
                      Title <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="edit-title"
                      name="title"
                      value={editingTask.title}
                      onChange={handleEditInputChange}
                      required
                    />
                  </div>
                  {/* Description */}
                  <div className="space-y-2">
                    <Label htmlFor="edit-description">Description</Label>
                    <Textarea
                      id="edit-description"
                      name="description"
                      rows={3}
                      value={editingTask.description || ""}
                      onChange={handleEditInputChange}
                    />
                  </div>
                  {/* Status & Due Date */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="edit-status">Status</Label>
                      <Select
                        name="taskStatus"
                        value={editingTask.taskStatus}
                        onValueChange={(value) =>
                          handleEditSelectChange("taskStatus", value)
                        }
                      >
                        <SelectTrigger id="edit-status">
                          <SelectValue placeholder="Status" />
                        </SelectTrigger>
                        <SelectContent>
                          {STATUS_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="edit-priority">Priority</Label>
                      <Select
                        name="priority"
                        value={String(editingTask.priority ?? 0)}
                        onValueChange={(value) =>
                          setEditingTask((prev) =>
                            prev ? { ...prev, priority: Number(value) } : null,
                          )
                        }
                      >
                        <SelectTrigger id="edit-priority">
                          <SelectValue placeholder="Priority" />
                        </SelectTrigger>
                        <SelectContent>
                          {PRIORITY_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="edit-due-date">Due Date</Label>
                      <DueDatePicker
                        value={editingTask.dueAt || null}
                        onChange={(value) =>
                          setEditingTask((prev) =>
                            prev ? { ...prev, dueDate: value ?? "" } : null,
                          )
                        }
                      />
                    </div>
                  </div>
                  {/* Assignee */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="edit-assignee">Assignee</Label>
                      <ActorPicker
                        id="edit-assignee"
                        actors={actors}
                        value={editingTask.delegateActorId ?? null}
                        allowUnassigned
                        placeholder="Search people and agents"
                        searchPlaceholder="Search people and agents..."
                        onChange={(value) =>
                          setEditingTask((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  assigneeActorId: value,
                                }
                              : null,
                          )
                        }
                      />
                    </div>
                  </div>
                  {/* Tags */}
                  <TagEditor
                    tags={editingTask.tags}
                    onAddTag={(tag) =>
                      setEditingTask((prev) =>
                        prev ? { ...prev, tags: [...prev.tags, tag] } : null,
                      )
                    }
                    onRemoveTag={(tag) =>
                      setEditingTask((prev) =>
                        prev
                          ? {
                              ...prev,
                              tags: prev.tags.filter((t) => t !== tag),
                            }
                          : null,
                      )
                    }
                  />
                </div>
              )}
              <DialogFooter className="sm:justify-between gap-2 pt-4 border-t mt-2">
                <Button
                  variant="destructive"
                  onClick={() =>
                    editingTask &&
                    state.openDeleteDialog(editingTask.id, editingTask.title)
                  }
                  disabled={isDeleting || isUpdating}
                >
                  {isDeleting ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : null}
                  Delete
                </Button>
                <div className="flex gap-2">
                  <DialogClose asChild>
                    <Button
                      variant="outline"
                      disabled={isUpdating || isDeleting}
                    >
                      Cancel
                    </Button>
                  </DialogClose>
                  <Button
                    onClick={handleUpdateTask}
                    disabled={isUpdating || isDeleting || !editingTask?.title}
                  >
                    {isUpdating && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    Save Changes
                  </Button>
                </div>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* New Task Dialog */}
          <CreateTaskDialog
            open={isNewTaskDialogOpen}
            onOpenChange={setIsNewTaskDialogOpen}
            onCreateTask={handleCreateTask}
            isCreating={isUpdating}
            defaultAssigneeId={newTaskDefaultAssignee}
            assigneeOptions={actors}
          />
        </>
      }
    >
      {/* Content area: Tile or List view */}
      {state.viewMode === "tile" ? (
        <GroupedItemList
          items={state.sortedItems}
          isGrouped={state.isGrouped}
          getGroupDate={(item) => tasksConfig.getGroupDate(item, state.sortBy)}
          className="grid gap-4 md:gap-5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
          containerRef={containerRef}
          onKeyDown={handleKeyDown}
          renderItem={renderTileItem}
        />
      ) : (
        <Card>
          <Table className="w-full">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[60px] hidden sm:table-cell pl-4 pr-2" />
                <TableHead className="min-w-0 flex-1">Title</TableHead>
                <TableHead className="w-[120px] hidden md:table-cell">
                  Status
                </TableHead>
                <TableHead className="w-[80px] hidden md:table-cell">
                  Priority
                </TableHead>
                <TableHead className="w-[140px] hidden lg:table-cell">
                  Assignee
                </TableHead>
                <TableHead className="w-[120px] hidden sm:table-cell">
                  Due Date
                </TableHead>
                <TableHead className="w-[150px] hidden lg:table-cell">
                  Tags
                </TableHead>
                <TableHead className="w-fit text-right pr-4 pl-2">
                  Actions
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {state.sortedItems.map((task, index) => {
                // Grouping for list view
                const isGrouped = state.isGrouped;
                let showGroupHeader = false;
                if (isGrouped && index > 0) {
                  const prevItem = state.sortedItems[index - 1];
                  const prevGroupDate = prevItem
                    ? tasksConfig.getGroupDate(prevItem, state.sortBy)
                    : undefined;
                  const currGroupDate = tasksConfig.getGroupDate(
                    task,
                    state.sortBy,
                  );
                  showGroupHeader =
                    String(prevGroupDate) !== String(currGroupDate);
                } else if (isGrouped && index === 0) {
                  showGroupHeader = true;
                }

                return (
                  <React.Fragment key={task.id}>
                    {showGroupHeader && (
                      <TableRow className="bg-muted/50 hover:bg-muted/50">
                        <TableCell
                          colSpan={8}
                          className="py-2 px-4 text-sm font-semibold text-muted-foreground tracking-wide uppercase"
                        >
                          {(() => {
                            const d = tasksConfig.getGroupDate(
                              task,
                              state.sortBy,
                            );
                            if (d == null) return "No Due Date";
                            try {
                              const dateObj = new Date(d as string);
                              if (Number.isNaN(dateObj.getTime()))
                                return "Unknown Date";
                              const today = new Date();
                              const yesterday = new Date(today);
                              yesterday.setDate(today.getDate() - 1);
                              const strip = (dt: Date) =>
                                new Date(
                                  dt.getFullYear(),
                                  dt.getMonth(),
                                  dt.getDate(),
                                ).getTime();
                              if (strip(dateObj) === strip(today))
                                return "Today";
                              if (strip(dateObj) === strip(yesterday))
                                return "Yesterday";
                              return dateObj.toLocaleDateString(undefined, {
                                year: "numeric",
                                month: "long",
                              });
                            } catch {
                              return "Unknown Date";
                            }
                          })()}
                        </TableCell>
                      </TableRow>
                    )}
                    <TaskListItem
                      task={task}
                      index={index}
                      isFocused={index === state.focusedIndex}
                      onClick={() => handleTaskClick(task)}
                      onEditClick={openEditDialog}
                      onStatusChange={handleStatusChange}
                      onDeleteClick={(t) =>
                        state.openDeleteDialog(t.id, t.title)
                      }
                      onPinToggle={state.handlePinToggle}
                      onFlagColorChange={state.handleFlagColorChange}
                      onChatClick={state.handleChatClick}
                      allAssignees={allAssignees}
                      currentUser={currentUser}
                    />
                  </React.Fragment>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}
    </ListPageLayout>
  );
}

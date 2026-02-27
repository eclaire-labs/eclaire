import { getRouteApi, useNavigate } from "@tanstack/react-router";
import { CheckSquare, Loader2, Plus, User as UserIcon } from "lucide-react";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { GroupedItemList, ListPageLayout } from "@/components/list-page";
import { AIAvatar } from "@/components/ui/ai-avatar";
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
import { UserAvatar } from "@/components/ui/user-avatar";
import { useAuth } from "@/hooks/use-auth";
import { useListKeyboardNavigation } from "@/hooks/use-list-keyboard-navigation";
import { useListPageState } from "@/hooks/use-list-page-state";
import { useTasks } from "@/hooks/use-tasks";
import { useToast } from "@/hooks/use-toast";
import { getUsers } from "@/lib/api-users";
import type { Task, TaskStatus, User } from "@/types/task";
import { TaskListItem } from "./tasks/TaskListItem";
import { TaskTileItem } from "./tasks/TaskTileItem";
import { CreateTaskDialog } from "./tasks/CreateTaskDialog";
import { tasksConfig } from "./tasks/tasks-config";

const routeApi = getRouteApi("/_authenticated/tasks/");

// ---------------------------------------------------------------------------
// Allowed statuses
// ---------------------------------------------------------------------------
const ALLOWED_STATUSES = new Set<TaskStatus>([
  "not-started",
  "in-progress",
  "completed",
]);

// ---------------------------------------------------------------------------
// Helper: format date for <input type="datetime-local">
// ---------------------------------------------------------------------------
const formatDateForInput = (isoString: string | null | undefined): string => {
  if (!isoString) return "";
  try {
    const date = new Date(isoString);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  } catch {
    return "";
  }
};

// ---------------------------------------------------------------------------
// Transform backend user data to frontend User type
// ---------------------------------------------------------------------------
// biome-ignore lint/suspicious/noExplicitAny: backend user shape may differ from frontend User type
const transformBackendUser = (backendUser: any): User => ({
  id: backendUser.id,
  displayName: backendUser.displayName || backendUser.name || null,
  userType: backendUser.userType || ("user" as const),
  email: backendUser.email || "",
  fullName: backendUser.fullName || backendUser.name || null,
  avatarUrl: backendUser.avatarUrl || backendUser.image || null,
});

// Transform auth user to match UserAvatar expected format
// biome-ignore lint/suspicious/noExplicitAny: auth user shape varies across providers
const transformAuthUserForAvatar = (authUser: any) => ({
  displayName: authUser.displayName || authUser.name || null,
  fullName: authUser.fullName || authUser.name || null,
  email: authUser.email || "",
  avatarUrl: authUser.avatarUrl || authUser.image || null,
});

// ---------------------------------------------------------------------------
// Page Component
// ---------------------------------------------------------------------------

export default function TasksPage() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { openDialog } = routeApi.useSearch();
  const { data: auth } = useAuth();

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
  } = useTasks();

  // Users for assignee dropdown
  const [users, setUsers] = useState<User[]>([]);

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const usersData = await getUsers();
        const transformedUsers = usersData.map(transformBackendUser);
        setUsers(transformedUsers);
      } catch (err) {
        console.error("Error fetching users:", err);
      }
    };
    fetchUsers();
  }, []);

  // Current user ID
  const currentUserId = auth?.user?.id || "";

  // Build assignee list from both users and tasks
  const allAssignees: Array<{ id: string; name: string; userType: string }> =
    useMemo(() => {
      const assigneeSet = new Set<string>();
      const assigneeList: Array<{
        id: string;
        name: string;
        userType: string;
      }> = [];

      users.forEach((user) => {
        if (!assigneeSet.has(user.id)) {
          assigneeSet.add(user.id);
          assigneeList.push({
            id: user.id,
            name: user.displayName || user.email || user.id,
            userType: user.userType,
          });
        }
      });

      tasks.forEach((task) => {
        if (task.assignedToId && !assigneeSet.has(task.assignedToId)) {
          assigneeSet.add(task.assignedToId);
          assigneeList.push({
            id: task.assignedToId,
            name: task.assignedToId,
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
    }, [tasks, users]);

  // Shared list page state
  const state = useListPageState(tasks, tasksConfig, {
    refresh,
    deleteItem: deleteTask,
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
      toast({
        title: "Error Loading Tasks",
        description:
          error instanceof Error ? error.message : "Failed to load tasks",
        variant: "destructive",
      });
    }
  }, [error, toast]);

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
      let nextStatus: TaskStatus;
      if (currentStatus === "not-started") {
        nextStatus = "in-progress";
      } else if (currentStatus === "in-progress") {
        nextStatus = "completed";
      } else {
        nextStatus = "not-started";
      }

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
      toast({
        title: "Error",
        description: "Task title is required.",
        variant: "destructive",
      });
      return;
    }

    try {
      const taskToSend = {
        ...taskData,
        ...(taskData.dueDate && {
          dueDate: new Date(taskData.dueDate).toISOString(),
        }),
        status: taskData.status || "not-started",
        ...(taskData.assignedToId?.trim() && {
          assignedToId: taskData.assignedToId,
        }),
        ...(taskData.description && { description: taskData.description }),
        isRecurring: taskData.isRecurring || false,
        ...(taskData.isRecurring && {
          cronExpression: taskData.cronExpression,
          ...(taskData.recurrenceEndDate && {
            recurrenceEndDate: taskData.recurrenceEndDate,
          }),
          ...(taskData.recurrenceLimit && {
            recurrenceLimit: taskData.recurrenceLimit,
          }),
          runImmediately: taskData.runImmediately || false,
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

      await createTask(taskToSend);
      setIsNewTaskDialogOpen(false);
      toast({
        title: "Task Created",
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
      toast({
        title: "Error",
        description: "Task title cannot be empty.",
        variant: "destructive",
      });
      return;
    }

    try {
      const taskToSend = {
        ...editingTask,
        ...(editingTask.dueDate && {
          dueDate: new Date(editingTask.dueDate).toISOString(),
        }),
        status: ALLOWED_STATUSES.has(editingTask.status as TaskStatus)
          ? editingTask.status
          : "not-started",
        ...(editingTask.assignedToId && {
          assignedToId: editingTask.assignedToId,
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

      toast({
        title: "Task Updated",
        description: `"${editingTask.title}" saved.`,
      });
    } catch (err) {
      console.error("Error updating task:", err);
    }
  };


  // Current user for avatars
  const currentUser = auth?.user ? transformBackendUser(auth.user) : undefined;

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
        key: "status",
        label: "Status",
        value: state.extraFilters.status ?? "all",
        onChange: (v: string) => state.setExtraFilter("status", v),
        options: [
          { value: "all", label: "All Statuses" },
          { value: "not-started", label: "Not Started" },
          { value: "in-progress", label: "In Progress" },
          { value: "completed", label: "Completed" },
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

  // Assignee select options shared across dialogs
  const renderAssigneeSelectContent = () => (
    <SelectContent>
      <SelectItem value="UNASSIGNED">Unassigned</SelectItem>
      {allAssignees.some((a) => a.userType === "assistant") && (
        <>
          <SelectItem
            value="__section_ai__"
            disabled
            className="text-xs font-semibold text-muted-foreground"
          >
            AI Assistants
          </SelectItem>
          {allAssignees
            .filter((a) => a.userType === "assistant")
            .map((assignee) => (
              <SelectItem key={assignee.id} value={assignee.id}>
                <div className="flex items-center gap-2">
                  <AIAvatar size="sm" />
                  {assignee.name}
                </div>
              </SelectItem>
            ))}
        </>
      )}
      {allAssignees.some((a) => a.userType !== "assistant") && (
        <>
          <SelectItem
            value="__section_team__"
            disabled
            className="text-xs font-semibold text-muted-foreground"
          >
            Team Members
          </SelectItem>
          {allAssignees
            .filter((a) => a.userType !== "assistant")
            .map((assignee) => (
              <SelectItem key={assignee.id} value={assignee.id}>
                <div className="flex items-center gap-2">
                  {assignee.id === auth?.user?.id && auth.user ? (
                    <UserAvatar
                      user={transformAuthUserForAvatar(auth.user)}
                      size="sm"
                    />
                  ) : (
                    <UserIcon className="h-3 w-3" />
                  )}
                  {assignee.name}
                </div>
              </SelectItem>
            ))}
        </>
      )}
    </SelectContent>
  );


  return (
    <ListPageLayout
      state={state}
      title="Tasks"
      emptyIcon={CheckSquare}
      emptyMessage="Your task collection is empty. Create your first task to get started organizing your work."
      emptyFilterMessage="No tasks found matching your criteria."
      searchPlaceholder="Search tasks..."
      totalCount={tasks.length}
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
                        name="status"
                        value={editingTask.status}
                        onValueChange={(value) =>
                          handleEditSelectChange("status", value)
                        }
                      >
                        <SelectTrigger id="edit-status">
                          <SelectValue placeholder="Status" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="not-started">
                            Not Started
                          </SelectItem>
                          <SelectItem value="in-progress">
                            In Progress
                          </SelectItem>
                          <SelectItem value="completed">Completed</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="edit-due-date">Due Date</Label>
                      <Input
                        id="edit-due-date"
                        name="dueDate"
                        type="datetime-local"
                        value={formatDateForInput(editingTask.dueDate)}
                        onChange={handleEditInputChange}
                      />
                    </div>
                  </div>
                  {/* Assignee */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="edit-assignee">Assignee</Label>
                      <Select
                        name="assignedToId"
                        value={editingTask.assignedToId || "UNASSIGNED"}
                        onValueChange={(value) => {
                          const finalValue =
                            value === "UNASSIGNED" ? null : value;
                          setEditingTask((prev) =>
                            prev ? { ...prev, assignedToId: finalValue } : null,
                          );
                        }}
                      >
                        <SelectTrigger id="edit-assignee">
                          <SelectValue placeholder="Assignee" />
                        </SelectTrigger>
                        {renderAssigneeSelectContent()}
                      </Select>
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
                          ? { ...prev, tags: prev.tags.filter((t) => t !== tag) }
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
            renderAssigneeSelectContent={renderAssigneeSelectContent}
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
          className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
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
                          colSpan={7}
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

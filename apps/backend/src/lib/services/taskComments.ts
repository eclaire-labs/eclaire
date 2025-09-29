import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { taskComments, tasks, users } from "@/db/schema";
import { formatToISO8601 } from "@/lib/db-helpers";
import { createChildLogger } from "../logger";
import { recordHistory } from "./history";

const logger = createChildLogger("services:taskComments");

export interface CreateTaskCommentParams {
  taskId: string;
  content: string;
}

export interface UpdateTaskCommentParams {
  content: string;
}

function cleanTaskCommentForResponse(comment: any) {
  const { createdAt, updatedAt, ...cleanedComment } = comment;

  return {
    ...cleanedComment,
    createdAt: createdAt ? formatToISO8601(createdAt) : null,
    updatedAt: updatedAt ? formatToISO8601(updatedAt) : null,
  };
}

export async function createTaskComment(
  commentData: CreateTaskCommentParams,
  userId: string,
) {
  try {
    // Verify the task exists
    const task = await db.query.tasks.findFirst({
      where: eq(tasks.id, commentData.taskId),
    });

    if (!task) {
      throw new Error("Task not found");
    }

    // Get user info to determine actor type
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
      columns: {
        id: true,
        userType: true,
        displayName: true,
      },
    });

    if (!user) {
      throw new Error("User not found");
    }

    const [newComment] = await db
      .insert(taskComments)
      .values({
        taskId: commentData.taskId,
        userId: userId,
        content: commentData.content,
      })
      .returning();

    if (!newComment) {
      throw new Error("Failed to create task comment");
    }

    // Get the comment with user info
    const commentWithUser = await db.query.taskComments.findFirst({
      where: eq(taskComments.id, newComment.id),
      with: {
        user: {
          columns: {
            id: true,
            displayName: true,
            userType: true,
          },
        },
      },
    });

    if (!commentWithUser) {
      throw new Error("Failed to retrieve created comment");
    }

    // Record history
    const actor =
      user.userType === "assistant"
        ? "assistant"
        : user.userType === "worker"
          ? "system"
          : "user";
    await recordHistory({
      action: "create",
      itemType: "task_comment",
      itemId: newComment.id,
      itemName: `Comment on task: ${task.title || task.id}`,
      afterData: {
        content: commentData.content,
        taskId: commentData.taskId,
        taskTitle: task.title,
      },
      actor,
      userId: task.userId,
      metadata: {
        commentCreatedBy: userId,
        commentCreatedByName: user.displayName,
        commentCreatedByType: user.userType,
      },
    });

    logger.info(
      {
        taskId: commentData.taskId,
        commentId: newComment.id,
        userId,
      },
      "Task comment created successfully",
    );

    return cleanTaskCommentForResponse(commentWithUser);
  } catch (error) {
    logger.error(
      {
        taskId: commentData.taskId,
        userId,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      "Error creating task comment",
    );
    throw error;
  }
}

export async function getTaskComments(taskId: string, userId: string) {
  try {
    // Verify the task exists and user has access to it
    const task = await db.query.tasks.findFirst({
      where: and(eq(tasks.id, taskId), eq(tasks.userId, userId)),
    });

    if (!task) {
      throw new Error("Task not found or access denied");
    }

    const comments = await db.query.taskComments.findMany({
      where: eq(taskComments.taskId, taskId),
      with: {
        user: {
          columns: {
            id: true,
            displayName: true,
            userType: true,
          },
        },
      },
      orderBy: [desc(taskComments.createdAt)],
    });

    return comments.map(cleanTaskCommentForResponse);
  } catch (error) {
    logger.error(
      {
        taskId,
        userId,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      "Error getting task comments",
    );
    throw error;
  }
}

export async function updateTaskComment(
  commentId: string,
  commentData: UpdateTaskCommentParams,
  userId: string,
) {
  try {
    // Verify the comment exists and user owns it
    const existingComment = await db.query.taskComments.findFirst({
      where: and(
        eq(taskComments.id, commentId),
        eq(taskComments.userId, userId),
      ),
    });

    if (!existingComment) {
      throw new Error("Comment not found or access denied");
    }

    // Get user and task info for history recording
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
      columns: {
        id: true,
        userType: true,
        displayName: true,
      },
    });

    const task = await db.query.tasks.findFirst({
      where: eq(tasks.id, existingComment.taskId),
      columns: {
        id: true,
        title: true,
        userId: true,
      },
    });

    if (!user || !task) {
      throw new Error("User or task not found");
    }

    const [updatedComment] = await db
      .update(taskComments)
      .set({
        content: commentData.content,
        updatedAt: new Date(),
      })
      .where(eq(taskComments.id, commentId))
      .returning();

    // Get the comment with user info
    const commentWithUser = await db.query.taskComments.findFirst({
      where: eq(taskComments.id, commentId),
      with: {
        user: {
          columns: {
            id: true,
            displayName: true,
            userType: true,
          },
        },
      },
    });

    if (!commentWithUser) {
      throw new Error("Failed to retrieve updated comment");
    }

    // Record history
    const actor =
      user.userType === "assistant"
        ? "assistant"
        : user.userType === "worker"
          ? "system"
          : "user";
    await recordHistory({
      action: "update",
      itemType: "task_comment",
      itemId: commentId,
      itemName: `Comment on task: ${task.title || task.id}`,
      beforeData: {
        content: existingComment.content,
      },
      afterData: {
        content: commentData.content,
        taskId: existingComment.taskId,
        taskTitle: task.title,
      },
      actor,
      userId: task.userId,
      metadata: {
        commentUpdatedBy: userId,
        commentUpdatedByName: user.displayName,
        commentUpdatedByType: user.userType,
      },
    });

    logger.info(
      {
        commentId,
        userId,
      },
      "Task comment updated successfully",
    );

    return cleanTaskCommentForResponse(commentWithUser);
  } catch (error) {
    logger.error(
      {
        commentId,
        userId,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      "Error updating task comment",
    );
    throw error;
  }
}

export async function deleteTaskComment(commentId: string, userId: string) {
  try {
    // Verify the comment exists and user owns it
    const existingComment = await db.query.taskComments.findFirst({
      where: and(
        eq(taskComments.id, commentId),
        eq(taskComments.userId, userId),
      ),
    });

    if (!existingComment) {
      throw new Error("Comment not found or access denied");
    }

    // Get user and task info for history recording
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
      columns: {
        id: true,
        userType: true,
        displayName: true,
      },
    });

    const task = await db.query.tasks.findFirst({
      where: eq(tasks.id, existingComment.taskId),
      columns: {
        id: true,
        title: true,
        userId: true,
      },
    });

    if (!user || !task) {
      throw new Error("User or task not found");
    }

    await db.delete(taskComments).where(eq(taskComments.id, commentId));

    // Record history
    const actor =
      user.userType === "assistant"
        ? "assistant"
        : user.userType === "worker"
          ? "system"
          : "user";
    await recordHistory({
      action: "delete",
      itemType: "task_comment",
      itemId: commentId,
      itemName: `Comment on task: ${task.title || task.id}`,
      beforeData: {
        content: existingComment.content,
        taskId: existingComment.taskId,
        taskTitle: task.title,
      },
      actor,
      userId: task.userId,
      metadata: {
        commentDeletedBy: userId,
        commentDeletedByName: user.displayName,
        commentDeletedByType: user.userType,
      },
    });

    logger.info(
      {
        commentId,
        userId,
      },
      "Task comment deleted successfully",
    );

    return true;
  } catch (error) {
    logger.error(
      {
        commentId,
        userId,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      "Error deleting task comment",
    );
    throw error;
  }
}

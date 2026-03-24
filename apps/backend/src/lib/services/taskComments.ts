import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "../../db/index.js";
import { formatToISO8601 } from "@eclaire/core";

const { taskComments, tasks, users } = schema;

import { getActorSummaryOrNull } from "./actors.js";
import { NotFoundError } from "../errors.js";
import { createChildLogger } from "../logger.js";
import { recordHistory } from "./history.js";
import {
  callerActorId,
  callerOwnerUserId,
  type CallerContext,
} from "./types.js";

const logger = createChildLogger("services:taskComments");

export interface CreateTaskCommentParams {
  taskId: string;
  content: string;
}

export interface UpdateTaskCommentParams {
  content: string;
}

// biome-ignore lint/suspicious/noExplicitAny: raw DB row parameter
function cleanTaskCommentForResponse(comment: any) {
  const { createdAt, updatedAt, userId: _userId, ...cleanedComment } = comment;

  return {
    ...cleanedComment,
    createdAt: createdAt ? formatToISO8601(createdAt) : null,
    updatedAt: updatedAt ? formatToISO8601(updatedAt) : null,
  };
}

async function resolveCommentActorMetadata(
  caller: CallerContext,
  taskOwnerUserId: string,
) {
  const actorId = callerActorId(caller);
  const ownerUserId = callerOwnerUserId(caller);
  const actor = await getActorSummaryOrNull(taskOwnerUserId, actorId);

  if (actor?.kind === "agent") {
    return {
      storageUserId: taskOwnerUserId,
      authorActorId: actor.id,
      displayName: actor.displayName ?? "Agent",
    };
  }

  if (actor?.kind === "human") {
    return {
      storageUserId: ownerUserId,
      authorActorId: actor.id,
      displayName: actor.displayName ?? "User",
    };
  }

  const user = await db.query.users.findFirst({
    where: eq(users.id, ownerUserId),
    columns: {
      id: true,
      displayName: true,
    },
  });

  return {
    storageUserId: ownerUserId,
    authorActorId: actorId,
    displayName: user?.displayName ?? "System",
  };
}

export async function formatTaskCommentForResponse(
  // biome-ignore lint/suspicious/noExplicitAny: raw DB row parameter
  comment: any,
  taskOwnerUserId: string,
) {
  const cleanedComment = cleanTaskCommentForResponse(comment);
  const resolvedAuthorId = comment.authorActorId;
  const author = await getActorSummaryOrNull(taskOwnerUserId, resolvedAuthorId);

  if (!author) {
    return {
      ...cleanedComment,
      authorActorId: resolvedAuthorId,
      author: {
        id: resolvedAuthorId,
        kind: "human" as const,
        displayName: comment.user?.displayName ?? null,
      },
      user: cleanedComment.user,
    };
  }

  return {
    ...cleanedComment,
    authorActorId: author.id,
    author,
    user: {
      id: author.id,
      displayName: author.displayName,
      userType:
        author.kind === "agent"
          ? ("assistant" as const)
          : author.kind === "human"
            ? ("user" as const)
            : ("worker" as const),
    },
  };
}

async function findOwnedComment(commentId: string, caller: CallerContext) {
  const actorId = callerActorId(caller);
  return db.query.taskComments.findFirst({
    where: and(
      eq(taskComments.id, commentId),
      eq(taskComments.authorActorId, actorId),
    ),
  });
}

export async function createTaskComment(
  commentData: CreateTaskCommentParams,
  caller: CallerContext,
) {
  const actorId = callerActorId(caller);
  const ownerUserId = callerOwnerUserId(caller);
  try {
    // Verify the task exists and belongs to the caller
    const task = await db.query.tasks.findFirst({
      where: eq(tasks.id, commentData.taskId),
    });

    if (!task) {
      throw new NotFoundError("Task");
    }

    if (!ownerUserId || task.userId !== ownerUserId) {
      throw new NotFoundError("Task");
    }

    const commentActor = await resolveCommentActorMetadata(caller, task.userId);

    const [newComment] = await db
      .insert(taskComments)
      .values({
        taskId: commentData.taskId,
        userId: commentActor.storageUserId,
        authorActorId: commentActor.authorActorId,
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
      actor: caller.actor,
      actorId,
      authorizedByActorId: caller.authorizedByActorId ?? null,
      grantId: caller.grantId ?? null,
      userId: ownerUserId ?? task.userId,
      metadata: {
        commentCreatedBy: actorId,
        commentCreatedByName: commentActor.displayName,
        commentCreatedByType: caller.actor,
      },
    });

    logger.info(
      {
        taskId: commentData.taskId,
        commentId: newComment.id,
        actorId,
        ownerUserId,
      },
      "Task comment created successfully",
    );

    return formatTaskCommentForResponse(commentWithUser, task.userId);
  } catch (error) {
    logger.error(
      {
        taskId: commentData.taskId,
        actorId,
        ownerUserId,
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
      throw new NotFoundError("Task");
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

    return Promise.all(
      comments.map((comment) =>
        formatTaskCommentForResponse(comment, task.userId),
      ),
    );
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
  caller: CallerContext,
) {
  const actorId = callerActorId(caller);
  const ownerUserId = callerOwnerUserId(caller);
  try {
    // Verify the comment exists and caller owns it
    const existingComment = await findOwnedComment(commentId, caller);

    if (!existingComment) {
      throw new NotFoundError("Comment");
    }

    const task = await db.query.tasks.findFirst({
      where: eq(tasks.id, existingComment.taskId),
      columns: {
        id: true,
        title: true,
        userId: true,
      },
    });

    if (!task) {
      throw new NotFoundError("Task");
    }

    const commentActor = await resolveCommentActorMetadata(caller, task.userId);

    const [_updatedComment] = await db
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
      actor: caller.actor,
      actorId,
      authorizedByActorId: caller.authorizedByActorId ?? null,
      grantId: caller.grantId ?? null,
      userId: ownerUserId ?? task.userId,
      metadata: {
        commentUpdatedBy: actorId,
        commentUpdatedByName: commentActor.displayName,
        commentUpdatedByType: caller.actor,
      },
    });

    logger.info(
      {
        commentId,
        actorId,
        ownerUserId,
      },
      "Task comment updated successfully",
    );

    return formatTaskCommentForResponse(commentWithUser, task.userId);
  } catch (error) {
    logger.error(
      {
        commentId,
        actorId,
        ownerUserId,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      "Error updating task comment",
    );
    throw error;
  }
}

export async function deleteTaskComment(
  commentId: string,
  caller: CallerContext,
) {
  const actorId = callerActorId(caller);
  const ownerUserId = callerOwnerUserId(caller);
  try {
    // Verify the comment exists and caller owns it
    const existingComment = await findOwnedComment(commentId, caller);

    if (!existingComment) {
      throw new NotFoundError("Comment");
    }

    const task = await db.query.tasks.findFirst({
      where: eq(tasks.id, existingComment.taskId),
      columns: {
        id: true,
        title: true,
        userId: true,
      },
    });

    if (!task) {
      throw new NotFoundError("Task");
    }

    const commentActor = await resolveCommentActorMetadata(caller, task.userId);

    await db.delete(taskComments).where(eq(taskComments.id, commentId));

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
      actor: caller.actor,
      actorId,
      authorizedByActorId: caller.authorizedByActorId ?? null,
      grantId: caller.grantId ?? null,
      userId: ownerUserId ?? task.userId,
      metadata: {
        commentDeletedBy: actorId,
        commentDeletedByName: commentActor.displayName,
        commentDeletedByType: caller.actor,
      },
    });

    logger.info(
      {
        commentId,
        actorId,
        ownerUserId,
      },
      "Task comment deleted successfully",
    );

    return true;
  } catch (error) {
    logger.error(
      {
        commentId,
        actorId,
        ownerUserId,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      "Error deleting task comment",
    );
    throw error;
  }
}

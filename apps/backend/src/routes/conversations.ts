import { isValidConversationId } from "@eclaire/core";
import { Hono } from "hono";
import { describeRoute } from "hono-openapi";
import { NotFoundError, ValidationError } from "../lib/errors.js";
import { createChildLogger } from "../lib/logger.js";
import {
  createConversation,
  deleteConversation,
  getConversationWithMessages,
  listConversations,
  updateConversation,
} from "../lib/services/conversations.js";
import { recordHistory } from "../lib/services/history.js";
import { withAuth } from "../middleware/with-auth.js";
import {
  CreateConversationSchema,
  ListConversationsSchema,
  UpdateConversationSchema,
} from "../schemas/conversation-params.js";
import {
  deleteConversationRouteDescription,
  getConversationRouteDescription,
  getConversationsRouteDescription,
  postConversationRouteDescription,
  putConversationRouteDescription,
} from "../schemas/conversation-routes.js";
import type { RouteVariables } from "../types/route-variables.js";

const logger = createChildLogger("conversations");

export const conversationsRoutes = new Hono<{ Variables: RouteVariables }>();

// Schemas are now imported from dedicated schema files

// POST /api/conversations - Create new conversation
conversationsRoutes.post(
  "/",
  describeRoute(postConversationRouteDescription),
  withAuth(async (c, userId) => {
    const requestId = c.get("requestId");

    const body = CreateConversationSchema.parse(await c.req.json());

    const conversation = await createConversation({
      userId,
      title: body.title,
    });

    await recordHistory({
      action: "conversation_created",
      itemType: "conversation",
      itemId: conversation.id,
      itemName: conversation.title,
      beforeData: null,
      afterData: conversation,
      actor: "user",
      userId,
    });

    logger.info(
      { requestId, userId, conversationId: conversation.id },
      "Created new conversation",
    );

    return c.json({
      status: "OK",
      conversation,
    });
  }, logger),
);

// GET /api/conversations - List user's conversations
conversationsRoutes.get(
  "/",
  describeRoute(getConversationsRouteDescription),
  withAuth(async (c, userId) => {
    const requestId = c.get("requestId");

    const query = ListConversationsSchema.parse(c.req.query());
    const limit = query.limit || 50;
    const offset = query.offset || 0;

    const conversations = await listConversations(userId, limit, offset);

    logger.info(
      { requestId, userId, count: conversations.length },
      "Listed conversations",
    );

    return c.json({
      status: "OK",
      conversations,
      pagination: {
        limit,
        offset,
        count: conversations.length,
      },
    });
  }, logger),
);

// GET /api/conversations/:id - Get conversation with messages
conversationsRoutes.get(
  "/:id",
  describeRoute(getConversationRouteDescription),
  withAuth(async (c, userId) => {
    const requestId = c.get("requestId");
    const conversationId = c.req.param("id");

    if (!isValidConversationId(conversationId)) {
      throw new ValidationError("Invalid conversation ID");
    }

    const conversation = await getConversationWithMessages(
      conversationId,
      userId,
    );

    if (!conversation) {
      throw new NotFoundError("Conversation");
    }

    logger.info(
      {
        requestId,
        userId,
        conversationId,
        messageCount: conversation.messageCount,
      },
      "Retrieved conversation with messages",
    );

    return c.json({
      status: "OK",
      conversation,
    });
  }, logger),
);

// PUT /api/conversations/:id - Update conversation
conversationsRoutes.put(
  "/:id",
  describeRoute(putConversationRouteDescription),
  withAuth(async (c, userId) => {
    const requestId = c.get("requestId");
    const conversationId = c.req.param("id");

    if (!isValidConversationId(conversationId)) {
      throw new ValidationError("Invalid conversation ID");
    }

    const body = UpdateConversationSchema.parse(await c.req.json());

    const updatedConversation = await updateConversation(
      conversationId,
      userId,
      body,
    );

    if (!updatedConversation) {
      throw new NotFoundError("Conversation");
    }

    await recordHistory({
      action: "conversation_updated",
      itemType: "conversation",
      itemId: conversationId,
      itemName: updatedConversation.title,
      beforeData: { updates: body },
      afterData: updatedConversation,
      actor: "user",
      userId,
    });

    logger.info({ requestId, userId, conversationId }, "Updated conversation");

    return c.json({
      status: "OK",
      conversation: updatedConversation,
    });
  }, logger),
);

// DELETE /api/conversations/:id - Delete conversation
conversationsRoutes.delete(
  "/:id",
  describeRoute(deleteConversationRouteDescription),
  withAuth(async (c, userId) => {
    const requestId = c.get("requestId");
    const conversationId = c.req.param("id");

    if (!isValidConversationId(conversationId)) {
      throw new ValidationError("Invalid conversation ID");
    }

    const success = await deleteConversation(conversationId, userId);

    if (!success) {
      throw new NotFoundError("Conversation");
    }

    await recordHistory({
      action: "conversation_deleted",
      itemType: "conversation",
      itemId: conversationId,
      itemName: "Deleted Conversation",
      beforeData: { conversationId },
      afterData: null,
      actor: "user",
      userId,
    });

    logger.info({ requestId, userId, conversationId }, "Deleted conversation");

    return c.json({
      status: "OK",
      message: "Conversation deleted successfully",
    });
  }, logger),
);

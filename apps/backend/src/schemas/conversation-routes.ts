import { resolver } from "hono-openapi";
import {
  error401Response,
  notFoundError,
  requestBodyResolver,
} from "./common.js";
import {
  CreateConversationSchema,
  UpdateConversationSchema,
} from "./conversation-params.js";
import {
  ConversationNotFoundErrorSchema,
  ConversationServerErrorSchema,
  ConversationValidationErrorSchema,
  CreateConversationResponseSchema,
  DeleteConversationResponseSchema,
  GetConversationResponseSchema,
  InvalidConversationIdErrorSchema,
  ListConversationsResponseSchema,
  UpdateConversationResponseSchema,
} from "./conversation-responses.js";

const conversationServerError = {
  description: "Internal server error",
  content: {
    "application/json": {
      schema: resolver(ConversationServerErrorSchema),
    },
  },
} as const;

const conversationValidationError = {
  description: "Invalid request data",
  content: {
    "application/json": {
      schema: resolver(ConversationValidationErrorSchema),
    },
  },
} as const;

const invalidConversationIdError = {
  description: "Invalid conversation ID",
  content: {
    "application/json": {
      schema: resolver(InvalidConversationIdErrorSchema),
    },
  },
} as const;

// POST /api/conversations - Create new conversation
export const postConversationRouteDescription = {
  tags: ["AI Conversations"],
  summary: "Create a new conversation",
  description:
    "Create a new conversation with a title. This will create an empty conversation that can later receive messages through the prompt API.",
  requestBody: {
    description: "Conversation creation data",
    content: {
      "application/json": {
        schema: requestBodyResolver(CreateConversationSchema),
      },
    },
    required: true,
  },
  responses: {
    200: {
      description: "Conversation created successfully",
      content: {
        "application/json": {
          schema: resolver(CreateConversationResponseSchema),
        },
      },
    },
    400: conversationValidationError,
    401: error401Response,
    500: conversationServerError,
  },
};

// GET /api/conversations - List conversations
export const getConversationsRouteDescription = {
  tags: ["AI Conversations"],
  summary: "List user's conversations",
  description:
    "Retrieve a paginated list of conversations for the authenticated user, ordered by last message timestamp.",
  parameters: [
    {
      name: "limit",
      in: "query" as const,
      description: "Maximum number of conversations to return (default: 50)",
      required: false,
      schema: {
        type: "string" as const,
        pattern: "^\\d+$",
      },
    },
    {
      name: "offset",
      in: "query" as const,
      description: "Number of conversations to skip (default: 0)",
      required: false,
      schema: {
        type: "string" as const,
        pattern: "^\\d+$",
      },
    },
  ],
  responses: {
    200: {
      description: "Conversations retrieved successfully",
      content: {
        "application/json": {
          schema: resolver(ListConversationsResponseSchema),
        },
      },
    },
    401: error401Response,
    500: conversationServerError,
  },
};

// GET /api/conversations/:id - Get conversation with messages
export const getConversationRouteDescription = {
  tags: ["AI Conversations"],
  summary: "Get conversation with messages",
  description:
    "Retrieve a specific conversation including all its messages. The user must own the conversation.",
  parameters: [
    {
      name: "id",
      in: "path" as const,
      description: "Unique conversation identifier",
      required: true,
      schema: {
        type: "string" as const,
      },
    },
  ],
  responses: {
    200: {
      description: "Conversation retrieved successfully",
      content: {
        "application/json": {
          schema: resolver(GetConversationResponseSchema),
        },
      },
    },
    400: invalidConversationIdError,
    401: error401Response,
    404: notFoundError("Conversation", ConversationNotFoundErrorSchema),
    500: conversationServerError,
  },
};

// PUT /api/conversations/:id - Update conversation
export const putConversationRouteDescription = {
  tags: ["AI Conversations"],
  summary: "Update conversation",
  description:
    "Update conversation metadata such as title. The user must own the conversation.",
  parameters: [
    {
      name: "id",
      in: "path" as const,
      description: "Unique conversation identifier",
      required: true,
      schema: {
        type: "string" as const,
      },
    },
  ],
  requestBody: {
    description: "Conversation update data",
    content: {
      "application/json": {
        schema: requestBodyResolver(UpdateConversationSchema),
      },
    },
    required: true,
  },
  responses: {
    200: {
      description: "Conversation updated successfully",
      content: {
        "application/json": {
          schema: resolver(UpdateConversationResponseSchema),
        },
      },
    },
    400: {
      ...conversationValidationError,
      description: "Invalid request data or conversation ID",
    },
    401: error401Response,
    404: notFoundError("Conversation", ConversationNotFoundErrorSchema),
    500: conversationServerError,
  },
};

// DELETE /api/conversations/:id - Delete conversation
export const deleteConversationRouteDescription = {
  tags: ["AI Conversations"],
  summary: "Delete conversation",
  description:
    "Delete a conversation and all its messages. This action cannot be undone. The user must own the conversation.",
  parameters: [
    {
      name: "id",
      in: "path" as const,
      description: "Unique conversation identifier",
      required: true,
      schema: {
        type: "string" as const,
      },
    },
  ],
  responses: {
    200: {
      description: "Conversation deleted successfully",
      content: {
        "application/json": {
          schema: resolver(DeleteConversationResponseSchema),
        },
      },
    },
    400: invalidConversationIdError,
    401: error401Response,
    404: notFoundError("Conversation", ConversationNotFoundErrorSchema),
    500: conversationServerError,
  },
};

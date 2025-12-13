// schemas/channels-routes.ts

import { resolver } from "hono-openapi";
import z from "zod/v4";
import {
  ErrorResponseSchema,
  UnauthorizedSchema,
  ValidationErrorSchema,
} from "./all-responses.js";
import {
  ChannelIdParamSchema,
  CreateChannelSchema,
  UpdateChannelSchema,
} from "./channels-params.js";
import {
  ChannelNotFoundSchema,
  CreateChannelResponseSchema,
  DeleteChannelResponseSchema,
  ListChannelsResponseSchema,
  UpdateChannelResponseSchema,
} from "./channels-responses.js";

// GET /api/channels - List user's channels
export const getChannelsRouteDescription = {
  tags: ["Channels"],
  summary: "List user's channels",
  description: "Retrieve all communication channels for the authenticated user",
  responses: {
    200: {
      description: "List of user's channels",
      content: {
        "application/json": {
          schema: resolver(ListChannelsResponseSchema),
        },
      },
    },
    401: {
      description: "Authentication required",
      content: {
        "application/json": {
          schema: resolver(UnauthorizedSchema),
        },
      },
    },
    500: {
      description: "Internal server error",
      content: {
        "application/json": {
          schema: resolver(ErrorResponseSchema),
        },
      },
    },
  },
};

// POST /api/channels - Create a new channel
export const postChannelsRouteDescription = {
  tags: ["Channels"],
  summary: "Create a new channel",
  description: "Create a new communication channel for the authenticated user",
  requestBody: {
    description: "Channel creation data",
    content: {
      "application/json": {
        schema: resolver(CreateChannelSchema) as any,
      },
    },
  },
  responses: {
    201: {
      description: "Channel created successfully",
      content: {
        "application/json": {
          schema: resolver(CreateChannelResponseSchema),
        },
      },
    },
    400: {
      description: "Invalid request data",
      content: {
        "application/json": {
          schema: resolver(ValidationErrorSchema),
        },
      },
    },
    401: {
      description: "Authentication required",
      content: {
        "application/json": {
          schema: resolver(UnauthorizedSchema),
        },
      },
    },
    500: {
      description: "Internal server error",
      content: {
        "application/json": {
          schema: resolver(ErrorResponseSchema),
        },
      },
    },
  },
};

// PUT /api/channels/{id} - Update a channel
export const putChannelRouteDescription = {
  tags: ["Channels"],
  summary: "Update a channel",
  description:
    "Update an existing communication channel for the authenticated user",
  requestBody: {
    description: "Channel update data",
    content: {
      "application/json": {
        schema: resolver(UpdateChannelSchema) as any,
      },
    },
  },
  responses: {
    200: {
      description: "Channel updated successfully",
      content: {
        "application/json": {
          schema: resolver(UpdateChannelResponseSchema),
        },
      },
    },
    400: {
      description: "Invalid request data",
      content: {
        "application/json": {
          schema: resolver(ValidationErrorSchema),
        },
      },
    },
    401: {
      description: "Authentication required",
      content: {
        "application/json": {
          schema: resolver(UnauthorizedSchema),
        },
      },
    },
    404: {
      description: "Channel not found",
      content: {
        "application/json": {
          schema: resolver(ChannelNotFoundSchema),
        },
      },
    },
    500: {
      description: "Internal server error",
      content: {
        "application/json": {
          schema: resolver(ErrorResponseSchema),
        },
      },
    },
  },
};

// DELETE /api/channels/{id} - Delete a channel
export const deleteChannelRouteDescription = {
  tags: ["Channels"],
  summary: "Delete a channel",
  description:
    "Delete an existing communication channel for the authenticated user",
  responses: {
    200: {
      description: "Channel deleted successfully",
      content: {
        "application/json": {
          schema: resolver(DeleteChannelResponseSchema),
        },
      },
    },
    401: {
      description: "Authentication required",
      content: {
        "application/json": {
          schema: resolver(UnauthorizedSchema),
        },
      },
    },
    404: {
      description: "Channel not found",
      content: {
        "application/json": {
          schema: resolver(ChannelNotFoundSchema),
        },
      },
    },
    500: {
      description: "Internal server error",
      content: {
        "application/json": {
          schema: resolver(ErrorResponseSchema),
        },
      },
    },
  },
};

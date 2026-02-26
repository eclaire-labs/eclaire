// schemas/channels-routes.ts

import { resolver } from "hono-openapi";
import { CreateChannelSchema, UpdateChannelSchema } from "./channels-params.js";
import {
  ChannelNotFoundSchema,
  CreateChannelResponseSchema,
  DeleteChannelResponseSchema,
  ListChannelsResponseSchema,
  UpdateChannelResponseSchema,
} from "./channels-responses.js";
import {
  commonErrors,
  commonErrorsWithValidation,
  notFoundError,
  requestBodyResolver,
} from "./common.js";

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
    ...commonErrors,
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
        schema: requestBodyResolver(CreateChannelSchema),
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
    ...commonErrorsWithValidation,
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
        schema: requestBodyResolver(UpdateChannelSchema),
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
    ...commonErrorsWithValidation,
    404: notFoundError("Channel", ChannelNotFoundSchema),
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
    ...commonErrors,
    404: notFoundError("Channel", ChannelNotFoundSchema),
  },
};

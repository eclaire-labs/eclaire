import { Hono } from "hono";
import { describeRoute } from "hono-openapi";
import { validator as zValidator } from "hono-openapi";
import z from "zod/v4";
import { getAuthenticatedUserId } from "@/lib/auth-utils";
import { createChildLogger } from "@/lib/logger";
// Import services
import {
  createChannel,
  deleteChannel,
  getUserChannels,
  updateChannel,
} from "@/lib/services/channels";

// Import schemas
import {
  ChannelIdParamSchema,
  CreateChannelSchema,
  UpdateChannelSchema,
} from "@/schemas/channels-params";
// Import route descriptions
import {
  deleteChannelRouteDescription,
  getChannelsRouteDescription,
  postChannelsRouteDescription,
  putChannelRouteDescription,
} from "@/schemas/channels-routes";
import type { RouteVariables } from "@/types/route-variables";

const logger = createChildLogger("routes:channels");

export const channelsRoutes = new Hono<{ Variables: RouteVariables }>();

// GET /api/channels - List user's channels
channelsRoutes.get(
  "/",
  describeRoute(getChannelsRouteDescription),
  async (c) => {
    const requestId = c.get("requestId");

    try {
      const userId = await getAuthenticatedUserId(c);
      if (!userId) {
        return c.json(
          { error: "Unauthorized", message: "Authentication required" },
          401,
        );
      }

      const result = await getUserChannels(userId);

      logger.info(
        {
          requestId,
          userId,
          channelCount: result.total,
        },
        "Retrieved user channels",
      );

      return c.json(result);
    } catch (error) {
      logger.error(
        {
          requestId,
          error: error instanceof Error ? error.message : "Unknown error",
        },
        "Error retrieving channels",
      );

      return c.json(
        {
          error: "Internal server error",
          message: "Failed to retrieve channels",
        },
        500,
      );
    }
  },
);

// POST /api/channels - Create a new channel
channelsRoutes.post(
  "/",
  describeRoute(postChannelsRouteDescription),
  zValidator("json", CreateChannelSchema),
  async (c) => {
    const requestId = c.get("requestId");

    try {
      const userId = await getAuthenticatedUserId(c);
      if (!userId) {
        return c.json(
          { error: "Unauthorized", message: "Authentication required" },
          401,
        );
      }

      const channelData = c.req.valid("json");

      const result = await createChannel(userId, channelData);

      logger.info(
        {
          requestId,
          userId,
          channelId: result.channel.id,
          platform: channelData.platform,
        },
        "Created new channel",
      );

      return c.json(result, 201);
    } catch (error) {
      logger.error(
        {
          requestId,
          error: error instanceof Error ? error.message : "Unknown error",
        },
        "Error creating channel",
      );

      if (error instanceof z.ZodError) {
        return c.json(
          {
            error: "Invalid request data",
            message: "Request validation failed",
            details: error.issues,
          },
          400,
        );
      }

      if (
        error instanceof Error &&
        error.message === "Invalid configuration for platform"
      ) {
        return c.json(
          {
            error: "Invalid configuration",
            message: error.message,
          },
          400,
        );
      }

      return c.json(
        {
          error: "Internal server error",
          message: "Failed to create channel",
        },
        500,
      );
    }
  },
);

// PUT /api/channels/{id} - Update a channel
channelsRoutes.put(
  "/:id",
  describeRoute(putChannelRouteDescription),
  zValidator("json", UpdateChannelSchema),
  async (c) => {
    const requestId = c.get("requestId");

    try {
      const userId = await getAuthenticatedUserId(c);
      if (!userId) {
        return c.json(
          { error: "Unauthorized", message: "Authentication required" },
          401,
        );
      }

      const { id: channelId } = ChannelIdParamSchema.parse({
        id: c.req.param("id"),
      });
      const updateData = c.req.valid("json");

      const result = await updateChannel(channelId, userId, updateData);

      logger.info(
        {
          requestId,
          userId,
          channelId,
        },
        "Updated channel",
      );

      return c.json(result);
    } catch (error) {
      logger.error(
        {
          requestId,
          channelId: c.req.param("id"),
          error: error instanceof Error ? error.message : "Unknown error",
        },
        "Error updating channel",
      );

      if (error instanceof z.ZodError) {
        return c.json(
          {
            error: "Invalid request data",
            message: "Request validation failed",
            details: error.issues,
          },
          400,
        );
      }

      if (error instanceof Error) {
        if (error.message === "Channel not found") {
          return c.json(
            {
              error: "Channel not found",
              message:
                "The requested channel does not exist or you do not have access to it",
            },
            404,
          );
        }

        if (error.message === "Invalid configuration for platform") {
          return c.json(
            {
              error: "Invalid configuration",
              message: error.message,
            },
            400,
          );
        }
      }

      return c.json(
        {
          error: "Internal server error",
          message: "Failed to update channel",
        },
        500,
      );
    }
  },
);

// DELETE /api/channels/{id} - Delete a channel
channelsRoutes.delete(
  "/:id",
  describeRoute(deleteChannelRouteDescription),
  async (c) => {
    const requestId = c.get("requestId");

    try {
      const userId = await getAuthenticatedUserId(c);
      if (!userId) {
        return c.json(
          { error: "Unauthorized", message: "Authentication required" },
          401,
        );
      }

      const { id: channelId } = ChannelIdParamSchema.parse({
        id: c.req.param("id"),
      });

      const result = await deleteChannel(channelId, userId);

      logger.info(
        {
          requestId,
          userId,
          channelId,
        },
        "Deleted channel",
      );

      return c.json(result);
    } catch (error) {
      logger.error(
        {
          requestId,
          channelId: c.req.param("id"),
          error: error instanceof Error ? error.message : "Unknown error",
        },
        "Error deleting channel",
      );

      if (error instanceof z.ZodError) {
        return c.json(
          {
            error: "Invalid request data",
            message: "Request validation failed",
            details: error.issues,
          },
          400,
        );
      }

      if (error instanceof Error && error.message === "Channel not found") {
        return c.json(
          {
            error: "Channel not found",
            message:
              "The requested channel does not exist or you do not have access to it",
          },
          404,
        );
      }

      return c.json(
        {
          error: "Internal server error",
          message: "Failed to delete channel",
        },
        500,
      );
    }
  },
);

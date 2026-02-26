import { Hono } from "hono";
import { describeRoute, validator as zValidator } from "hono-openapi";
import { createChildLogger } from "../lib/logger.js";
// Import services
import {
  createChannel,
  deleteChannel,
  getUserChannels,
  updateChannel,
} from "../lib/services/channels.js";
import { withAuth } from "../middleware/with-auth.js";

// Import schemas
import {
  ChannelIdParamSchema,
  CreateChannelSchema,
  UpdateChannelSchema,
} from "../schemas/channels-params.js";
// Import route descriptions
import {
  deleteChannelRouteDescription,
  getChannelsRouteDescription,
  postChannelsRouteDescription,
  putChannelRouteDescription,
} from "../schemas/channels-routes.js";
import type { RouteVariables } from "../types/route-variables.js";

const logger = createChildLogger("routes:channels");

export const channelsRoutes = new Hono<{ Variables: RouteVariables }>();

// GET /api/channels - List user's channels
channelsRoutes.get(
  "/",
  describeRoute(getChannelsRouteDescription),
  withAuth(async (c, userId) => {
    const requestId = c.get("requestId");

    const result = await getUserChannels(userId);

    logger.info(
      {
        requestId,
        userId,
        channelCount: result.totalCount,
      },
      "Retrieved user channels",
    );

    return c.json(result);
  }, logger),
);

// POST /api/channels - Create a new channel
channelsRoutes.post(
  "/",
  describeRoute(postChannelsRouteDescription),
  zValidator("json", CreateChannelSchema),
  withAuth(async (c, userId) => {
    const requestId = c.get("requestId");

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
  }, logger),
);

// PUT /api/channels/{id} - Update a channel
channelsRoutes.put(
  "/:id",
  describeRoute(putChannelRouteDescription),
  zValidator("json", UpdateChannelSchema),
  withAuth(async (c, userId) => {
    const requestId = c.get("requestId");

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
  }, logger),
);

// DELETE /api/channels/{id} - Delete a channel
channelsRoutes.delete(
  "/:id",
  describeRoute(deleteChannelRouteDescription),
  withAuth(async (c, userId) => {
    const requestId = c.get("requestId");

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
  }, logger),
);

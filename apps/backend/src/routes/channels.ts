import { Hono } from "hono";
import { describeRoute, validator as zValidator } from "hono-openapi";
import { createChildLogger } from "../lib/logger.js";
// Import services
import {
  createChannel,
  deleteChannel,
  getChannelById,
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
    const channelData = c.req.valid("json");

    const channel = await createChannel(
      userId,
      { userId, actor: "user" },
      channelData,
    );

    logger.info(
      {
        requestId: c.get("requestId"),
        userId,
        channelId: channel.id,
        platform: channelData.platform,
      },
      "Created new channel",
    );

    return c.json(channel, 201);
  }, logger),
);

// GET /api/channels/:id - Get a single channel
channelsRoutes.get(
  "/:id",
  withAuth(async (c, userId) => {
    const { id: channelId } = ChannelIdParamSchema.parse({
      id: c.req.param("id"),
    });

    const channel = await getChannelById(channelId, userId);

    return c.json(channel);
  }, logger),
);

// PUT /api/channels/:id - Update a channel (full replace)
channelsRoutes.put(
  "/:id",
  describeRoute(putChannelRouteDescription),
  zValidator("json", UpdateChannelSchema),
  withAuth(async (c, userId) => {
    const { id: channelId } = ChannelIdParamSchema.parse({
      id: c.req.param("id"),
    });
    const updateData = c.req.valid("json");

    const channel = await updateChannel(
      channelId,
      userId,
      { userId, actor: "user" },
      updateData,
    );

    logger.info(
      {
        requestId: c.get("requestId"),
        userId,
        channelId,
      },
      "Updated channel",
    );

    return c.json(channel);
  }, logger),
);

// PATCH /api/channels/:id - Partial update a channel
channelsRoutes.patch(
  "/:id",
  zValidator("json", UpdateChannelSchema),
  withAuth(async (c, userId) => {
    const { id: channelId } = ChannelIdParamSchema.parse({
      id: c.req.param("id"),
    });
    const updateData = c.req.valid("json");

    const channel = await updateChannel(
      channelId,
      userId,
      { userId, actor: "user" },
      updateData,
    );

    logger.info(
      {
        requestId: c.get("requestId"),
        userId,
        channelId,
      },
      "Partially updated channel",
    );

    return c.json(channel);
  }, logger),
);

// DELETE /api/channels/:id - Delete a channel
channelsRoutes.delete(
  "/:id",
  describeRoute(deleteChannelRouteDescription),
  withAuth(async (c, userId) => {
    const { id: channelId } = ChannelIdParamSchema.parse({
      id: c.req.param("id"),
    });

    await deleteChannel(channelId, userId, { userId, actor: "user" });

    logger.info(
      {
        requestId: c.get("requestId"),
        userId,
        channelId,
      },
      "Deleted channel",
    );

    return new Response(null, { status: 204 });
  }, logger),
);

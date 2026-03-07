import { Hono } from "hono";
import { describeRoute, validator as zValidator } from "hono-openapi";
import { channelRegistry } from "../lib/channels.js";
import { createChildLogger } from "../lib/logger.js";
// Import services
import { getNotificationChannels } from "../lib/services/channels.js";
import { recordHistory } from "../lib/services/history.js";
import { withAuth } from "../middleware/with-auth.js";
// Import schemas
import { SendNotificationSchema } from "../schemas/channels-params.js";
import type { SendNotificationResponse } from "../schemas/channels-responses.js";
// Import route descriptions
import { postNotificationsRouteDescription } from "../schemas/notifications-routes.js";
import type { RouteVariables } from "../types/route-variables.js";

const logger = createChildLogger("routes:notifications");

export const notificationsRoutes = new Hono<{ Variables: RouteVariables }>();

// POST /api/notifications - Send notification
notificationsRoutes.post(
  "/",
  describeRoute(postNotificationsRouteDescription),
  zValidator("json", SendNotificationSchema),
  withAuth(async (c, userId) => {
    const requestId = c.get("requestId");

    const notificationData = c.req.valid("json");

    // Get channels to send notification to
    const targetChannels = await getNotificationChannels(
      userId,
      notificationData.targetChannels,
    );

    if (targetChannels.length === 0) {
      logger.warn(
        { requestId, userId },
        "No notification channels found for user",
      );
      return c.json({
        success: false,
        message: "No active notification channels found",
        results: [],
        totalChannels: 0,
        successfulChannels: 0,
        failedChannels: 0,
      } as SendNotificationResponse);
    }

    logger.info(
      {
        requestId,
        userId,
        channelCount: targetChannels.length,
        severity: notificationData.severity,
      },
      "Sending notification to channels",
    );

    // Send notifications to each channel
    const results = await Promise.allSettled(
      targetChannels.map(async (channel) => {
        try {
          let success = false;
          let error: string | undefined;

          if (channelRegistry.has(channel.platform)) {
            const adapter = channelRegistry.get(channel.platform);
            const result = await adapter.send(
              channel,
              notificationData.message,
              notificationData.options,
            );
            success = result.success;
            error = result.error;
          } else {
            success = false;
            error = `No adapter registered for platform: ${channel.platform}`;
          }

          return {
            channelId: channel.id,
            channelName: channel.name,
            platform: channel.platform,
            success,
            error,
          };
        } catch (err) {
          return {
            channelId: channel.id,
            channelName: channel.name,
            platform: channel.platform,
            success: false,
            error: err instanceof Error ? err.message : "Unknown error",
          };
        }
      }),
    );

    // Process results
    const processedResults = results.map((result) => {
      if (result.status === "fulfilled") {
        return result.value;
      } else {
        // This shouldn't happen with our Promise.allSettled approach, but just in case
        return {
          channelId: "unknown",
          channelName: "unknown",
          // biome-ignore lint/suspicious/noExplicitAny: platform union fallback value
          platform: "unknown" as any,
          success: false,
          error:
            result.reason instanceof Error
              ? result.reason.message
              : "Promise rejected",
        };
      }
    });

    const successfulChannels = processedResults.filter((r) => r.success).length;
    const failedChannels = processedResults.length - successfulChannels;

    // Record history
    await recordHistory({
      action: "send_notification",
      itemType: "notification",
      itemId: `notif-${requestId}`,
      itemName: "Channel Notification",
      beforeData: {
        message: notificationData.message,
        severity: notificationData.severity,
        targetChannels: notificationData.targetChannels,
      },
      afterData: {
        totalChannels: targetChannels.length,
        successfulChannels,
        failedChannels,
        results: processedResults,
      },
      actor: "user",
      userId: userId,
      metadata: {
        requestId,
        severity: notificationData.severity,
      },
    });

    const response: SendNotificationResponse = {
      success: successfulChannels > 0,
      message:
        successfulChannels === processedResults.length
          ? "Notification sent to all channels successfully"
          : failedChannels === processedResults.length
            ? "Failed to send notification to any channel"
            : `Notification sent to ${successfulChannels} of ${processedResults.length} channels`,
      results: processedResults,
      totalChannels: targetChannels.length,
      successfulChannels,
      failedChannels,
    };

    logger.info(
      {
        requestId,
        userId,
        totalChannels: targetChannels.length,
        successfulChannels,
        failedChannels,
      },
      "Notification sending completed",
    );

    return c.json(response);
  }, logger),
);

import { Hono } from "hono";
import { describeRoute, validator as zValidator } from "hono-openapi";
import z from "zod/v4";
import { getAuthenticatedUserId } from "../lib/auth-utils.js";
import { createChildLogger } from "../lib/logger.js";
// Import services
import { getNotificationChannels } from "../lib/services/channels.js";
import { recordHistory } from "../lib/services/history.js";
import { sendTelegramMessage } from "../lib/services/telegram.js";
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

            switch (channel.platform) {
              case "telegram":
                success = await sendTelegramMessage(
                  channel.id,
                  notificationData.message,
                  notificationData.options,
                );
                break;

              case "slack":
              case "whatsapp":
              case "email":
                // TODO: Implement other platforms
                success = false;
                error = `${channel.platform} notifications not yet implemented`;
                break;

              default:
                success = false;
                error = `Unsupported platform: ${channel.platform}`;
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
            platform: "unknown" as any,
            success: false,
            error:
              result.reason instanceof Error
                ? result.reason.message
                : "Promise rejected",
          };
        }
      });

      const successfulChannels = processedResults.filter(
        (r) => r.success,
      ).length;
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
    } catch (error) {
      logger.error(
        {
          requestId,
          error: error instanceof Error ? error.message : "Unknown error",
        },
        "Error sending notification",
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

      return c.json(
        {
          error: "Internal server error",
          message: "Failed to send notification",
        },
        500,
      );
    }
  },
);

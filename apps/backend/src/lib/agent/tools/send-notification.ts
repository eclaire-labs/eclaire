/**
 * Send Notification Tool
 *
 * Send a notification message to the user's configured channels. Requires approval.
 */

import {
  errorResult,
  textResult,
  type RuntimeToolDefinition,
} from "@eclaire/ai";
import z from "zod/v4";
import { channelRegistry } from "../../channels.js";
import { getNotificationChannels } from "../../services/channels.js";

const inputSchema = z.object({
  message: z.string().min(1).describe("The notification message to send"),
  channelIds: z
    .array(z.string())
    .optional()
    .describe(
      "Specific channel IDs to send to. If omitted, sends to all active notification channels.",
    ),
});

export const sendNotificationTool: RuntimeToolDefinition<typeof inputSchema> = {
  name: "sendNotification",
  label: "Send Notification",
  description:
    "Send a notification message to the user's configured channels (Telegram, Discord, Slack, etc.).",
  inputSchema,
  needsApproval: true,
  promptGuidelines: [
    "Always confirm with the user before sending notifications.",
    "Describe which channels will receive the message.",
  ],
  execute: async (_callId, input, ctx) => {
    const channels = await getNotificationChannels(
      ctx.userId,
      input.channelIds,
    );

    if (channels.length === 0) {
      return errorResult(
        "No active notification channels found. The user needs to configure channels first.",
      );
    }

    const results = await Promise.allSettled(
      channels.map(async (channel) => {
        if (!channelRegistry.has(channel.platform)) {
          return {
            channel: channel.name,
            success: false,
            error: `No adapter for platform: ${channel.platform}`,
          };
        }
        const adapter = channelRegistry.get(channel.platform);
        const result = await adapter.send(channel, input.message);
        return {
          channel: channel.name,
          success: result.success,
          error: result.error,
        };
      }),
    );

    const processed = results.map((r) =>
      r.status === "fulfilled"
        ? r.value
        : { channel: "unknown", success: false, error: "Send failed" },
    );

    const succeeded = processed.filter((r) => r.success).length;
    const summary = `Sent to ${succeeded}/${processed.length} channels.`;

    return textResult(JSON.stringify({ summary, results: processed }, null, 2));
  },
};

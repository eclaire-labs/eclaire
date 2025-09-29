import { z } from "zod";
import "zod-openapi/extend";

// Channel platform types
export const ChannelPlatformSchema = z
  .enum(["telegram", "slack", "whatsapp", "email"])
  .openapi({
    description: "Platform type for the communication channel",
    examples: ["telegram", "slack", "email"],
  });

// Channel capability types
export const ChannelCapabilitySchema = z
  .enum(["notification", "chat", "bidirectional"])
  .openapi({
    description: "Capability type of the channel",
    examples: ["notification", "chat", "bidirectional"],
  });

// Telegram-specific config schema
export const TelegramConfigSchema = z
  .object({
    chat_identifier: z
      .string()
      .min(1, "Chat identifier is required")
      .openapi({
        description: "Telegram chat identifier (chat ID or username)",
        examples: ["-1001234567890", "@mychannel", "123456789"],
      }),
    bot_token: z
      .string()
      .min(1, "Bot token is required")
      .openapi({
        description: "Telegram bot token for authentication",
        examples: ["1234567890:ABCdefGHIjklMNOpqrsTUVwxyz"],
      }),
  })
  .openapi({
    description: "Configuration for Telegram channels",
  });

// Create channel request schema
export const CreateChannelSchema = z
  .object({
    name: z
      .string()
      .min(1, "Channel name is required")
      .max(255, "Channel name too long")
      .openapi({
        description: "Display name for the channel",
        examples: [
          "My Telegram Channel",
          "Slack Notifications",
          "Email Alerts",
        ],
      }),
    platform: ChannelPlatformSchema,
    capability: ChannelCapabilitySchema,
    config: z
      .object({})
      .passthrough()
      .openapi({
        description:
          "Platform-specific configuration (validated separately based on platform)",
        examples: [
          { chat_identifier: "-1001234567890", bot_token: "1234567890:ABC" },
          { webhook_url: "https://hooks.slack.com/services/..." },
        ],
      }),
  })
  .openapi({
    ref: "CreateChannelRequest",
    description: "Request data for creating a new communication channel",
  });

// Update channel request schema
export const UpdateChannelSchema = z
  .object({
    name: z
      .string()
      .min(1, "Channel name is required")
      .max(255, "Channel name too long")
      .optional()
      .openapi({
        description: "Updated display name for the channel",
        examples: ["Updated Channel Name"],
      }),
    capability: ChannelCapabilitySchema.optional(),
    config: z
      .object({})
      .passthrough()
      .optional()
      .openapi({
        description: "Updated platform-specific configuration",
        examples: [
          { chat_identifier: "-1001234567890", bot_token: "1234567890:ABC" },
        ],
      }),
    isActive: z
      .boolean()
      .optional()
      .openapi({
        description:
          "Whether the channel is active and should receive notifications",
        examples: [true, false],
      }),
  })
  .strict()
  .openapi({
    ref: "UpdateChannelRequest",
    description: "Request data for updating an existing communication channel",
  });

// Channel ID parameter schema
export const ChannelIdParamSchema = z
  .object({
    id: z
      .string()
      .min(1, "Channel ID is required")
      .openapi({
        description: "Unique identifier of the channel",
        examples: ["ch-abc123def", "channel-456"],
      }),
  })
  .openapi({
    ref: "ChannelIdParam",
    description: "Path parameter for channel ID",
  });

// Send notification request schema
export const SendNotificationSchema = z
  .object({
    message: z
      .string()
      .min(1, "Message is required")
      .openapi({
        description: "The notification message to send",
        examples: [
          "System alert: High CPU usage detected",
          "Task completed successfully: Data backup finished",
          "Warning: Disk space is running low",
        ],
      }),
    severity: z
      .enum(["info", "warning", "error", "critical"])
      .optional()
      .default("info")
      .openapi({
        description: "Severity level of the notification",
        examples: ["info", "warning", "error", "critical"],
      }),
    targetChannels: z
      .array(z.string())
      .optional()
      .openapi({
        description:
          "Array of channel IDs to send notification to. If not provided, sends to all notification-capable channels",
        examples: [["ch-abc123", "ch-def456"]],
      }),
    options: z
      .object({
        parseMode: z
          .enum(["HTML", "Markdown", "MarkdownV2"])
          .optional()
          .openapi({
            description:
              "Parse mode for message formatting (Telegram-specific)",
            examples: ["HTML", "Markdown"],
          }),
        disableWebPagePreview: z
          .boolean()
          .optional()
          .openapi({
            description:
              "Disable web page previews in the message (Telegram-specific)",
            examples: [true, false],
          }),
      })
      .optional()
      .openapi({
        description: "Platform-specific options for the notification",
      }),
  })
  .openapi({
    ref: "SendNotificationRequest",
    description:
      "Request data for sending a notification to communication channels",
  });

export type ChannelPlatform = z.infer<typeof ChannelPlatformSchema>;
export type ChannelCapability = z.infer<typeof ChannelCapabilitySchema>;
export type TelegramConfig = z.infer<typeof TelegramConfigSchema>;
export type CreateChannelRequest = z.infer<typeof CreateChannelSchema>;
export type UpdateChannelRequest = z.infer<typeof UpdateChannelSchema>;
export type ChannelIdParam = z.infer<typeof ChannelIdParamSchema>;
export type SendNotificationRequest = z.infer<typeof SendNotificationSchema>;

import z from "zod/v4";
import { getDeps } from "./deps.js";

export const SlackConfigSchema = z
  .object({
    bot_token: z
      .string()
      .min(1, "Bot token is required")
      .meta({
        description: "Slack Bot User OAuth Token (starts with xoxb-)",
        examples: ["xoxb-your-slack-bot-token"],
      }),
    app_token: z
      .string()
      .min(1, "App token is required")
      .meta({
        description: "Slack App-Level Token for Socket Mode (starts with xapp-)",
        examples: ["xapp-your-slack-app-token"],
      }),
    channel_id: z
      .string()
      .min(1, "Channel ID is required")
      .meta({
        description: "Slack channel ID",
        examples: ["C1234567890"],
      }),
    mention_mode: z
      .enum(["all", "mention_only", "mention_or_reply"])
      .default("all")
      .meta({
        description:
          'When to process messages: "all" processes every message, "mention_only" requires @mention, "mention_or_reply" requires @mention or reply to bot',
      }),
  })
  .strict()
  .meta({
    description: "Configuration for Slack channels",
  });

export type SlackConfig = z.infer<typeof SlackConfigSchema>;

/**
 * Validates raw config input and encrypts tokens for storage.
 */
export function validateAndEncryptConfig(
  rawConfig: unknown,
): Record<string, unknown> {
  const { encrypt } = getDeps();
  const validated = SlackConfigSchema.parse(rawConfig);
  return {
    channel_id: validated.channel_id,
    bot_token: encrypt(validated.bot_token),
    app_token: encrypt(validated.app_token),
    mention_mode: validated.mention_mode,
  };
}

/**
 * Decrypts stored config for runtime use.
 * Returns null on failure.
 */
export function decryptConfig(
  storedConfig: unknown,
): SlackConfig | null {
  const { decrypt, logger } = getDeps();

  try {
    if (!storedConfig || typeof storedConfig !== "object") {
      logger.error("Invalid config format - not an object");
      return null;
    }

    const { channel_id, bot_token, app_token } = storedConfig as Record<
      string,
      unknown
    >;

    if (!channel_id || !bot_token || !app_token) {
      logger.error("Missing required config fields");
      return null;
    }

    let decryptedBotToken = bot_token as string;
    if (typeof bot_token === "string") {
      decryptedBotToken = decrypt(bot_token);
      if (!decryptedBotToken) {
        logger.error("Failed to decrypt bot token");
        return null;
      }
    }

    let decryptedAppToken = app_token as string;
    if (typeof app_token === "string") {
      decryptedAppToken = decrypt(app_token);
      if (!decryptedAppToken) {
        logger.error("Failed to decrypt app token");
        return null;
      }
    }

    const raw = storedConfig as Record<string, unknown>;

    return {
      channel_id: channel_id as string,
      bot_token: decryptedBotToken,
      app_token: decryptedAppToken,
      mention_mode: (raw.mention_mode as SlackConfig["mention_mode"]) ?? "all",
    };
  } catch (error) {
    const { logger: log } = getDeps();
    log.error(
      { error: error instanceof Error ? error.message : "Unknown error" },
      "Error decrypting Slack config",
    );
    return null;
  }
}

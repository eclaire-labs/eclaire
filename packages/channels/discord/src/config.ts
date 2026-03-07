import z from "zod/v4";
import { getDeps } from "./deps.js";

export const DiscordConfigSchema = z
  .object({
    channel_id: z
      .string()
      .min(1, "Channel ID is required")
      .meta({
        description: "Discord text channel snowflake ID",
        examples: ["1234567890123456789"],
      }),
    bot_token: z
      .string()
      .min(1, "Bot token is required")
      .meta({
        description: "Discord bot token from the Developer Portal",
        examples: ["your-discord-bot-token"],
      }),
  })
  .strict()
  .meta({
    description: "Configuration for Discord channels",
  });

export type DiscordConfig = z.infer<typeof DiscordConfigSchema>;

/**
 * Validates raw config input and encrypts the bot token for storage.
 */
export function validateAndEncryptConfig(
  rawConfig: unknown,
): Record<string, unknown> {
  const { encrypt } = getDeps();
  const validated = DiscordConfigSchema.parse(rawConfig);
  return {
    channel_id: validated.channel_id,
    bot_token: encrypt(validated.bot_token),
  };
}

/**
 * Decrypts stored config for runtime use.
 * Returns null on failure.
 */
export function decryptConfig(
  storedConfig: unknown,
): DiscordConfig | null {
  const { decrypt, logger } = getDeps();

  try {
    if (!storedConfig || typeof storedConfig !== "object") {
      logger.error("Invalid config format - not an object");
      return null;
    }

    const { channel_id, bot_token } = storedConfig as Record<
      string,
      unknown
    >;

    if (!channel_id || !bot_token) {
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

    return {
      channel_id: channel_id as string,
      bot_token: decryptedBotToken,
    };
  } catch (error) {
    const { logger: log } = getDeps();
    log.error(
      { error: error instanceof Error ? error.message : "Unknown error" },
      "Error decrypting Discord config",
    );
    return null;
  }
}

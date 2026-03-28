import z from "zod/v4";
import { getDeps } from "./deps.js";

export const TelegramConfigSchema = z
  .object({
    chat_identifier: z
      .string()
      .min(1, "Chat identifier is required")
      .meta({
        description: "Telegram chat identifier (chat ID or username)",
        examples: ["-1001234567890", "@mychannel", "123456789"],
      }),
    bot_token: z
      .string()
      .min(1, "Bot token is required")
      .meta({
        description: "Telegram bot token for authentication",
        examples: ["your-telegram-bot-token"],
      }),
  })
  .strict()
  .meta({
    description: "Configuration for Telegram channels",
  });

export type TelegramConfig = z.infer<typeof TelegramConfigSchema>;

/**
 * Validates raw config input and encrypts the bot token for storage.
 */
export function validateAndEncryptConfig(
  rawConfig: unknown,
): Record<string, unknown> {
  const { encrypt } = getDeps();
  const validated = TelegramConfigSchema.parse(rawConfig);
  return {
    chat_identifier: validated.chat_identifier,
    bot_token: encrypt(validated.bot_token),
  };
}

/**
 * Decrypts stored config for runtime use.
 * Returns null on failure.
 */
export function decryptConfig(storedConfig: unknown): TelegramConfig | null {
  const { decrypt, logger } = getDeps();

  try {
    if (!storedConfig || typeof storedConfig !== "object") {
      logger.error("Invalid config format - not an object");
      return null;
    }

    const { chat_identifier, bot_token } = storedConfig as Record<
      string,
      unknown
    >;

    if (!chat_identifier || !bot_token) {
      logger.error("Missing required config fields");
      return null;
    }

    const decryptedBotToken = decrypt(bot_token as string);
    if (!decryptedBotToken) {
      logger.error("Failed to decrypt bot token");
      return null;
    }

    return {
      chat_identifier: chat_identifier as string,
      bot_token: decryptedBotToken,
    };
  } catch (error) {
    const { logger } = getDeps();
    logger.error(
      { error: error instanceof Error ? error.message : "Unknown error" },
      "Error decrypting Telegram config",
    );
    return null;
  }
}

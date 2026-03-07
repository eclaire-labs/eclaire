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
    mention_mode: z
      .enum(["all", "mention_only", "mention_or_reply"])
      .default("all")
      .meta({
        description:
          'When to process messages: "all" processes every message, "mention_only" requires @mention, "mention_or_reply" requires @mention or reply to bot',
      }),
    voice_channel_id: z
      .string()
      .optional()
      .meta({
        description: "Discord voice channel snowflake ID to join (optional)",
        examples: ["1234567890123456789"],
      }),
    voice_mode: z
      .enum(["listen", "speak", "both"])
      .default("both")
      .meta({
        description:
          'Voice channel behavior: "listen" to transcribe users, "speak" to play responses, "both" for full two-way',
      }),
    stt_enabled: z
      .boolean()
      .default(true)
      .meta({
        description: "Whether to transcribe voice channel audio via speech-to-text",
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
    mention_mode: validated.mention_mode,
    ...(validated.voice_channel_id && { voice_channel_id: validated.voice_channel_id }),
    voice_mode: validated.voice_mode,
    stt_enabled: validated.stt_enabled,
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

    const raw = storedConfig as Record<string, unknown>;

    return {
      channel_id: channel_id as string,
      bot_token: decryptedBotToken,
      mention_mode: (raw.mention_mode as DiscordConfig["mention_mode"]) ?? "all",
      voice_channel_id: raw.voice_channel_id as string | undefined,
      voice_mode: (raw.voice_mode as DiscordConfig["voice_mode"]) ?? "both",
      stt_enabled: typeof raw.stt_enabled === "boolean" ? raw.stt_enabled : true,
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

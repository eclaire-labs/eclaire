import type { CommandSessionState } from "@eclaire/channels-core";
import {
  buildHelpText,
  clearConversation,
  describeModel,
  listConversationHistory,
  startNewConversation,
  toggleThinking,
} from "@eclaire/channels-core";
import {
  type ChatInputCommandInteraction,
  type Client,
  SlashCommandBuilder,
} from "discord.js";

import { getDeps } from "./deps.js";

/** Per-channel session state (in-memory, resets on bot restart). */
export type DiscordSessionData = CommandSessionState;

// In-memory session store keyed by eclaire channelId
const sessions = new Map<string, DiscordSessionData>();

/** Reset all session state. Used by tests. */
export function resetSessions(): void {
  sessions.clear();
}

export function getSession(channelId: string): DiscordSessionData {
  let session = sessions.get(channelId);
  if (!session) {
    session = { enableThinking: true };
    sessions.set(channelId, session);
  }
  return session;
}

interface CommandDef {
  builder: SlashCommandBuilder;
  handler: (
    interaction: ChatInputCommandInteraction,
    channelId: string,
    userId: string,
  ) => Promise<void>;
}

const COMMANDS: CommandDef[] = [
  {
    builder: new SlashCommandBuilder()
      .setName("eclaire-help")
      .setDescription("Show available Eclaire commands"),
    handler: async (interaction) => {
      await interaction.editReply(buildHelpText("eclaire-"));
    },
  },
  {
    builder: new SlashCommandBuilder()
      .setName("eclaire-new")
      .setDescription("Start a new conversation"),
    handler: async (interaction, channelId, userId) => {
      try {
        await interaction.editReply(
          await startNewConversation(
            getDeps(),
            getSession(channelId),
            channelId,
            userId,
          ),
        );
      } catch {
        await interaction.editReply(
          "Failed to start a new conversation. Please try again.",
        );
      }
    },
  },
  {
    builder: new SlashCommandBuilder()
      .setName("eclaire-model")
      .setDescription("Show current AI model"),
    handler: async (interaction) => {
      await interaction.editReply(describeModel(getDeps()));
    },
  },
  {
    builder: new SlashCommandBuilder()
      .setName("eclaire-history")
      .setDescription("Show recent conversations"),
    handler: async (interaction, channelId, userId) => {
      try {
        await interaction.editReply(
          await listConversationHistory(getDeps(), channelId, userId),
        );
      } catch {
        await interaction.editReply("Failed to retrieve conversation history.");
      }
    },
  },
  {
    builder: new SlashCommandBuilder()
      .setName("eclaire-settings")
      .setDescription("Toggle thinking mode"),
    handler: async (interaction, channelId) => {
      await interaction.editReply(toggleThinking(getSession(channelId)));
    },
  },
  {
    builder: new SlashCommandBuilder()
      .setName("eclaire-clear")
      .setDescription("Clear conversation and start fresh"),
    handler: async (interaction, channelId, userId) => {
      try {
        await interaction.editReply(
          await clearConversation(
            getDeps(),
            getSession(channelId),
            channelId,
            userId,
          ),
        );
      } catch {
        await interaction.editReply(
          "Failed to clear conversation. Please try again.",
        );
      }
    },
  },
];

/**
 * Register Discord application commands.
 * Call inside the `ready` event when `client.application` is available.
 */
export async function registerApplicationCommands(
  client: Client,
): Promise<void> {
  const { logger } = getDeps();
  try {
    await client.application?.commands.set(
      COMMANDS.map((cmd) => cmd.builder.toJSON()),
    );
    logger.info(
      { count: COMMANDS.length },
      "Discord application commands registered",
    );
  } catch (error) {
    logger.warn(
      {
        error: error instanceof Error ? error.message : "Unknown error",
      },
      "Failed to register Discord application commands (non-fatal)",
    );
  }
}

/**
 * Handle an incoming slash command interaction.
 * Returns true if the interaction was handled.
 */
export async function handleCommandInteraction(
  interaction: ChatInputCommandInteraction,
  channelId: string,
  userId: string,
): Promise<boolean> {
  const { logger } = getDeps();
  const cmd = COMMANDS.find((c) => c.builder.name === interaction.commandName);
  if (!cmd) return false;

  try {
    await interaction.deferReply({ ephemeral: true });
    await cmd.handler(interaction, channelId, userId);
  } catch (error) {
    logger.error(
      {
        command: interaction.commandName,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      "Error handling Discord command interaction",
    );
    try {
      if (interaction.deferred) {
        await interaction.editReply("An error occurred. Please try again.");
      }
    } catch {
      // ignore reply failure
    }
  }
  return true;
}

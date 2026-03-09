import {
  type ChatInputCommandInteraction,
  type Client,
  SlashCommandBuilder,
} from "discord.js";
import { getDeps } from "./deps.js";

/** Per-channel session state (in-memory, resets on bot restart). */
export interface DiscordSessionData {
  sessionId?: string;
  enableThinking: boolean;
}

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
      const lines = COMMANDS.map(
        (cmd) => `/${cmd.builder.name} — ${cmd.builder.description}`,
      );
      await interaction.editReply(`Available commands:\n\n${lines.join("\n")}`);
    },
  },
  {
    builder: new SlashCommandBuilder()
      .setName("eclaire-new")
      .setDescription("Start a new conversation"),
    handler: async (interaction, channelId, userId) => {
      const { createSession } = getDeps();
      if (!createSession) {
        await interaction.editReply("Session management is not available.");
        return;
      }
      try {
        const session = await createSession(userId);
        const state = getSession(channelId);
        state.sessionId = session.id;
        await interaction.editReply("New conversation started.");
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
      const { getModelInfo } = getDeps();
      if (!getModelInfo) {
        await interaction.editReply("Model information is not available.");
        return;
      }
      const info = getModelInfo();
      if (!info) {
        await interaction.editReply("No model is currently configured.");
        return;
      }
      await interaction.editReply(
        `Current model: ${info.name}\nProvider: ${info.provider}\nModel: ${info.model}`,
      );
    },
  },
  {
    builder: new SlashCommandBuilder()
      .setName("eclaire-history")
      .setDescription("Show recent conversations"),
    handler: async (interaction, _channelId, userId) => {
      const { listSessions } = getDeps();
      if (!listSessions) {
        await interaction.editReply("Session history is not available.");
        return;
      }
      try {
        const list = await listSessions(userId, 10);
        if (list.length === 0) {
          await interaction.editReply("No conversations found.");
          return;
        }
        const lines = list.map((s, i) => {
          const title =
            s.title.length > 40 ? `${s.title.slice(0, 37)}...` : s.title;
          return `${i + 1}. ${title} (${s.messageCount} msgs)`;
        });
        await interaction.editReply(
          `Recent conversations:\n\n${lines.join("\n")}`,
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
      const state = getSession(channelId);
      state.enableThinking = !state.enableThinking;
      const label = state.enableThinking ? "ON" : "OFF";
      await interaction.editReply(`Thinking mode: ${label}`);
    },
  },
  {
    builder: new SlashCommandBuilder()
      .setName("eclaire-clear")
      .setDescription("Clear conversation and start fresh"),
    handler: async (interaction, channelId, userId) => {
      const { createSession, deleteSession } = getDeps();
      const state = getSession(channelId);
      try {
        if (state.sessionId && deleteSession) {
          await deleteSession(state.sessionId, userId);
        }
        state.sessionId = undefined;

        if (createSession) {
          const session = await createSession(userId);
          state.sessionId = session.id;
        }
        await interaction.editReply("Conversation cleared.");
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

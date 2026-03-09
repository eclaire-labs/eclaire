import type { Context, Telegraf } from "telegraf";
import { getDeps } from "./deps.js";

/** Per-chat session state stored by Telegraf's session middleware. */
export interface TelegramSessionData {
  sessionId?: string;
  enableThinking: boolean;
}

/** Telegraf context extended with our session data. */
export interface BotContext extends Context {
  session: TelegramSessionData;
}

interface TelegramCommand {
  name: string;
  description: string;
  handler: (
    ctx: BotContext,
    channelId: string,
    userId: string,
  ) => Promise<void>;
}

const COMMANDS: TelegramCommand[] = [
  {
    name: "start",
    description: "Start the assistant",
    handler: async (ctx, _channelId, userId) => {
      const { createSession, logger } = getDeps();
      try {
        if (createSession && !ctx.session.sessionId) {
          const session = await createSession(userId);
          ctx.session.sessionId = session.id;
        }
        await ctx.reply(
          "Hello! I'm your Eclaire assistant. How can I help you today?",
        );
      } catch (error) {
        logger.error(
          { error: error instanceof Error ? error.message : "Unknown error" },
          "Failed to handle /start command",
        );
      }
    },
  },
  {
    name: "help",
    description: "Show available commands",
    handler: async (ctx) => {
      const { logger } = getDeps();
      try {
        const lines = COMMANDS.map(
          (cmd) => `/${cmd.name} — ${cmd.description}`,
        );
        await ctx.reply(`Available commands:\n\n${lines.join("\n")}`);
      } catch (error) {
        logger.error(
          { error: error instanceof Error ? error.message : "Unknown error" },
          "Failed to handle /help command",
        );
      }
    },
  },
  {
    name: "new",
    description: "Start a new conversation",
    handler: async (ctx, _channelId, userId) => {
      const { createSession, logger } = getDeps();
      if (!createSession) {
        await ctx.reply("Session management is not available.");
        return;
      }
      try {
        const session = await createSession(userId);
        ctx.session.sessionId = session.id;
        await ctx.reply("New conversation started.");
      } catch (error) {
        logger.error(
          { error: error instanceof Error ? error.message : "Unknown error" },
          "Failed to handle /new command",
        );
        await ctx.reply(
          "Failed to start a new conversation. Please try again.",
        );
      }
    },
  },
  {
    name: "model",
    description: "Show current AI model",
    handler: async (ctx) => {
      const { getModelInfo, logger } = getDeps();
      if (!getModelInfo) {
        await ctx.reply("Model information is not available.");
        return;
      }
      try {
        const info = getModelInfo();
        if (!info) {
          await ctx.reply("No model is currently configured.");
          return;
        }
        await ctx.reply(
          `Current model: ${info.name}\nProvider: ${info.provider}\nModel: ${info.model}`,
        );
      } catch (error) {
        logger.error(
          { error: error instanceof Error ? error.message : "Unknown error" },
          "Failed to handle /model command",
        );
        await ctx.reply("Failed to retrieve model information.");
      }
    },
  },
  {
    name: "history",
    description: "Show recent conversations",
    handler: async (ctx, _channelId, userId) => {
      const { listSessions, logger } = getDeps();
      if (!listSessions) {
        await ctx.reply("Session history is not available.");
        return;
      }
      try {
        const sessions = await listSessions(userId, 10);
        if (sessions.length === 0) {
          await ctx.reply("No conversations found.");
          return;
        }

        const lines = sessions.map((s, i) => {
          const title =
            s.title.length > 40 ? `${s.title.slice(0, 37)}...` : s.title;
          return `${i + 1}. ${title} (${s.messageCount} msgs)`;
        });
        await ctx.reply(`Recent conversations:\n\n${lines.join("\n")}`);
      } catch (error) {
        logger.error(
          { error: error instanceof Error ? error.message : "Unknown error" },
          "Failed to handle /history command",
        );
        await ctx.reply("Failed to retrieve conversation history.");
      }
    },
  },
  {
    name: "settings",
    description: "Toggle thinking mode",
    handler: async (ctx) => {
      const { logger } = getDeps();
      try {
        ctx.session.enableThinking = !ctx.session.enableThinking;
        const state = ctx.session.enableThinking ? "ON" : "OFF";
        await ctx.reply(`Thinking mode: ${state}`);
      } catch (error) {
        logger.error(
          { error: error instanceof Error ? error.message : "Unknown error" },
          "Failed to handle /settings command",
        );
      }
    },
  },
  {
    name: "clear",
    description: "Clear conversation and start fresh",
    handler: async (ctx, _channelId, userId) => {
      const { createSession, deleteSession, logger } = getDeps();
      try {
        // Delete current session if one exists
        if (ctx.session.sessionId && deleteSession) {
          await deleteSession(ctx.session.sessionId, userId);
        }
        ctx.session.sessionId = undefined;

        // Create a fresh session if possible
        if (createSession) {
          const session = await createSession(userId);
          ctx.session.sessionId = session.id;
        }

        await ctx.reply("Conversation cleared.");
      } catch (error) {
        logger.error(
          { error: error instanceof Error ? error.message : "Unknown error" },
          "Failed to handle /clear command",
        );
        await ctx.reply("Failed to clear conversation. Please try again.");
      }
    },
  },
];

/**
 * Register all slash commands on the bot.
 * Must be called BEFORE bot.on("text") so Telegraf matches commands first.
 */
export function registerCommands(
  bot: Telegraf<BotContext>,
  channelId: string,
  userId: string,
): void {
  for (const cmd of COMMANDS) {
    bot.command(cmd.name, (ctx) =>
      cmd.handler(ctx as BotContext, channelId, userId),
    );
  }
}

/** Command list for Telegram's setMyCommands API. */
export function getCommandList(): Array<{
  command: string;
  description: string;
}> {
  return COMMANDS.map((cmd) => ({
    command: cmd.name,
    description: cmd.description,
  }));
}

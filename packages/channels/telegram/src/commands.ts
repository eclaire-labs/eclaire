import type { CommandSessionState } from "@eclaire/channels-core";
import {
  buildHelpText,
  clearConversation,
  describeModel,
  listConversationHistory,
  startNewConversation,
  toggleThinking,
} from "@eclaire/channels-core";
import type { Context, Telegraf } from "telegraf";

import { getDeps } from "./deps.js";

/** Per-chat session state stored by Telegraf's session middleware. */
export type TelegramSessionData = CommandSessionState;

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
    handler: async (ctx, channelId, userId) => {
      const deps = getDeps();
      try {
        if (deps.createSession && !ctx.session.sessionId) {
          await startNewConversation(deps, ctx.session, channelId, userId);
        }
        await ctx.reply(
          "Hello! I'm your Eclaire assistant. How can I help you today?",
        );
      } catch (error) {
        deps.logger.error(
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
        await ctx.reply(buildHelpText());
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
    handler: async (ctx, channelId, userId) => {
      const deps = getDeps();
      try {
        await ctx.reply(
          await startNewConversation(deps, ctx.session, channelId, userId),
        );
      } catch (error) {
        deps.logger.error(
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
      const deps = getDeps();
      try {
        await ctx.reply(describeModel(deps));
      } catch (error) {
        deps.logger.error(
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
    handler: async (ctx, channelId, userId) => {
      const deps = getDeps();
      try {
        await ctx.reply(await listConversationHistory(deps, channelId, userId));
      } catch (error) {
        deps.logger.error(
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
        await ctx.reply(toggleThinking(ctx.session));
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
    handler: async (ctx, channelId, userId) => {
      const deps = getDeps();
      try {
        await ctx.reply(
          await clearConversation(deps, ctx.session, channelId, userId),
        );
      } catch (error) {
        deps.logger.error(
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

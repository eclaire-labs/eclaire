import type { CommandSessionState } from "@eclaire/channels-core";
import {
  buildHelpText,
  clearConversation,
  describeModel,
  listConversationHistory,
  startNewConversation,
  toggleThinking,
} from "@eclaire/channels-core";
import type { App } from "@slack/bolt";

import { getDeps } from "./deps.js";

/** Per-channel session state (in-memory, resets on bot restart). */
export type SlackSessionData = CommandSessionState;

// In-memory session store keyed by eclaire channelId
const sessions = new Map<string, SlackSessionData>();

export function getSession(channelId: string): SlackSessionData {
  let session = sessions.get(channelId);
  if (!session) {
    session = { enableThinking: true };
    sessions.set(channelId, session);
  }
  return session;
}

interface SlackCommand {
  name: string;
  description: string;
  handler: (
    respond: (text: string) => Promise<void>,
    channelId: string,
    userId: string,
  ) => Promise<void>;
}

const COMMANDS: SlackCommand[] = [
  {
    name: "eclaire-help",
    description: "Show available Eclaire commands",
    handler: async (respond) => {
      await respond(buildHelpText("eclaire-"));
    },
  },
  {
    name: "eclaire-new",
    description: "Start a new conversation",
    handler: async (respond, channelId, userId) => {
      try {
        await respond(
          await startNewConversation(
            getDeps(),
            getSession(channelId),
            channelId,
            userId,
          ),
        );
      } catch {
        await respond("Failed to start a new conversation. Please try again.");
      }
    },
  },
  {
    name: "eclaire-model",
    description: "Show current AI model",
    handler: async (respond) => {
      await respond(describeModel(getDeps()));
    },
  },
  {
    name: "eclaire-history",
    description: "Show recent conversations",
    handler: async (respond, channelId, userId) => {
      try {
        await respond(
          await listConversationHistory(getDeps(), channelId, userId),
        );
      } catch {
        await respond("Failed to retrieve conversation history.");
      }
    },
  },
  {
    name: "eclaire-settings",
    description: "Toggle thinking mode",
    handler: async (respond, channelId) => {
      await respond(toggleThinking(getSession(channelId)));
    },
  },
  {
    name: "eclaire-clear",
    description: "Clear conversation and start fresh",
    handler: async (respond, channelId, userId) => {
      try {
        await respond(
          await clearConversation(
            getDeps(),
            getSession(channelId),
            channelId,
            userId,
          ),
        );
      } catch {
        await respond("Failed to clear conversation. Please try again.");
      }
    },
  },
];

/**
 * Register Slack slash command handlers on the Bolt app.
 *
 * Note: The commands must also be registered in the Slack app manifest
 * at api.slack.com for them to be routed to the bot.
 */
export function registerCommands(
  app: App,
  managedChannels: Map<
    string,
    { channelId: string; userId: string; slackChannelId: string }
  >,
): void {
  const { logger } = getDeps();

  for (const cmd of COMMANDS) {
    app.command(`/${cmd.name}`, async ({ command, ack, respond }) => {
      await ack();

      // Find the eclaire channel matching this Slack channel
      let channelId: string | undefined;
      let userId: string | undefined;
      for (const meta of managedChannels.values()) {
        if (meta.slackChannelId === command.channel_id) {
          channelId = meta.channelId;
          userId = meta.userId;
          break;
        }
      }

      if (!channelId || !userId) {
        await respond({
          text: "This channel is not configured for Eclaire.",
          response_type: "ephemeral",
        });
        return;
      }

      try {
        await cmd.handler(
          async (text) => {
            await respond({ text, response_type: "ephemeral" });
          },
          channelId,
          userId,
        );
      } catch (error) {
        logger.error(
          {
            command: cmd.name,
            error: error instanceof Error ? error.message : "Unknown error",
          },
          "Error handling Slack command",
        );
        await respond({
          text: "An error occurred. Please try again.",
          response_type: "ephemeral",
        });
      }
    });
  }

  logger.info(
    { count: COMMANDS.length },
    "Slack slash command handlers registered",
  );
}

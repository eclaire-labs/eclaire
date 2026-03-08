import type { App } from "@slack/bolt";
import { getDeps } from "./deps.js";

/** Per-channel session state (in-memory, resets on bot restart). */
export interface SlackSessionData {
  sessionId?: string;
  enableThinking: boolean;
}

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
      const lines = COMMANDS.map((cmd) => `/${cmd.name} — ${cmd.description}`);
      await respond(`Available commands:\n\n${lines.join("\n")}`);
    },
  },
  {
    name: "eclaire-new",
    description: "Start a new conversation",
    handler: async (respond, channelId, userId) => {
      const { createSession } = getDeps();
      if (!createSession) {
        await respond("Session management is not available.");
        return;
      }
      try {
        const session = await createSession(userId);
        const state = getSession(channelId);
        state.sessionId = session.id;
        await respond("New conversation started.");
      } catch {
        await respond(
          "Failed to start a new conversation. Please try again.",
        );
      }
    },
  },
  {
    name: "eclaire-model",
    description: "Show current AI model",
    handler: async (respond) => {
      const { getModelInfo } = getDeps();
      if (!getModelInfo) {
        await respond("Model information is not available.");
        return;
      }
      const info = getModelInfo();
      if (!info) {
        await respond("No model is currently configured.");
        return;
      }
      await respond(
        `Current model: ${info.name}\nProvider: ${info.provider}\nModel: ${info.model}`,
      );
    },
  },
  {
    name: "eclaire-history",
    description: "Show recent conversations",
    handler: async (respond, _channelId, userId) => {
      const { listSessions } = getDeps();
      if (!listSessions) {
        await respond("Session history is not available.");
        return;
      }
      try {
        const list = await listSessions(userId, 10);
        if (list.length === 0) {
          await respond("No conversations found.");
          return;
        }
        const lines = list.map((s, i) => {
          const title =
            s.title.length > 40 ? `${s.title.slice(0, 37)}...` : s.title;
          return `${i + 1}. ${title} (${s.messageCount} msgs)`;
        });
        await respond(`Recent conversations:\n\n${lines.join("\n")}`);
      } catch {
        await respond("Failed to retrieve conversation history.");
      }
    },
  },
  {
    name: "eclaire-settings",
    description: "Toggle thinking mode",
    handler: async (respond, channelId) => {
      const state = getSession(channelId);
      state.enableThinking = !state.enableThinking;
      const label = state.enableThinking ? "ON" : "OFF";
      await respond(`Thinking mode: ${label}`);
    },
  },
  {
    name: "eclaire-clear",
    description: "Clear conversation and start fresh",
    handler: async (respond, channelId, userId) => {
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
        await respond("Conversation cleared.");
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
  managedChannels: Map<string, { channelId: string; userId: string; slackChannelId: string }>,
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

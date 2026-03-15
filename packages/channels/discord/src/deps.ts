/**
 * Dependency injection for the Discord adapter.
 *
 * The adapter needs access to backend services (AI agent, history, encryption, logger)
 * that live in the backend app. Rather than creating circular dependencies, the backend
 * injects these at startup via `setDeps()`.
 */

import type { ChannelRecord } from "@eclaire/channels-core";

/** Minimal stream event shape consumed by the Discord adapter. */
export interface StreamEvent {
  type: "thought" | "tool-call" | "text-chunk" | "error" | "done";
  content?: string;
  error?: string;
}

export interface DiscordLogger {
  info(obj: Record<string, unknown>, msg: string): void;
  info(msg: string): void;
  warn(obj: Record<string, unknown>, msg: string): void;
  error(obj: Record<string, unknown>, msg: string): void;
  error(msg: string): void;
  debug(obj: Record<string, unknown>, msg: string): void;
  debug(msg: string): void;
}

export interface DiscordDeps {
  /** Find a single channel by ID and owning user. */
  findChannel: (
    channelId: string,
    userId: string,
  ) => Promise<ChannelRecord | null>;
  /** Find a single channel by ID (for bot start/stop). */
  findChannelById: (channelId: string) => Promise<ChannelRecord | null>;
  /** Find all active channels for this platform (for startAllBots). */
  findActiveChannels: () => Promise<ChannelRecord[]>;
  encrypt: (value: string) => string;
  decrypt: (value: string) => string;
  routeChannelPrompt?: (
    userId: string,
    prompt: string,
    defaultAgentActorId: string,
  ) => Promise<{
    agentActorId: string;
    prompt: string;
    addressedAgentName?: string;
    error?: string;
  }>;
  processPromptRequest: (
    // biome-ignore lint/suspicious/noExplicitAny: signature varies by backend version
    ...args: any[]
  ) => Promise<{ response?: string; type?: string; requestId?: string }>;
  processPromptRequestStream?: (
    // biome-ignore lint/suspicious/noExplicitAny: signature varies by backend version
    ...args: any[]
  ) => Promise<ReadableStream<StreamEvent>>;
  /** Optional handler for audio/voice messages. If not provided, voice messages are handled as attachments. */
  processAudioMessage?: (
    userId: string,
    audioBuffer: Buffer,
    metadata: Record<string, unknown>,
  ) => Promise<{ response?: string; audioResponse?: Buffer }>;
  // biome-ignore lint/suspicious/noExplicitAny: signature varies by backend version
  recordHistory: (entry: any) => Promise<void>;
  logger: DiscordLogger;

  // Optional session & model deps for slash commands
  createSession?: (
    userId: string,
    title?: string,
    agentActorId?: string,
  ) => Promise<{ id: string; title: string | null }>;
  listSessions?: (
    userId: string,
    limit?: number,
    offset?: number,
    agentActorId?: string,
  ) => Promise<
    Array<{
      id: string;
      title: string | null;
      messageCount: number;
      updatedAt: Date;
    }>
  >;
  deleteSession?: (sessionId: string, userId: string) => Promise<boolean>;
  getModelInfo?: () => {
    name: string;
    provider: string;
    model: string;
  } | null;
}

let _deps: DiscordDeps | null = null;

export function setDeps(deps: DiscordDeps): void {
  _deps = deps;
}

export function getDeps(): DiscordDeps {
  if (!_deps) {
    throw new Error(
      "Discord adapter not initialized. Call initDiscordAdapter() first.",
    );
  }
  return _deps;
}

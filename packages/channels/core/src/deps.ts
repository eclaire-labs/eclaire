/**
 * Dependency injection shared by all channel adapters.
 *
 * Adapters need access to backend services (AI agent, history, encryption,
 * logger) that live in the backend app. Rather than creating circular
 * dependencies, the backend injects these at startup via each adapter's
 * `setDeps()`, created here with `createDepsHolder()`.
 */

import type { ChannelRecord } from "./types.js";

/** Minimal stream event shape consumed by channel adapters. */
export interface StreamEvent {
  type:
    | "thought"
    | "tool-call"
    | "text-chunk"
    | "error"
    | "done"
    | "approval-required"
    | "approval-resolved";
  content?: string;
  error?: string;
}

export interface ChannelLogger {
  info(obj: Record<string, unknown>, msg: string): void;
  info(msg: string): void;
  warn(obj: Record<string, unknown>, msg: string): void;
  error(obj: Record<string, unknown>, msg: string): void;
  error(msg: string): void;
  debug(obj: Record<string, unknown>, msg: string): void;
  debug(msg: string): void;
}

export interface ChannelDeps {
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
    ...args: any[]
  ) => Promise<{ response?: string; type?: string; requestId?: string }>;
  processPromptRequestStream?: (
    ...args: any[]
  ) => Promise<ReadableStream<StreamEvent>>;
  /** Optional handler for audio/voice messages. If not provided, audio is ignored. */
  processAudioMessage?: (
    userId: string,
    audioBuffer: Buffer,
    metadata: Record<string, unknown>,
  ) => Promise<{ response?: string; audioResponse?: Buffer }>;
  recordHistory: (entry: any) => Promise<void>;
  logger: ChannelLogger;

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

/**
 * Create a per-adapter deps holder. `platform` is used in the
 * not-initialized error message (e.g. "Telegram" → initTelegramAdapter()).
 */
export function createDepsHolder(platform: string): {
  setDeps: (deps: ChannelDeps) => void;
  getDeps: () => ChannelDeps;
} {
  let _deps: ChannelDeps | null = null;

  return {
    setDeps(deps: ChannelDeps): void {
      _deps = deps;
    },
    getDeps(): ChannelDeps {
      if (!_deps) {
        throw new Error(
          `${platform} adapter not initialized. Call init${platform}Adapter() first.`,
        );
      }
      return _deps;
    },
  };
}

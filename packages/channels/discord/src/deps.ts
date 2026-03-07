/**
 * Dependency injection for the Discord adapter.
 *
 * The adapter needs access to backend services (DB, AI agent, history, encryption, logger)
 * that live in the backend app. Rather than creating circular dependencies, the backend
 * injects these at startup via `setDeps()`.
 */

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
}

export interface DiscordDeps {
  // biome-ignore lint/suspicious/noExplicitAny: injected from backend, DB type varies by dialect
  db: any;
  // biome-ignore lint/suspicious/noExplicitAny: injected from backend, schema type varies by dialect
  schema: any;
  encrypt: (value: string) => string;
  decrypt: (value: string) => string;
  // biome-ignore lint/suspicious/noExplicitAny: signature varies by backend version
  processPromptRequest: (...args: any[]) => Promise<{ response?: string; type?: string; requestId?: string }>;
  // biome-ignore lint/suspicious/noExplicitAny: signature varies by backend version
  processPromptRequestStream?: (...args: any[]) => Promise<ReadableStream<StreamEvent>>;
  /** Optional handler for audio/voice messages. If not provided, voice messages are handled as attachments. */
  processAudioMessage?: (
    userId: string,
    audioBuffer: Buffer,
    metadata: Record<string, unknown>,
  ) => Promise<{ response?: string; audioResponse?: Buffer }>;
  // biome-ignore lint/suspicious/noExplicitAny: signature varies by backend version
  recordHistory: (entry: any) => Promise<void>;
  logger: DiscordLogger;
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

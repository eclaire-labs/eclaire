/**
 * Dependency injection for the Slack adapter.
 *
 * The adapter needs access to backend services (DB, AI agent, history, encryption, logger)
 * that live in the backend app. Rather than creating circular dependencies, the backend
 * injects these at startup via `setDeps()`.
 */

/** Minimal stream event shape consumed by the Slack adapter. */
export interface StreamEvent {
  type: "thought" | "tool-call" | "text-chunk" | "error" | "done";
  content?: string;
  error?: string;
}

export interface SlackLogger {
  info(obj: Record<string, unknown>, msg: string): void;
  info(msg: string): void;
  warn(obj: Record<string, unknown>, msg: string): void;
  error(obj: Record<string, unknown>, msg: string): void;
  error(msg: string): void;
  debug(obj: Record<string, unknown>, msg: string): void;
}

export interface SlackDeps {
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
  // biome-ignore lint/suspicious/noExplicitAny: signature varies by backend version
  recordHistory: (entry: any) => Promise<void>;
  logger: SlackLogger;

  // Optional session & model deps for slash commands
  createSession?: (userId: string, title?: string) => Promise<{ id: string; title: string }>;
  listSessions?: (
    userId: string,
    limit?: number,
    offset?: number,
  ) => Promise<
    Array<{
      id: string;
      title: string;
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

let _deps: SlackDeps | null = null;

export function setDeps(deps: SlackDeps): void {
  _deps = deps;
}

export function getDeps(): SlackDeps {
  if (!_deps) {
    throw new Error(
      "Slack adapter not initialized. Call initSlackAdapter() first.",
    );
  }
  return _deps;
}

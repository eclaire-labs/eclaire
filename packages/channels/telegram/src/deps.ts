/**
 * Dependency injection for the Telegram adapter.
 *
 * The adapter needs access to backend services (DB, AI agent, history, encryption, logger)
 * that live in the backend app. Rather than creating circular dependencies, the backend
 * injects these at startup via `setDeps()`.
 */

export interface TelegramLogger {
  info(obj: Record<string, unknown>, msg: string): void;
  info(msg: string): void;
  warn(obj: Record<string, unknown>, msg: string): void;
  error(obj: Record<string, unknown>, msg: string): void;
  error(msg: string): void;
  debug(obj: Record<string, unknown>, msg: string): void;
}

export interface TelegramDeps {
  // biome-ignore lint/suspicious/noExplicitAny: injected from backend, DB type varies by dialect
  db: any;
  // biome-ignore lint/suspicious/noExplicitAny: injected from backend, schema type varies by dialect
  schema: any;
  encrypt: (value: string) => string;
  decrypt: (value: string) => string;
  // biome-ignore lint/suspicious/noExplicitAny: signature varies by backend version
  processPromptRequest: (...args: any[]) => Promise<{ response?: string; type?: string; requestId?: string }>;
  // biome-ignore lint/suspicious/noExplicitAny: signature varies by backend version
  recordHistory: (entry: any) => Promise<void>;
  logger: TelegramLogger;
}

let _deps: TelegramDeps | null = null;

export function setDeps(deps: TelegramDeps): void {
  _deps = deps;
}

export function getDeps(): TelegramDeps {
  if (!_deps) {
    throw new Error(
      "Telegram adapter not initialized. Call initTelegramAdapter() first.",
    );
  }
  return _deps;
}

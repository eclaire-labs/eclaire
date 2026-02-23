/**
 * Debug Logger
 *
 * Simple file-based debug logging for AI requests/responses.
 * Writes JSON lines to a file for easy debugging without polluting console.
 */

import * as fs from "node:fs";
import * as path from "node:path";

// Module-level state
let _debugLogPath: string | null = null;

/**
 * Set the debug log file path (called by initAI)
 * @internal
 */
export function setDebugLogPath(logPath: string | undefined): void {
  _debugLogPath = logPath || null;
}

/**
 * Clear the debug log path (called by resetAI)
 * @internal
 */
export function clearDebugLogPath(): void {
  _debugLogPath = null;
}

/**
 * Check if debug logging is enabled
 */
export function isDebugLoggingEnabled(): boolean {
  return _debugLogPath !== null;
}

/**
 * Debug log entry structure
 */
export interface DebugLogEntry {
  timestamp: string;
  type: "request" | "response" | "error";
  aiContext: string;
  modelId: string;
  provider: string;
  durationMs?: number;
  estimatedInputTokens?: number;
  streaming?: boolean;
  // Application context passed via debugContext option
  appContext?: Record<string, unknown>;
  request?: {
    messages: unknown[];
    options?: Record<string, unknown>;
  };
  response?: {
    content?: string;
    reasoning?: string;
    toolCalls?: unknown[];
    usage?: unknown;
    finishReason?: string;
  };
  error?: string;
}

/**
 * Log a debug entry to the file
 * No-op if debug logging is not configured
 */
export function logDebugEntry(entry: DebugLogEntry): void {
  if (!_debugLogPath) {
    return;
  }

  try {
    // Ensure directory exists
    const dir = path.dirname(_debugLogPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Append JSON line
    const line = `${JSON.stringify(entry)}\n`;
    fs.appendFileSync(_debugLogPath, line, "utf-8");
  } catch (error) {
    // Silently fail - we don't want debug logging to break the app
    console.error(
      "[ai-debug] Failed to write debug log:",
      error instanceof Error ? error.message : error,
    );
  }
}

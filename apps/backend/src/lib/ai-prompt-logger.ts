import * as fs from "fs/promises";
import * as path from "path";
import type {
  Trace,
  TraceAICall,
  TraceContext,
  TraceToolCall,
} from "../schemas/prompt-params.js";
import type { ToolCallSummary } from "../schemas/prompt-responses.js";
import { createChildLogger } from "./logger.js";
import { config } from "../config/index.js";

const logger = createChildLogger("ai-prompt-logger");

// AI Prompt Log Data Structure (based on LLM replay format)
export interface AIPromptLogMetadata {
  requestId: string;
  userId: string;
  conversationId?: string;
  isStreaming: boolean;
  hasAssets: boolean;
  assetCount: number;
  enableThinking?: boolean;
  timestamp: string;
  timing: {
    startedAt: string;
    endedAt: string;
    durationMs: number;
  };
}

export interface AIPromptLogEntry {
  metadata: AIPromptLogMetadata;
  context: TraceContext;
  request: {
    prompt: string;
    context?: any; // User-provided context (assets, etc.)
  };
  aiCalls: TraceAICall[];
  toolCalls: TraceToolCall[];
  response: {
    type: "text_response";
    content: string;
    thinkingContent?: string | null;
    toolCallSummaries?: ToolCallSummary[];
  };
  summary: {
    totalExecutionTimeMs: number;
    totalAiCalls: number;
    totalToolCalls: number;
    totalAiResponseTimeMs: number;
    totalToolExecutionTimeMs: number;
  };
}

export class AIPromptLogger {
  private static instance: AIPromptLogger | null = null;
  private readonly logsDir: string;
  private readonly isEnabled: boolean;

  private constructor() {
    this.logsDir = path.join(config.dirs.logs, "backend-ai");
    this.isEnabled = config.ai.promptLoggingEnabled;

    if (this.isEnabled) {
      logger.info({ logsDir: this.logsDir }, "AI Prompt logging enabled");
      this.ensureLogDirectory();
    } else {
      logger.debug("AI Prompt logging disabled");
    }
  }

  public static getInstance(): AIPromptLogger {
    if (!AIPromptLogger.instance) {
      AIPromptLogger.instance = new AIPromptLogger();
    }
    return AIPromptLogger.instance;
  }

  private async ensureLogDirectory(): Promise<void> {
    try {
      await fs.mkdir(this.logsDir, { recursive: true });
    } catch (error) {
      logger.error(
        {
          error: error instanceof Error ? error.message : "Unknown error",
          logsDir: this.logsDir,
        },
        "Failed to create AI prompt logs directory",
      );
    }
  }

  /**
   * Generate a filename for the log entry based on metadata
   */
  private generateFilename(metadata: AIPromptLogMetadata): string {
    const timestamp = new Date(metadata.timestamp)
      .toISOString()
      .replace(/[:.]/g, "-");
    const streamSuffix = metadata.isStreaming ? "stream-true" : "stream-false";
    const assetSuffix = metadata.hasAssets
      ? `assets-${metadata.assetCount}`
      : "no-assets";
    const thinkingSuffix = metadata.enableThinking
      ? "thinking-on"
      : "thinking-off";

    return `${timestamp}_${metadata.requestId}_${streamSuffix}_${assetSuffix}_${thinkingSuffix}.json`;
  }

  /**
   * Log a complete AI prompt interaction
   */
  public async logInteraction(
    requestId: string,
    userId: string,
    prompt: string,
    context: any,
    trace: Trace,
    response: {
      type: "text_response";
      response: string;
      thinkingContent?: string | null;
      toolCalls?: ToolCallSummary[];
    },
    metadata: {
      conversationId?: string;
      isStreaming: boolean;
      hasAssets: boolean;
      assetCount: number;
      enableThinking?: boolean;
      startTime: number;
      endTime: number;
    },
  ): Promise<void> {
    if (!this.isEnabled) {
      return;
    }

    try {
      const logMetadata: AIPromptLogMetadata = {
        requestId,
        userId,
        conversationId: metadata.conversationId,
        isStreaming: metadata.isStreaming,
        hasAssets: metadata.hasAssets,
        assetCount: metadata.assetCount,
        enableThinking: metadata.enableThinking,
        timestamp: new Date(metadata.startTime).toISOString(),
        timing: {
          startedAt: new Date(metadata.startTime).toISOString(),
          endedAt: new Date(metadata.endTime).toISOString(),
          durationMs: metadata.endTime - metadata.startTime,
        },
      };

      const logEntry: AIPromptLogEntry = {
        metadata: logMetadata,
        context: trace.context,
        request: {
          prompt,
          context, // This includes assets and other context
        },
        aiCalls: trace.aiCalls,
        toolCalls: trace.toolCalls,
        response: {
          type: "text_response",
          content: response.response,
          thinkingContent: response.thinkingContent,
          toolCallSummaries: response.toolCalls,
        },
        summary: trace.summary,
      };

      const filename = this.generateFilename(logMetadata);
      const filepath = path.join(this.logsDir, filename);

      await this.ensureLogDirectory();
      await fs.writeFile(filepath, JSON.stringify(logEntry, null, 2), "utf-8");

      logger.info(
        {
          requestId,
          userId,
          filename,
          durationMs: logMetadata.timing.durationMs,
          aiCalls: trace.summary.totalAiCalls,
          toolCalls: trace.summary.totalToolCalls,
          isStreaming: metadata.isStreaming,
          hasAssets: metadata.hasAssets,
        },
        "AI prompt interaction logged successfully",
      );
    } catch (error) {
      logger.error(
        {
          requestId,
          userId,
          error: error instanceof Error ? error.message : "Unknown error",
          stack: error instanceof Error ? error.stack : undefined,
        },
        "Failed to log AI prompt interaction",
      );
    }
  }

  /**
   * Check if logging is enabled
   */
  public isLoggingEnabled(): boolean {
    return this.isEnabled;
  }

  /**
   * Get the logs directory path
   */
  public getLogsDirectory(): string {
    return this.logsDir;
  }

  /**
   * List all log files
   */
  public async listLogFiles(): Promise<string[]> {
    if (!this.isEnabled) {
      return [];
    }

    try {
      await this.ensureLogDirectory();
      const files = await fs.readdir(this.logsDir);
      return files.filter((file) => file.endsWith(".json")).sort();
    } catch (error) {
      logger.error(
        {
          error: error instanceof Error ? error.message : "Unknown error",
          logsDir: this.logsDir,
        },
        "Failed to list log files",
      );
      return [];
    }
  }

  /**
   * Read a specific log file
   */
  public async readLogFile(filename: string): Promise<AIPromptLogEntry | null> {
    if (!this.isEnabled) {
      return null;
    }

    try {
      const filepath = path.join(this.logsDir, filename);
      const content = await fs.readFile(filepath, "utf-8");
      return JSON.parse(content) as AIPromptLogEntry;
    } catch (error) {
      logger.error(
        {
          filename,
          error: error instanceof Error ? error.message : "Unknown error",
        },
        "Failed to read log file",
      );
      return null;
    }
  }
}

// Export singleton instance
export const aiPromptLogger = AIPromptLogger.getInstance();

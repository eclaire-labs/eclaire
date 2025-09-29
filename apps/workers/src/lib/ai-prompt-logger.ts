import * as fs from "fs/promises";
import * as path from "path";
import { createChildLogger } from "./logger";

const logger = createChildLogger("ai-prompt-logger-workers");

// AI Prompt Log Data Structure for Workers (based on LLM replay format)
export interface AIPromptLogMetadata {
  requestId: string;
  userId?: string;
  jobId?: string;
  jobType?: string;
  workerType?: string;
  timestamp: string;
  timing: {
    startedAt: string;
    endedAt: string;
    durationMs: number;
  };
}

export interface TraceContext {
  aiProvider: string;
  aiBaseURL: string;
  aiModel: string;
  hasApiKey: boolean;
}

export interface TraceAICall {
  callIndex: number;
  timestamp: string;
  requestBody: {
    url: string;
    method: string;
    headers: Record<string, any>;
    body: Record<string, any>;
  };
  responseBody: Record<string, any>;
  durationMs: number;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  estimatedInputTokens?: number;
}

export interface TraceSummary {
  totalExecutionTimeMs: number;
  totalAiCalls: number;
  totalAiResponseTimeMs: number;
}

export interface AIPromptLogEntry {
  metadata: AIPromptLogMetadata;
  context: TraceContext;
  request: {
    messages: any[];
    options?: any;
  };
  aiCalls: TraceAICall[];
  response: {
    type: "text_response";
    content: string;
  };
  summary: TraceSummary;
}

export class AIPromptLogger {
  private static instance: AIPromptLogger | null = null;
  private readonly logsDir: string;
  private readonly isEnabled: boolean;

  private constructor() {
    // Use the LOGS_DIR environment variable if available, otherwise fallback to relative path
    const logsDir =
      process.env.LOGS_DIR ||
      path.join(__dirname, "..", "..", "..", "..", "data", "logs");
    this.logsDir = path.join(logsDir, "workers-ai");
    this.isEnabled = process.env.AI_PROMPT_LOGGING_ENABLED === "true";

    if (this.isEnabled) {
      logger.info(
        { logsDir: this.logsDir },
        "Workers AI Prompt logging enabled",
      );
      this.ensureLogDirectory();
    } else {
      logger.debug("Workers AI Prompt logging disabled");
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
        "Failed to create workers AI prompt logs directory",
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

    const parts = [timestamp, metadata.requestId];

    if (metadata.jobType) {
      parts.push(`job-${metadata.jobType}`);
    }

    if (metadata.workerType) {
      parts.push(`worker-${metadata.workerType}`);
    }

    return `${parts.join("_")}.json`;
  }

  /**
   * Log a complete AI prompt interaction from workers
   */
  public async logInteraction(
    requestId: string,
    messages: any[],
    options: any,
    context: TraceContext,
    aiCall: TraceAICall,
    response: string,
    metadata: {
      userId?: string;
      jobId?: string;
      jobType?: string;
      workerType?: string;
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
        userId: metadata.userId,
        jobId: metadata.jobId,
        jobType: metadata.jobType,
        workerType: metadata.workerType,
        timestamp: new Date(metadata.startTime).toISOString(),
        timing: {
          startedAt: new Date(metadata.startTime).toISOString(),
          endedAt: new Date(metadata.endTime).toISOString(),
          durationMs: metadata.endTime - metadata.startTime,
        },
      };

      const logEntry: AIPromptLogEntry = {
        metadata: logMetadata,
        context,
        request: {
          messages,
          options,
        },
        aiCalls: [aiCall],
        response: {
          type: "text_response",
          content: response,
        },
        summary: {
          totalExecutionTimeMs: logMetadata.timing.durationMs,
          totalAiCalls: 1,
          totalAiResponseTimeMs: aiCall.durationMs,
        },
      };

      const filename = this.generateFilename(logMetadata);
      const filepath = path.join(this.logsDir, filename);

      await this.ensureLogDirectory();
      await fs.writeFile(filepath, JSON.stringify(logEntry, null, 2), "utf-8");

      logger.info(
        {
          requestId,
          userId: metadata.userId,
          jobId: metadata.jobId,
          jobType: metadata.jobType,
          workerType: metadata.workerType,
          filename,
          durationMs: logMetadata.timing.durationMs,
          aiResponseTimeMs: aiCall.durationMs,
          responseLength: response.length,
        },
        "Workers AI prompt interaction logged successfully",
      );
    } catch (error) {
      logger.error(
        {
          requestId,
          userId: metadata.userId,
          jobId: metadata.jobId,
          jobType: metadata.jobType,
          error: error instanceof Error ? error.message : "Unknown error",
          stack: error instanceof Error ? error.stack : undefined,
        },
        "Failed to log workers AI prompt interaction",
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
        "Failed to list workers log files",
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
        "Failed to read workers log file",
      );
      return null;
    }
  }
}

// Export singleton instance
export const aiPromptLogger = AIPromptLogger.getInstance();

/**
 * JSON-RPC Transport
 *
 * Bidirectional JSON-RPC 2.0 transport over a ChildProcess's stdin/stdout.
 * Handles request/response correlation, notification dispatch, and line buffering.
 */

import type { ChildProcess } from "node:child_process";
import { createLazyLogger, getErrorMessage } from "../../logger.js";
import type {
  JsonRpcError,
  JsonRpcMessage,
  JsonRpcNotification,
  JsonRpcRequest,
  JsonRpcResponse,
  NotificationHandler,
  ServerRequestHandler,
} from "./types.js";

const getLogger = createLazyLogger("jsonrpc-transport");

const DEFAULT_REQUEST_TIMEOUT = 30_000; // 30 seconds

// =============================================================================
// PENDING REQUEST TRACKING
// =============================================================================

interface PendingRequest {
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

// =============================================================================
// JSON-RPC TRANSPORT
// =============================================================================

export class JsonRpcTransport {
  private nextId = 1;
  private readonly pending = new Map<number, PendingRequest>();
  private buffer = "";
  private closed = false;

  onNotification: NotificationHandler | null = null;
  onServerRequest: ServerRequestHandler | null = null;

  constructor(
    private readonly proc: ChildProcess,
    private readonly requestTimeout = DEFAULT_REQUEST_TIMEOUT,
  ) {
    this.setupStdoutReader();
    this.setupProcessHandlers();
  }

  // ===========================================================================
  // PUBLIC API
  // ===========================================================================

  /**
   * Send a JSON-RPC request and wait for the matching response.
   */
  async sendRequest<T = unknown>(
    method: string,
    params?: Record<string, unknown>,
  ): Promise<T> {
    if (this.closed) {
      throw new Error("Transport is closed");
    }

    const id = this.nextId++;
    const request: JsonRpcRequest = {
      jsonrpc: "2.0",
      id,
      method,
      ...(params !== undefined ? { params } : {}),
    };

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(
          new Error(
            `JSON-RPC request "${method}" (id=${id}) timed out after ${this.requestTimeout}ms`,
          ),
        );
      }, this.requestTimeout);

      this.pending.set(id, {
        resolve: resolve as (result: unknown) => void,
        reject,
        timer,
      });

      this.writeLine(request);
    });
  }

  /**
   * Send a JSON-RPC notification (no response expected).
   */
  sendNotification(method: string, params?: Record<string, unknown>): void {
    if (this.closed) {
      throw new Error("Transport is closed");
    }

    const notification: JsonRpcNotification = {
      jsonrpc: "2.0",
      method,
      ...(params !== undefined ? { params } : {}),
    };

    this.writeLine(notification);
  }

  /**
   * Send a JSON-RPC response (for server-initiated requests like approvals).
   */
  sendResponse(id: number, result: unknown): void {
    if (this.closed) {
      throw new Error("Transport is closed");
    }

    const response: JsonRpcResponse = {
      jsonrpc: "2.0",
      id,
      result,
    };

    this.writeLine(response);
  }

  /**
   * Register a handler for server-initiated notifications.
   */
  setNotificationHandler(handler: NotificationHandler): void {
    this.onNotification = handler;
  }

  /**
   * Register a handler for server-initiated requests (e.g., approval requests).
   */
  setServerRequestHandler(handler: ServerRequestHandler): void {
    this.onServerRequest = handler;
  }

  /**
   * Close the transport and reject all pending requests.
   */
  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.rejectAllPending(new Error("Transport closed"));
  }

  get isClosed(): boolean {
    return this.closed;
  }

  // ===========================================================================
  // INTERNAL
  // ===========================================================================

  private writeLine(message: JsonRpcMessage): void {
    const logger = getLogger();
    try {
      const line = JSON.stringify(message);
      logger.debug(
        {
          method: (message as { method?: string }).method,
          id: (message as { id?: number }).id,
        },
        "Sending JSON-RPC message",
      );
      this.proc.stdin?.write(`${line}\n`);
    } catch (error) {
      logger.error(
        { error: getErrorMessage(error) },
        "Failed to write JSON-RPC message",
      );
    }
  }

  private setupStdoutReader(): void {
    const logger = getLogger();

    this.proc.stdout?.on("data", (chunk: Buffer) => {
      this.buffer += chunk.toString();

      const lines = this.buffer.split("\n");
      this.buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        try {
          const message = JSON.parse(trimmed) as JsonRpcMessage;
          this.handleMessage(message);
        } catch (error) {
          logger.warn(
            { line: trimmed, error: getErrorMessage(error) },
            "Failed to parse JSON-RPC message",
          );
        }
      }
    });
  }

  private setupProcessHandlers(): void {
    const logger = getLogger();

    this.proc.on("exit", (code, signal) => {
      logger.debug({ code, signal }, "App-server process exited");
      this.closed = true;
      this.rejectAllPending(
        new Error(
          `App-server process exited with code ${code}${signal ? ` (signal: ${signal})` : ""}`,
        ),
      );
    });

    this.proc.on("error", (error) => {
      logger.error(
        { error: getErrorMessage(error) },
        "App-server process error",
      );
      this.closed = true;
      this.rejectAllPending(error);
    });
  }

  private handleMessage(message: JsonRpcMessage): void {
    const logger = getLogger();

    // Response to a request we sent
    if ("id" in message && ("result" in message || "error" in message)) {
      const response = message as JsonRpcResponse;
      const pending = this.pending.get(response.id);
      if (pending) {
        this.pending.delete(response.id);
        clearTimeout(pending.timer);

        if (response.error) {
          const rpcError = response.error as JsonRpcError;
          pending.reject(
            new Error(`JSON-RPC error (${rpcError.code}): ${rpcError.message}`),
          );
        } else {
          pending.resolve(response.result);
        }
      } else {
        logger.warn(
          { id: response.id },
          "Received response for unknown request ID",
        );
      }
      return;
    }

    // Server-initiated request (has id + method, no result/error)
    if ("id" in message && "method" in message && !("result" in message)) {
      const request = message as JsonRpcRequest;
      logger.debug(
        { method: request.method, id: request.id },
        "Received server-initiated request",
      );
      if (this.onServerRequest) {
        this.onServerRequest(request.method, request.params ?? {}, request.id);
      }
      return;
    }

    // Notification (has method, no id)
    if ("method" in message && !("id" in message)) {
      const notification = message as JsonRpcNotification;
      logger.debug({ method: notification.method }, "Received notification");
      if (this.onNotification) {
        this.onNotification(notification.method, notification.params ?? {});
      }
      return;
    }

    logger.warn({ message }, "Unrecognized JSON-RPC message");
  }

  private rejectAllPending(error: Error): void {
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(error);
      this.pending.delete(id);
    }
  }
}

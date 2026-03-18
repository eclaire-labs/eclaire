import React from "react";

// Streaming event types from backend
export interface StreamEvent {
  type:
    | "thought"
    | "tool-call"
    | "text-chunk"
    | "error"
    | "done"
    | "approval-required"
    | "approval-resolved";
  timestamp?: string;
  content?: string;
  /** Tool call ID — used for tracking parallel tool executions */
  id?: string;
  name?: string;
  status?: "starting" | "executing" | "completed" | "error";
  // biome-ignore lint/suspicious/noExplicitAny: tool call arguments are arbitrary JSON from AI tools
  arguments?: Record<string, any>;
  // biome-ignore lint/suspicious/noExplicitAny: tool call results vary by tool type
  result?: any;
  error?: string;
  requestId?: string;
  conversationId?: string;
  totalTokens?: number;
  executionTimeMs?: number;
  /** Human-readable tool label (for approval events) */
  label?: string;
  /** Whether the approval was granted (for approval-resolved events) */
  approved?: boolean;
  /** Reason for approval/denial */
  reason?: string;
}

// Streaming request interface
export interface StreamingRequest {
  sessionId: string;
  prompt: string;
  context?: {
    agentActorId?: string;
    assets?: Array<{
      type: "note" | "bookmark" | "document" | "photo" | "task";
      id: string;
    }>;
  };
  enableThinking?: boolean;
}

// Event handlers interface
export interface StreamEventHandlers {
  onThought?: (content: string, timestamp?: string) => void;
  onToolCall?: (
    id: string | undefined,
    name: string,
    status: "starting" | "executing" | "completed" | "error",
    // biome-ignore lint/suspicious/noExplicitAny: tool call arguments are arbitrary JSON from AI tools
    args?: Record<string, any>,
    // biome-ignore lint/suspicious/noExplicitAny: tool call results vary by tool type
    result?: any,
    error?: string,
  ) => void;
  onApprovalRequired?: (
    id: string,
    name: string,
    label: string,
    // biome-ignore lint/suspicious/noExplicitAny: tool call arguments are arbitrary JSON from AI tools
    args: Record<string, any>,
  ) => void;
  onApprovalResolved?: (
    id: string,
    name: string,
    approved: boolean,
    reason?: string,
  ) => void;
  onTextChunk?: (content: string, timestamp?: string) => void;
  onError?: (error: string, timestamp?: string) => void;
  onDone?: (
    requestId?: string,
    conversationId?: string,
    totalTokens?: number,
    executionTimeMs?: number,
  ) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
}

// Streaming client class
export class StreamingClient {
  private abortController: AbortController | null = null;
  private handlers: StreamEventHandlers = {};
  private isConnected = false;

  constructor(handlers: StreamEventHandlers = {}) {
    this.handlers = handlers;
  }

  /**
   * Start streaming a prompt request
   */
  async startStream(request: StreamingRequest): Promise<void> {
    // Close any existing connection
    this.disconnect();

    this.abortController = new AbortController();

    try {
      // Make the initial request to get the streaming response
      const { sessionId, ...body } = request;
      const response = await fetch(`/api/sessions/${sessionId}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: this.abortController.signal,
        credentials: "include",
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      // Check if response is actually a stream
      const contentType = response.headers.get("content-type");

      if (!contentType?.includes("text/event-stream")) {
        // If we got JSON, try to parse it and show as an error
        if (contentType?.includes("application/json")) {
          const responseText = await response.text();
          try {
            const jsonResponse = JSON.parse(responseText);
            this.handlers.onError?.(
              `Expected streaming but got JSON: ${JSON.stringify(jsonResponse)}`,
            );
            return;
          } catch {
            // Fall through
          }
        }

        throw new Error(`Expected streaming response but got: ${contentType}`);
      }

      // Parse the streaming response manually since EventSource doesn't work with POST
      await this.parseStreamingResponse(response);
    } catch (error) {
      // Don't report abort as an error — it's an intentional disconnect
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }
      this.handlers.onError?.(
        error instanceof Error ? error.message : "Failed to start streaming",
      );
    }
  }

  /**
   * Manually parse the streaming response
   */
  private async parseStreamingResponse(response: Response): Promise<void> {
    if (!response.body) {
      throw new Error("No response body available for streaming");
    }

    this.isConnected = true;
    this.handlers.onConnect?.();

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        const chunk = decoder.decode(value, { stream: true });
        buffer += chunk;
        const lines = buffer.split("\n");
        buffer = lines.pop() || ""; // Keep incomplete line in buffer

        for (const line of lines) {
          if (line.trim() === "") {
            continue;
          }

          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            if (data.trim() === "") {
              continue;
            }

            try {
              const event = JSON.parse(data) as StreamEvent;
              this.handleEvent(event);

              // Stop reading when we get a done event
              if (event.type === "done") {
                return;
              }
            } catch {
              console.warn("Failed to parse SSE event:", data);
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
      this.isConnected = false;
      this.handlers.onDisconnect?.();
    }
  }

  /**
   * Handle individual stream events
   */
  private handleEvent(event: StreamEvent): void {
    switch (event.type) {
      case "thought":
        if (event.content) {
          this.handlers.onThought?.(event.content, event.timestamp);
        }
        break;

      case "tool-call":
        if (event.name && event.status) {
          this.handlers.onToolCall?.(
            event.id,
            event.name,
            event.status,
            event.arguments,
            event.result,
            event.error,
          );
        }
        break;

      case "approval-required":
        if (event.id && event.name) {
          this.handlers.onApprovalRequired?.(
            event.id,
            event.name,
            event.label ?? event.name,
            event.arguments ?? {},
          );
        }
        break;

      case "approval-resolved":
        if (event.id && event.name) {
          this.handlers.onApprovalResolved?.(
            event.id,
            event.name,
            event.approved ?? false,
            event.reason,
          );
        }
        break;

      case "text-chunk":
        if (event.content) {
          this.handlers.onTextChunk?.(event.content, event.timestamp);
        }
        break;

      case "error":
        if (event.error) {
          this.handlers.onError?.(event.error, event.timestamp);
        }
        break;

      case "done":
        this.handlers.onDone?.(
          event.requestId,
          event.conversationId,
          event.totalTokens,
          event.executionTimeMs,
        );
        break;

      default:
        console.warn(
          "Unknown stream event type:",
          (event as unknown as Record<string, unknown>).type,
        );
    }
  }

  /**
   * Disconnect from the stream
   */
  disconnect(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    this.isConnected = false;
    this.handlers.onDisconnect?.();
  }

  /**
   * Check if currently connected
   */
  isStreamConnected(): boolean {
    return this.isConnected;
  }

  /**
   * Update event handlers
   */
  updateHandlers(handlers: Partial<StreamEventHandlers>): void {
    this.handlers = { ...this.handlers, ...handlers };
  }
}

// React hook for easier integration
export function useStreamingClient(handlers: StreamEventHandlers = {}) {
  // Use a ref for handlers so the client always calls the latest version
  // without needing an effect that fires every render
  const handlersRef = React.useRef(handlers);
  handlersRef.current = handlers;

  const clientRef = React.useRef<StreamingClient | null>(null);

  // Initialize client on first use with stable proxy handlers
  if (!clientRef.current) {
    clientRef.current = new StreamingClient({
      onThought: (...args) => handlersRef.current.onThought?.(...args),
      onToolCall: (...args) => handlersRef.current.onToolCall?.(...args),
      onApprovalRequired: (...args) =>
        handlersRef.current.onApprovalRequired?.(...args),
      onApprovalResolved: (...args) =>
        handlersRef.current.onApprovalResolved?.(...args),
      onTextChunk: (...args) => handlersRef.current.onTextChunk?.(...args),
      onError: (...args) => handlersRef.current.onError?.(...args),
      onDone: (...args) => handlersRef.current.onDone?.(...args),
      onConnect: () => handlersRef.current.onConnect?.(),
      onDisconnect: () => handlersRef.current.onDisconnect?.(),
    });
  }

  // Cleanup on unmount
  React.useEffect(() => {
    return () => {
      clientRef.current?.disconnect();
    };
  }, []);

  return {
    startStream: (request: StreamingRequest) =>
      clientRef.current?.startStream(request),
    disconnect: () => clientRef.current?.disconnect(),
    isConnected: () => clientRef.current?.isStreamConnected() ?? false,
  };
}

import React from "react";

// Streaming event types from backend
export interface StreamEvent {
  type: "thought" | "tool-call" | "text-chunk" | "error" | "done";
  timestamp?: string;
  content?: string;
  name?: string;
  status?: "starting" | "executing" | "completed" | "error";
  arguments?: Record<string, any>;
  result?: any;
  error?: string;
  requestId?: string;
  conversationId?: string;
  totalTokens?: number;
  executionTimeMs?: number;
}

// Streaming request interface
export interface StreamingRequest {
  prompt: string;
  conversationId?: string;
  context?: {
    agent?: string;
    assets?: Array<{
      type: "note" | "bookmark" | "document" | "photo" | "task";
      id: string;
    }>;
  };
  deviceInfo?: {
    userAgent?: string;
    dateTime?: string;
    timeZone?: string;
    screenWidth?: string;
    screenHeight?: string;
    app?: { name: string; version: string };
  };
  trace?: boolean;
  enableThinking?: boolean;
}

// Event handlers interface
export interface StreamEventHandlers {
  onThought?: (content: string, timestamp?: string) => void;
  onToolCall?: (
    name: string,
    status: "starting" | "executing" | "completed" | "error",
    args?: Record<string, any>,
    result?: any,
    error?: string,
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
  private eventSource: EventSource | null = null;
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

    console.log("🚀 Starting stream request:", {
      url: "/api/prompt/stream",
      method: "POST",
      request: request,
    });

    try {
      // Make the initial request to get the streaming response
      const response = await fetch("/api/prompt/stream", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(request),
      });

      console.log("📡 Stream response received:", {
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
        url: response.url,
      });

      if (!response.ok) {
        console.error(
          "❌ Stream response not OK:",
          response.status,
          response.statusText,
        );
        const errorData = await response.json();
        console.error("❌ Error data:", errorData);
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      // Check if response is actually a stream
      const contentType = response.headers.get("content-type");
      console.log("📋 Response content-type:", contentType);

      if (!contentType?.includes("text/event-stream")) {
        console.error("❌ Expected streaming response but got:", contentType);
        // Let's see what we actually got
        const responseText = await response.text();
        console.error("❌ Response body:", responseText);

        // If we got JSON, try to parse it and show as an error
        if (contentType?.includes("application/json")) {
          try {
            const jsonResponse = JSON.parse(responseText);
            console.error("❌ Received JSON instead of stream:", jsonResponse);
            this.handlers.onError?.(
              `Expected streaming but got JSON: ${JSON.stringify(jsonResponse)}`,
            );
            return;
          } catch (e) {
            console.error("❌ Failed to parse JSON response:", e);
          }
        }

        throw new Error("Expected streaming response but got: " + contentType);
      }

      console.log("✅ Valid streaming response, starting to parse...");
      // Parse the streaming response manually since EventSource doesn't work with POST
      await this.parseStreamingResponse(response);
    } catch (error) {
      console.error("❌ Failed to start streaming:", error);
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

    console.log("📖 Starting to parse streaming response...");
    this.isConnected = true;
    this.handlers.onConnect?.();

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let eventCount = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          console.log(
            "📡 Stream completed, total events processed:",
            eventCount,
          );
          break;
        }

        const chunk = decoder.decode(value, { stream: true });
        console.log("📦 Received chunk:", chunk.length, "bytes");
        console.log("🔍 Raw chunk data:", JSON.stringify(chunk));
        console.log("📝 Chunk preview:", chunk.substring(0, 200));

        buffer += chunk;
        const lines = buffer.split("\n");
        buffer = lines.pop() || ""; // Keep incomplete line in buffer

        console.log("📝 Processing", lines.length, "lines from buffer");
        console.log(
          "📋 Lines array:",
          lines.map((line, i) => `${i}: ${JSON.stringify(line)}`),
        );

        for (const line of lines) {
          if (line.trim() === "") {
            console.log("⬜ Skipping empty line");
            continue;
          }
          console.log("📄 Processing line:", JSON.stringify(line));

          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            if (data.trim() === "") {
              console.log("⬜ Skipping empty data line");
              continue;
            }

            console.log("🎯 Parsing SSE event data:", JSON.stringify(data));
            try {
              const event = JSON.parse(data) as StreamEvent;
              console.log("✅ Successfully parsed event:", event.type, event);
              this.handleEvent(event);
              eventCount++;

              // Stop reading when we get a done event
              if (event.type === "done") {
                console.log("🏁 Received done event, stopping stream");
                return;
              }
            } catch (parseError) {
              console.warn(
                "❌ Failed to parse SSE event:",
                JSON.stringify(data),
                parseError,
              );
              console.warn("❌ Parse error details:", parseError);
            }
          } else {
            console.log("⚠️ Non-data line:", JSON.stringify(line));
          }
        }
      }
    } finally {
      reader.releaseLock();
      this.isConnected = false;
      this.handlers.onDisconnect?.();
      console.log(
        "🔌 Stream disconnected, total events processed:",
        eventCount,
      );
    }
  }

  /**
   * Handle individual stream events
   */
  private handleEvent(event: StreamEvent): void {
    console.log("📡 Received stream event:", event.type, event);

    switch (event.type) {
      case "thought":
        if (event.content) {
          this.handlers.onThought?.(event.content, event.timestamp);
        }
        break;

      case "tool-call":
        if (event.name && event.status) {
          this.handlers.onToolCall?.(
            event.name,
            event.status,
            event.arguments,
            event.result,
            event.error,
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
        console.warn("Unknown stream event type:", (event as any).type);
    }
  }

  /**
   * Disconnect from the stream
   */
  disconnect(): void {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
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
  const clientRef = React.useRef<StreamingClient | null>(null);

  // Initialize client on first use
  if (!clientRef.current) {
    clientRef.current = new StreamingClient(handlers);
  }

  // Update handlers when they change
  React.useEffect(() => {
    clientRef.current?.updateHandlers(handlers);
  }, [handlers]);

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
